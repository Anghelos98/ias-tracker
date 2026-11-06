import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClusterMarker, DOT_HIT_RADIUS, DotMarker, clusterSize } from './src/components/MapMarkers';
import PointCard from './src/components/PointCard';
import SpeciesPanel from './src/components/SpeciesPanel';
import SpeciesSheet from './src/components/SpeciesSheet';
import ReportScreen from './src/components/ReportScreen';
import MyReports from './src/components/MyReports';
import { CLUSTER_MAX_ZOOM, useClusters } from './src/hooks/useClusters';
import {
  ITALY_REGION,
  bboxToRegion,
  latitudeToScreenY,
  longitudeToScreenX,
  shiftCenterLatitude,
} from './src/utils/geo';

// Colore di fondo mostrato mentre le tile della mappa si caricano: un tono vicino a
// quello della mappa evita il "flash" bianco durante lo zoom.
const MAP_BACKGROUND = '#f2efe9';

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
  const mapRef = useRef(null);

  const [region, setRegion] = useState(ITALY_REGION);
  const [hasLocation, setHasLocation] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  // specie di cui è aperta la scheda (può essere diversa da quella mostrata sulla mappa)
  const [sheetSpecies, setSheetSpecies] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportKey, setReportKey] = useState(0); // nuova chiave = modulo di segnalazione vuoto
  const [myReportsOpen, setMyReportsOpen] = useState(false);
  // segnalazione dell'utente mostrata sulla mappa da "Le mie segnalazioni"
  const [reportPin, setReportPin] = useState(null);
  const [species, setSpecies] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [includeAutomatic, setIncludeAutomatic] = useState(false);
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

  const { clusters, visibleCount, expansionZoom, leaves } = useClusters(data, region, includeAutomatic);
  useEffect(() => {
    clustersRef.current = clusters;
  }, [clusters]);

  // Permesso di geolocalizzazione: abilita il pallino blu della posizione dell'utente.
  useEffect(() => {
    Location.requestForegroundPermissionsAsync()
      .then(({ status }) => setHasLocation(status === 'granted'))
      .catch(() => setHasLocation(false));
  }, []);

  const selectSpecies = useCallback((item) => {
    setPanelOpen(false);
    setSelection(null);
    setSpecies(item);
    if (!item.load) {
      setData(null);
      return;
    }
    setLoading(true);
    // Caricamento dinamico: il JSON della specie viene valutato solo ora.
    // setTimeout lascia a React il tempo di mostrare l'indicatore di caricamento.
    setTimeout(() => {
      setData(item.load());
      setLoading(false);
      if (item.bbox) mapRef.current?.animateToRegion(bboxToRegion(item.bbox), 600);
    }, 0);
  }, []);

  const centerOnUser = useCallback(async () => {
    if (!hasLocation) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Posizione non disponibile', 'Consenti l\'accesso alla posizione nelle impostazioni.');
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
      const tapX = longitudeToScreenX(coordinate.longitude, region, width);
      const tapY = latitudeToScreenY(coordinate.latitude, region, height);

      let best = null;
      let bestDistance = Infinity;
      for (const f of clustersRef.current) {
        const [lon, lat] = f.geometry.coordinates;
        const dx = longitudeToScreenX(lon, region, width) - tapX;
        const dy = latitudeToScreenY(lat, region, height) - tapY;
        const distance = Math.hypot(dx, dy);
        const radius = f.properties.cluster
          ? clusterSize(f.properties.records) / 2 + CLUSTER_HIT_SLOP
          : DOT_HIT_RADIUS;
        if (distance <= radius && distance < bestDistance) {
          best = f;
          bestDistance = distance;
        }
      }

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
  // Da "Nuova segnalazione" a "Le mie segnalazioni" (due Modal: una alla volta su iOS).
  const openMyReportsFromReport = useCallback(() => {
    setReportOpen(false);
    setTimeout(() => setMyReportsOpen(true), 400);
  }, []);

  const showReportOnMap = useCallback((report) => {
    setMyReportsOpen(false);
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

  const toggleAutomatic = useCallback((value) => {
    setSelection(null);
    setIncludeAutomatic(value);
  }, []);

  return (
    <View
      style={styles.container}
      onLayout={(e) => {
        mapHeightRef.current = e.nativeEvent.layout.height;
        mapWidthRef.current = e.nativeEvent.layout.width;
      }}
    >
      <StatusBar style="dark" />
      <MapView
        ref={mapRef}
        style={[StyleSheet.absoluteFill, { backgroundColor: MAP_BACKGROUND }]}
        initialRegion={ITALY_REGION}
        onRegionChangeComplete={handleRegionChange}
        loadingEnabled
        loadingBackgroundColor={MAP_BACKGROUND}
        loadingIndicatorColor="#2e7d32"
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
        {reportPin && (
          <Marker
            coordinate={{ latitude: reportPin.latitude, longitude: reportPin.longitude }}
            pinColor="blue"
            title={`La tua segnalazione: ${reportPin.commonName}`}
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
        <Pressable style={styles.speciesButton} onPress={() => setPanelOpen(true)}>
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
        {loading && <ActivityIndicator style={styles.spinner} />}
        {species && (
          <Pressable
            style={styles.infoRound}
            onPress={() => setSheetSpecies(species)}
            accessibilityLabel={`Scheda di ${species.commonName}`}
          >
            <Text style={styles.infoRoundText}>ⓘ</Text>
          </Pressable>
        )}
      </View>

      <PointCard
        key={selection?.key}
        onLayout={handleCardLayout}
        points={selection?.points}
        coordinate={selection?.coordinate}
        species={species}
        bottomInset={insets.bottom}
        onClose={clearSelection}
        onOpenSheet={() => setSheetSpecies(species)}
      />

      {/* Barra inferiore: filtro identificazioni automatiche, elenco, posizione */}
      <View style={[styles.bottomBar, { bottom: insets.bottom + 12 }]}>
        <View style={styles.filter}>
          <Switch value={includeAutomatic} onValueChange={toggleAutomatic} />
          <Text style={styles.filterText}>Includi identificazioni{'\n'}automatiche (Pl@ntNet)</Text>
        </View>
        <Pressable style={styles.roundButton} onPress={() => setPanelOpen(true)} accessibilityLabel="Elenco specie">
          <Text style={styles.roundButtonText}>☰</Text>
        </Pressable>
        <Pressable style={styles.roundButton} onPress={centerOnUser} accessibilityLabel="Centra sulla mia posizione">
          <Text style={styles.roundButtonText}>◎</Text>
        </Pressable>
      </View>

      <SpeciesPanel
        visible={panelOpen}
        selectedSlug={species?.slug}
        onSelect={selectSpecies}
        onInfo={openSheetFromPanel}
        onClose={() => setPanelOpen(false)}
      />

      {/* Pulsante per una nuova segnalazione (nascosto mentre è aperta la scheda di un punto) */}
      {!selection && (
        <Pressable
          style={[styles.reportButton, { bottom: insets.bottom + 84 }]}
          onPress={() => {
            setReportKey((k) => k + 1);
            setReportOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Nuova segnalazione"
        >
          <Text style={styles.reportButtonText}>＋ Segnala</Text>
        </Pressable>
      )}

      <SpeciesSheet species={sheetSpecies} visible={!!sheetSpecies} onClose={() => setSheetSpecies(null)} />
      <ReportScreen
        key={reportKey}
        visible={reportOpen}
        initialSpecies={species}
        onClose={() => setReportOpen(false)}
        onOpenMyReports={openMyReportsFromReport}
      />
      <MyReports visible={myReportsOpen} onClose={() => setMyReportsOpen(false)} onShowOnMap={showReportOnMap} />
    </View>
  );
}

const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.15,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
  elevation: 4,
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center' },
  speciesButton: { flex: 1, backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, ...shadow },
  appName: { fontSize: 11, fontWeight: '700', color: '#2e7d32', letterSpacing: 0.5, textTransform: 'uppercase' },
  speciesName: { fontSize: 17, fontWeight: '600', marginTop: 2 },
  speciesMeta: { fontSize: 13, color: '#555', marginTop: 2 },
  italic: { fontStyle: 'italic' },
  spinner: { marginLeft: 10 },
  bottomBar: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  filter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
    ...shadow,
  },
  filterText: { flex: 1, fontSize: 12, color: '#333' },
  roundButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  roundButtonText: { fontSize: 22, color: '#2e7d32' },
  infoRound: {
    width: 48,
    height: 48,
    marginLeft: 8,
    borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  infoRoundText: { fontSize: 24, color: '#1565c0' },
  reportButton: {
    position: 'absolute',
    right: 12,
    backgroundColor: '#2e7d32',
    borderRadius: 26,
    paddingHorizontal: 18,
    paddingVertical: 13,
    ...shadow,
  },
  reportButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
