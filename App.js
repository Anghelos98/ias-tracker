import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polygon } from 'react-native-maps';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClusterMarker, DOT_HIT_RADIUS, DotMarker, clusterSize } from './src/components/MapMarkers';
import PointCard from './src/components/PointCard';
import FiltersPanel, { describeFilters } from './src/components/FiltersPanel';
import NearbyPanel from './src/components/NearbyPanel';
import ExportSection from './src/components/ExportSection';
import WelcomeScreen from './src/components/WelcomeScreen';
import SpeciesPanel from './src/components/SpeciesPanel';
import SpeciesSheet from './src/components/SpeciesSheet';
import ReportScreen from './src/components/ReportScreen';
import Notebook from './src/components/Notebook';
import RegionReport from './src/components/RegionReport';
import { CLUSTER_MAX_ZOOM, useClusters } from './src/hooks/useClusters';
import {
  checkForUpdates,
  dataDate,
  loadStoredManifest,
  readSpeciesGrid,
  readSpeciesPoints,
  withRemoteStats,
} from './src/data/remote';
import { SPECIES } from './src/data/species';
import { loadAllDatasets } from './src/data/allSpecies';
import { DEFAULT_FILTERS, activeFilterCount } from './src/data/points';
import {
  hasSeenWelcome,
  loadFilters,
  loadShowGrid,
  markWelcomeSeen,
  saveFilters,
  saveShowGrid,
} from './src/data/preferences';
import { useColors, useThemedStyles } from './src/theme';
import { ITALY_REGION, bboxToRegion, findTappedFeature, latitudeToScreenY, shiftCenterLatitude } from './src/utils/geo';

// Voce "Tutte le specie" dell'elenco: mostra insieme le segnalazioni di ogni specie.
const ALL_SPECIES_SLUG = '__tutte__';

// Spazio minimo (punti) tra il pallino selezionato e il bordo della scheda dati:
// metà dell'anello di selezione più un piccolo margine.
const CARD_CLEARANCE = 24;

// Tolleranza aggiuntiva (px) attorno al cerchio di un cluster per considerarlo toccato.
const CLUSTER_HIT_SLOP = 6;

function zoomToRegion([longitude, latitude], zoom) {
  const delta = 360 / 2 ** zoom;
  return { latitude, longitude, latitudeDelta: delta, longitudeDelta: delta };
}

export default function App() {
  return (
    <SafeAreaProvider>
      <IASTracker />
    </SafeAreaProvider>
  );
}

function IASTracker() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useThemedStyles(createStyles);
  const mapRef = useRef(null);

  const [region, setRegion] = useState(ITALY_REGION);
  const [hasLocation, setHasLocation] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  // specie di cui è aperta la scheda (può essere diversa da quella mostrata sulla mappa)
  const [sheetSpecies, setSheetSpecies] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportKey, setReportKey] = useState(0); // nuova chiave = modulo di segnalazione vuoto
  const [reportKind, setReportKind] = useState('presenza'); // presenza | intervento
  const [notebookOpen, setNotebookOpen] = useState(false);
  const [regionsOpen, setRegionsOpen] = useState(false);
  // voce del taccuino mostrata sulla mappa
  const [reportPin, setReportPin] = useState(null);
  const [species, setSpecies] = useState(null);
  // punti mostrati: [{ species, data }] per una specie o per tutte
  const [datasets, setDatasets] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [nearbyOpen, setNearbyOpen] = useState(false);
  // Griglia ufficiale ISPRA 10×10 km della specie mostrata (livello attivabile dai Filtri)
  const [showGrid, setShowGrid] = useState(false);
  const [grid, setGrid] = useState({ slug: null, data: null });
  // { key, coordinate, points: [proprietà delle segnalazioni], pointId? } oppure null
  const [selection, setSelection] = useState(null);

  // Valori di layout letti solo nei gestori di eventi (non servono al render).
  const regionRef = useRef(ITALY_REGION);
  const mapHeightRef = useRef(0);
  const mapWidthRef = useRef(0);
  const clustersRef = useRef([]);
  const topBarBottomRef = useRef(0);
  const selectionCounter = useRef(0);
  const centeredKeyRef = useRef(null);

  const handleRegionChange = useCallback((next) => {
    regionRef.current = next;
    setRegion(next);
  }, []);

  const { clusters, visibleCount, expansionZoom, leaves } = useClusters(datasets, region, filters);
  useEffect(() => {
    clustersRef.current = clusters;
  }, [clusters]);

  // Dati aggiornati: prima quelli già scaricati, poi (al massimo ogni 12 ore) controllo online.
  const [manifest, setManifest] = useState(null);
  useEffect(() => {
    let active = true;
    (async () => {
      const stored = await loadStoredManifest();
      if (active && stored) setManifest(stored);
      const { manifest: latest } = await checkForUpdates();
      if (active && latest) setManifest(latest);
    })();
    return () => {
      active = false;
    };
  }, []);
  const speciesList = useMemo(() => SPECIES.map((s) => withRemoteStats(s, manifest)), [manifest]);
  const allSpeciesItem = useMemo(() => {
    const withData = speciesList.filter((s) => s.total > 0);
    return {
      slug: ALL_SPECIES_SLUG,
      all: true,
      commonName: 'Tutte le specie',
      scientificName: `${withData.length} specie con segnalazioni in Italia`,
      total: withData.reduce((sum, s) => sum + s.total, 0),
    };
  }, [speciesList]);
  const loadRequest = useRef(0);

  // Permesso di geolocalizzazione: abilita il pallino blu della posizione dell'utente.
  useEffect(() => {
    Location.requestForegroundPermissionsAsync()
      .then(({ status }) => setHasLocation(status === 'granted'))
      .catch(() => setHasLocation(false));
  }, []);

  /**
   * Mostra una specie sulla mappa. Con `focus` la mappa inquadra un'area invece dell'intera
   * distribuzione della specie: { center, radiusM } da "Vicino a me", { bbox } dal rapporto
   * per regione.
   */
  const selectSpecies = useCallback(
    (item, focus = null) => {
      setPanelOpen(false);
      setSelection(null);
      setSpecies(item);
      const request = ++loadRequest.current;
      if (!item.total) {
        setDatasets(null);
        return;
      }
      setLoading(true);
      // Caricamento dinamico: dati scaricati (se più recenti) o inclusi nell'app.
      const load = item.all
        ? loadAllDatasets(speciesList, manifest)
        : readSpeciesPoints(item, manifest).then((data) => (data ? [{ species: item, data }] : null));
      load
        .catch(() => null)
        .then((loaded) => {
          if (request !== loadRequest.current) return; // nel frattempo è stata scelta un'altra specie
          setDatasets(loaded);
          setLoading(false);
          if (!loaded) return;
          if (focus?.bbox) {
            mapRef.current?.animateToRegion(bboxToRegion(focus.bbox), 600);
          } else if (focus) {
            const delta = (focus.radiusM / 111320) * 2.4;
            mapRef.current?.animateToRegion({ ...focus.center, latitudeDelta: delta, longitudeDelta: delta }, 600);
          } else if (item.all) {
            mapRef.current?.animateToRegion(ITALY_REGION, 600);
          } else if (item.bbox) {
            mapRef.current?.animateToRegion(bboxToRegion(item.bbox), 600);
          }
        });
    },
    [manifest, speciesList],
  );

  const centerOnUser = useCallback(async () => {
    if (!hasLocation) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Posizione non disponibile', "Consenti l'accesso alla posizione nelle impostazioni.");
        return;
      }
      setHasLocation(true);
    }
    const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    mapRef.current?.animateToRegion(
      { latitude: coords.latitude, longitude: coords.longitude, latitudeDelta: 0.2, longitudeDelta: 0.2 },
      600,
    );
  }, [hasLocation]);

  // Callback stabili: i marker memoizzati non si ridisegnano a ogni pan/zoom.
  const selectPoint = useCallback((feature) => {
    const [longitude, latitude] = feature.geometry.coordinates;
    selectionCounter.current += 1;
    setSelection({
      key: selectionCounter.current,
      coordinate: { latitude, longitude },
      points: feature.properties.records,
      pointId: feature.properties.id,
    });
  }, []);

  const pressCluster = useCallback(
    (cluster) => {
      const [longitude, latitude] = cluster.geometry.coordinates;
      const target = expansionZoom(cluster.properties.cluster_id);
      if (target > CLUSTER_MAX_ZOOM) {
        // Segnalazioni sovrapposte anche allo zoom massimo: mostriamo l'elenco.
        const points = leaves(cluster.properties.cluster_id)
          .flatMap((f) => f.properties.records)
          .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
        selectionCounter.current += 1;
        setSelection({ key: selectionCounter.current, coordinate: { latitude, longitude }, points });
        return;
      }
      // Zoom esattamente al livello in cui il cluster si divide.
      mapRef.current?.animateToRegion(zoomToRegion(cluster.geometry.coordinates, target), 400);
    },
    [expansionZoom, leaves],
  );

  const clearSelection = useCallback(() => setSelection(null), []);

  // Lettori di schermo: annuncia la scheda che compare in basso (su Android lo fa già
  // accessibilityLiveRegion sul titolo della scheda).
  useEffect(() => {
    if (!selection) return;
    const n = selection.points.length;
    AccessibilityInfo.announceForAccessibility(
      n === 1 ? 'Segnalazione selezionata: dettagli in basso' : `${n} segnalazioni in questo punto: dettagli in basso`,
    );
  }, [selection]);

  /**
   * Tocco sulla mappa. Su iOS i marker non gestiscono il tocco (vedi MapMarkers.js): qui
   * si cerca il marker visibile più vicino al punto toccato, entro il suo raggio. Su
   * Android arrivano qui solo i tocchi fuori dai marker. Se nessun marker è vicino, la
   * selezione viene chiusa.
   */
  const handleMapPress = useCallback(
    (e) => {
      const { coordinate } = e.nativeEvent;
      const region = regionRef.current;
      const width = mapWidthRef.current;
      const height = mapHeightRef.current;
      if (!coordinate || !width || !height) {
        clearSelection();
        return;
      }
      const best = findTappedFeature(clustersRef.current, coordinate, region, { width, height }, (f) =>
        f.properties.cluster ? clusterSize(f.properties.records) / 2 + CLUSTER_HIT_SLOP : DOT_HIT_RADIUS,
      );

      if (!best) clearSelection();
      else if (best.properties.cluster) pressCluster(best);
      else selectPoint(best);
    },
    [clearSelection, pressCluster, selectPoint],
  );
  // id del punto selezionato (per l'animazione del pallino); null se è un elenco da cluster
  const selectedId = selection?.pointId ?? null;

  /**
   * Chiamata quando la scheda dati compare (o cambia dimensione). Se il punto selezionato
   * finisce sotto la scheda, o sotto la barra superiore, la mappa scorre con
   * un'animazione fino a portarlo al centro dello spazio libero tra le due. Lo zoom resta
   * invariato; lo spostamento avviene una sola volta per selezione.
   */
  const handleCardLayout = useCallback(
    ({ y: cardTop }) => {
      if (!selection || centeredKeyRef.current === selection.key) return;
      centeredKeyRef.current = selection.key;

      const region = regionRef.current;
      const mapHeight = mapHeightRef.current;
      if (!mapHeight) return;
      const topLimit = topBarBottomRef.current;
      const pointY = latitudeToScreenY(selection.coordinate.latitude, region, mapHeight);
      const covered = pointY > cardTop - CARD_CLEARANCE || pointY < topLimit + CARD_CLEARANCE;
      if (!covered) return;

      const targetY = (topLimit + cardTop) / 2;
      const latitude = shiftCenterLatitude(region, mapHeight, pointY - targetY);
      mapRef.current?.animateToRegion({ ...region, latitude }, 350);
    },
    [selection],
  );

  // Dal pannello (anch'esso una Modal): si chiude il pannello e si apre la scheda quando
  // l'animazione di chiusura è finita, perché iOS non mostra due Modal insieme.
  // Da "Nuova segnalazione" al taccuino e viceversa (due Modal: una alla volta su iOS).
  const openNotebookFromReport = useCallback(() => {
    setReportOpen(false);
    setTimeout(() => setNotebookOpen(true), 400);
  }, []);

  const openReport = useCallback((kind) => {
    setReportKind(kind);
    setReportKey((k) => k + 1);
    setReportOpen(true);
  }, []);

  const newEntryFromNotebook = useCallback(
    (kind) => {
      setNotebookOpen(false);
      setTimeout(() => openReport(kind), 400);
    },
    [openReport],
  );

  const openFromPanel = useCallback((setOpen) => {
    setPanelOpen(false);
    setTimeout(() => setOpen(true), 400);
  }, []);

  // Rapporto per regione: la specie scelta viene mostrata inquadrando la regione.
  const showSpeciesInRegion = useCallback(
    (item, region) => {
      setRegionsOpen(false);
      const full = speciesList.find((s) => s.slug === item.slug) ?? item;
      selectSpecies(full, { bbox: region.bbox });
    },
    [selectSpecies, speciesList],
  );
  const openSheetFromRegions = useCallback((item) => {
    setRegionsOpen(false);
    setTimeout(() => setSheetSpecies(item), 400);
  }, []);

  const showReportOnMap = useCallback((report) => {
    setNotebookOpen(false);
    setReportPin(report);
    mapRef.current?.animateToRegion(
      { latitude: report.latitude, longitude: report.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 },
      600,
    );
  }, []);

  const openSheetFromPanel = useCallback((item) => {
    setPanelOpen(false);
    setTimeout(() => setSheetSpecies(item), 400);
  }, []);

  // "Vicino a me": mostra la specie scelta inquadrando l'area attorno all'utente.
  const selectNearby = useCallback(
    (result, position, radiusM) => {
      setNearbyOpen(false);
      selectSpecies(result.species, {
        center: { latitude: position.latitude, longitude: position.longitude },
        radiusM,
      });
    },
    [selectSpecies],
  );
  const openSheetFromNearby = useCallback((item) => {
    setNearbyOpen(false);
    setTimeout(() => setSheetSpecies(item), 400);
  }, []);

  // Primo avvio: presentazione, poi l'elenco delle specie. Negli avvii successivi subito l'elenco.
  useEffect(() => {
    let active = true;
    hasSeenWelcome().then((seen) => {
      if (!active) return;
      if (seen) setPanelOpen(true);
      else setWelcomeOpen(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const finishWelcome = useCallback(() => {
    markWelcomeSeen();
    setWelcomeOpen(false);
    if (!species) setTimeout(() => setPanelOpen(true), 400);
  }, [species]);

  const openWelcomeFromPanel = useCallback(() => {
    setPanelOpen(false);
    setTimeout(() => setWelcomeOpen(true), 400);
  }, []);

  // Filtri: ripristinati all'avvio, salvati a ogni modifica.
  useEffect(() => {
    let active = true;
    loadFilters().then((saved) => {
      if (active) setFilters(saved);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    loadShowGrid().then((show) => {
      if (active) setShowGrid(show);
    });
    return () => {
      active = false;
    };
  }, []);

  const toggleGrid = useCallback((show) => {
    setShowGrid(show);
    saveShowGrid(show);
  }, []);

  // Carica la griglia della specie mostrata solo quando il livello è attivo.
  useEffect(() => {
    if (!showGrid || !species || species.all || grid.slug === species.slug) return undefined;
    let active = true;
    readSpeciesGrid(species, manifest)
      .catch(() => null)
      .then((data) => {
        if (active) setGrid({ slug: species.slug, data });
      });
    return () => {
      active = false;
    };
  }, [showGrid, species, manifest, grid.slug]);
  const gridPolygons = showGrid && species && grid.slug === species.slug ? (grid.data?.poligoni ?? []) : [];
  let gridNote = '';
  if (!species) gridNote = 'Scegli una specie.';
  else if (species.all) gridNote = 'Disponibile per una specie alla volta.';
  else if (grid.slug === species.slug && grid.data) gridNote = `${grid.data.celle} celle per questa specie.`;
  else if (!species.grid) gridNote = 'ISPRA non pubblica la griglia per questa specie.';

  const changeFilters = useCallback((next) => {
    setSelection(null);
    setFilters(next);
    saveFilters(next);
  }, []);
  const filtersSummary = describeFilters(filters);
  const filtersActive = activeFilterCount(filters);

  return (
    <View
      style={styles.container}
      onLayout={(e) => {
        mapHeightRef.current = e.nativeEvent.layout.height;
        mapWidthRef.current = e.nativeEvent.layout.width;
      }}
    >
      <StatusBar style="auto" />
      <MapView
        ref={mapRef}
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.mapBackground }]}
        initialRegion={ITALY_REGION}
        onRegionChangeComplete={handleRegionChange}
        userInterfaceStyle={colors.scheme}
        loadingEnabled
        loadingBackgroundColor={colors.mapBackground}
        loadingIndicatorColor={colors.primary}
        accessibilityLabel="Mappa delle segnalazioni"
        moveOnMarkerPress={false}
        showsUserLocation={hasLocation}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        onPress={handleMapPress}
      >
        {clusters.map((f) => {
          if (f.properties.cluster) {
            return <ClusterMarker key={`c-${f.properties.cluster_id}`} feature={f} onPress={pressCluster} />;
          }
          // key stabile: i marker non vengono ricreati quando cambia la selezione
          return (
            <DotMarker
              key={`d-${f.properties.id}`}
              feature={f}
              selected={f.properties.id === selectedId}
              onPress={selectPoint}
            />
          );
        })}
        {gridPolygons.map((poly, i) => (
          <Polygon
            key={`g-${grid.slug}-${i}`}
            coordinates={poly.esterno.map(([longitude, latitude]) => ({ latitude, longitude }))}
            holes={poly.buchi.map((h) => h.map(([longitude, latitude]) => ({ latitude, longitude })))}
            fillColor="rgba(21,101,192,0.18)"
            strokeColor="rgba(21,101,192,0.7)"
            strokeWidth={1}
            tappable={false}
          />
        ))}
        {reportPin && (
          <Marker
            coordinate={{ latitude: reportPin.latitude, longitude: reportPin.longitude }}
            pinColor="blue"
            title={`Dal taccuino: ${reportPin.commonName}`}
            description={new Date(reportPin.createdAt).toLocaleDateString('it-IT')}
          />
        )}
      </MapView>

      {/* Barra superiore: specie selezionata e apertura dell'elenco */}
      <View
        style={[styles.topBar, { top: insets.top + 8 }]}
        onLayout={(e) => {
          const { y, height } = e.nativeEvent.layout;
          topBarBottomRef.current = y + height;
        }}
      >
        <Pressable
          style={styles.speciesButton}
          onPress={() => setPanelOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={
            species
              ? `Specie mostrata: ${species.commonName}, ${
                  species.total === 0
                    ? 'nessuna segnalazione in Italia'
                    : `${visibleCount} segnalazioni nell'area visibile`
                }`
              : 'Scegli una specie'
          }
          accessibilityHint="Apre l'elenco delle specie"
        >
          <Text style={styles.appName}>IAS Tracker</Text>
          <Text style={styles.speciesName} numberOfLines={1}>
            {species ? species.commonName : 'Scegli una specie'}
          </Text>
          {species && (
            <Text style={styles.speciesMeta} numberOfLines={1}>
              <Text style={styles.italic}>{species.scientificName}</Text>
              {species.total === 0
                ? ' · nessuna segnalazione in Italia'
                : ` · ${visibleCount.toLocaleString('it-IT')} segnalazioni`}
            </Text>
          )}
        </Pressable>
        {loading && (
          <ActivityIndicator style={styles.spinner} color={colors.primary} accessibilityLabel="Caricamento" />
        )}
        {species && !species.all && (
          <Pressable
            style={styles.infoRound}
            onPress={() => setSheetSpecies(species)}
            accessibilityRole="button"
            accessibilityLabel={`Scheda di ${species.commonName}`}
          >
            <Text style={styles.infoRoundText} allowFontScaling={false}>
              ⓘ
            </Text>
          </Pressable>
        )}
      </View>

      <PointCard
        key={selection?.key}
        onLayout={handleCardLayout}
        points={selection?.points}
        coordinate={selection?.coordinate}
        bottomInset={insets.bottom}
        onClose={clearSelection}
        onOpenSheet={(slug) => setSheetSpecies(speciesList.find((s) => s.slug === slug) ?? null)}
      />

      {/* Barra inferiore: filtri, elenco specie, posizione */}
      <View style={[styles.bottomBar, { bottom: insets.bottom + 12 }]}>
        <Pressable
          style={styles.filter}
          onPress={() => setFiltersOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Filtri${filtersActive ? `, ${filtersActive} attivi` : ''}`}
        >
          <Text style={styles.filterTitle}>
            Filtri{filtersActive ? <Text style={styles.filterBadge}> ● {filtersActive}</Text> : null}
          </Text>
          <Text style={styles.filterText} numberOfLines={1}>
            {filtersSummary || 'Tutte le segnalazioni verificate'}
          </Text>
        </Pressable>
        <Pressable
          style={styles.roundButton}
          onPress={() => setNearbyOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Vicino a me"
        >
          <Text style={styles.roundButtonEmoji} allowFontScaling={false}>
            📍
          </Text>
        </Pressable>
        <Pressable
          style={styles.roundButton}
          onPress={() => setPanelOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Elenco specie"
        >
          <Text style={styles.roundButtonText} allowFontScaling={false}>
            ☰
          </Text>
        </Pressable>
        <Pressable
          style={styles.roundButton}
          onPress={centerOnUser}
          accessibilityRole="button"
          accessibilityLabel="Centra sulla mia posizione"
        >
          <Text style={styles.roundButtonText} allowFontScaling={false}>
            ◎
          </Text>
        </Pressable>
      </View>

      <NearbyPanel
        visible={nearbyOpen}
        speciesList={speciesList}
        manifest={manifest}
        filters={filters}
        onSelect={selectNearby}
        onInfo={openSheetFromNearby}
        onClose={() => setNearbyOpen(false)}
      />

      <FiltersPanel
        visible={filtersOpen}
        filters={filters}
        onChange={changeFilters}
        showGrid={showGrid}
        onToggleGrid={toggleGrid}
        gridNote={gridNote}
        onClose={() => setFiltersOpen(false)}
        extra={
          <ExportSection
            datasets={datasets}
            filters={filters}
            region={region}
            title={species?.commonName ?? ''}
            slug={species?.all ? 'tutte-le-specie' : (species?.slug ?? 'specie')}
          />
        }
      />

      <SpeciesPanel
        species={speciesList}
        allItem={allSpeciesItem}
        dataUpdatedAt={dataDate(manifest)}
        visible={panelOpen}
        selectedSlug={species?.slug}
        onSelect={selectSpecies}
        onInfo={openSheetFromPanel}
        onAbout={openWelcomeFromPanel}
        onRegions={() => openFromPanel(setRegionsOpen)}
        onNotebook={() => openFromPanel(setNotebookOpen)}
        onClose={() => setPanelOpen(false)}
      />

      <RegionReport
        visible={regionsOpen}
        speciesList={speciesList}
        manifest={manifest}
        filters={filters}
        onShowSpecies={showSpeciesInRegion}
        onInfo={openSheetFromRegions}
        onClose={() => setRegionsOpen(false)}
      />

      <WelcomeScreen visible={welcomeOpen} onDone={finishWelcome} />

      {/* Pulsante per una nuova segnalazione (nascosto mentre è aperta la scheda di un punto) */}
      {!selection && (
        <Pressable
          style={[styles.reportButton, { bottom: insets.bottom + 84 }]}
          onPress={() => openReport('presenza')}
          accessibilityRole="button"
          accessibilityLabel="Nuova segnalazione"
        >
          <Text style={styles.reportButtonText} maxFontSizeMultiplier={1.6}>
            ＋ Segnala
          </Text>
        </Pressable>
      )}

      <SpeciesSheet
        species={sheetSpecies}
        manifest={manifest}
        visible={!!sheetSpecies}
        onClose={() => setSheetSpecies(null)}
        onOpenSpecies={(slug) => setSheetSpecies(speciesList.find((s) => s.slug === slug) ?? null)}
      />
      <ReportScreen
        key={reportKey}
        visible={reportOpen}
        initialSpecies={species?.all ? null : species}
        initialKind={reportKind}
        onClose={() => setReportOpen(false)}
        onOpenNotebook={openNotebookFromReport}
      />
      <Notebook
        visible={notebookOpen}
        onClose={() => setNotebookOpen(false)}
        onShowOnMap={showReportOnMap}
        onNewEntry={newEntryFromNotebook}
      />
    </View>
  );
}

const createStyles = (c) => {
  const shadow = {
    shadowColor: '#000',
    shadowOpacity: c.shadowOpacity,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  };
  return StyleSheet.create({
    container: { flex: 1 },
    topBar: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center' },
    speciesButton: {
      flex: 1,
      backgroundColor: c.surface,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      ...shadow,
    },
    appName: { fontSize: 11, fontWeight: '700', color: c.primary, letterSpacing: 0.5, textTransform: 'uppercase' },
    speciesName: { fontSize: 17, fontWeight: '600', marginTop: 2, color: c.text },
    speciesMeta: { fontSize: 13, color: c.textSecondary, marginTop: 2 },
    italic: { fontStyle: 'italic' },
    spinner: { marginLeft: 10 },
    bottomBar: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
    filter: {
      flex: 1,
      minHeight: 52,
      paddingVertical: 6,
      justifyContent: 'center',
      backgroundColor: c.surface,
      borderRadius: 14,
      paddingHorizontal: 14,
      ...shadow,
    },
    filterTitle: { fontSize: 15, fontWeight: '700', color: c.primary },
    filterBadge: { fontSize: 13, color: c.orange },
    filterText: { fontSize: 12, color: c.textSecondary, marginTop: 1 },
    roundButton: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadow,
    },
    roundButtonText: { fontSize: 22, color: c.primary },
    roundButtonEmoji: { fontSize: 20 },
    infoRound: {
      width: 48,
      height: 48,
      marginLeft: 8,
      borderRadius: 24,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadow,
    },
    infoRoundText: { fontSize: 24, color: c.link },
    reportButton: {
      position: 'absolute',
      right: 12,
      backgroundColor: c.primaryFill,
      borderRadius: 26,
      paddingHorizontal: 18,
      paddingVertical: 13,
      ...shadow,
    },
    reportButtonText: { color: c.onPrimary, fontSize: 16, fontWeight: '700' },
  });
};
