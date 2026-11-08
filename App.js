import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Appearance,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Circle, Marker, Polygon } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClusterMarker, DotMarker, clusterSize } from './src/components/MapMarkers';
import PointCard from './src/components/PointCard';
import FiltersPanel, { describeFilters } from './src/components/FiltersPanel';
import NearbyPanel from './src/components/NearbyPanel';
import ExportSection from './src/components/ExportSection';
import WelcomeScreen from './src/components/WelcomeScreen';
import StatusPill from './src/components/StatusPill';
import SpeciesPanel from './src/components/SpeciesPanel';
import SpeciesSheet from './src/components/SpeciesSheet';
import ReportScreen from './src/components/ReportScreen';
import Notebook from './src/components/Notebook';
import RegionReport from './src/components/RegionReport';
import NewsScreen from './src/components/NewsScreen';
import SettingsScreen from './src/components/SettingsScreen';
import { CLUSTER_MAX_ZOOM, useClusters } from './src/hooks/useClusters';
import {
  checkForUpdates,
  clearDownloadedData,
  dataDate,
  loadStoredManifest,
  readNews,
  readSpeciesGrid,
  readSpeciesPoints,
  withRemoteStats,
} from './src/data/remote';
import { SPECIES } from './src/data/species';
import { loadAllDatasets } from './src/data/allSpecies';
import { DEFAULT_FILTERS, activeFilterCount } from './src/data/points';
import {
  NO_FOLLOWS,
  filterFollowed,
  hasFollows,
  latestWeeks,
  newestDate,
  summarize,
  toggleFollow,
  weeksSince,
} from './src/data/news';
import { disableNewsAlerts, enableNewsAlerts } from './src/notifications/newsAlerts';
import {
  hasSeenWelcome,
  loadFilters,
  loadFollows,
  loadMapType,
  loadNewsSeen,
  loadNotify,
  loadShowGrid,
  loadSignature,
  loadTheme,
  markWelcomeSeen,
  saveFilters,
  saveFollows,
  saveMapType,
  saveNewsNotified,
  saveNewsSeen,
  saveNotify,
  saveShowGrid,
  saveSignature,
  saveTheme,
} from './src/data/preferences';
import { useColors, useThemedStyles } from './src/theme';
import {
  ITALY_REGION,
  bboxToRegion,
  NO_INSETS,
  findFeatureAtPoint,
  insetsFromEdges,
  latitudeToScreenY,
  regionCorners,
  screenProjector,
  shiftCenterLatitude,
} from './src/utils/geo';

// Voce "Tutte le specie" dell'elenco: mostra insieme le segnalazioni di ogni specie.
const ALL_SPECIES_SLUG = '__tutte__';

// Spazio minimo (punti) tra il pallino selezionato e il bordo della scheda dati:
// metà dell'anello di selezione più un piccolo margine.
const CARD_CLEARANCE = 24;

// Aree di tocco dei marker (punti dello schermo): raggio disegnato e tolleranza oltre il bordo.
// Si sceglie l'elemento con il bordo più vicino al dito (vedi findFeatureAtPoint): i pallini
// distano almeno 40 px tra loro, quindi la tolleranza può essere ampia senza ambiguità.
const DOT_VISUAL_RADIUS = 7; // pallino da 14 px
const DOT_TOUCH_SLOP = 26; // ≈ 33 px dal centro: più di un polpastrello
const CLUSTER_TOUCH_SLOP = 16;

// Tocco riconosciuto dagli eventi di tocco (iOS, vedi onMapTouchEnd): spostamento massimo del
// dito (px) e durata massima (ms) perché sia un tocco e non un trascinamento o una pressione lunga.
const TAP_MAX_MOVE = 16;
const TAP_MAX_MS = 600;
// Lo stesso tocco può arrivare da due canali (eventi di tocco e onPress della mappa, in ritardo):
// l'arrivo dall'ALTRO canale entro questo tempo e questa distanza viene ignorato. Due tocchi
// dallo stesso canale sono sempre due tocchi distinti (es. un nuovo tentativo dopo un errore).
const TAP_DEDUP_MS = 700;
const TAP_DEDUP_PX = 40;
// Su iOS la selezione parte dagli eventi di tocco (immediati); l'onPress della mappa resta come
// riserva se un tocco non arrivasse da lì.
const TAP_FROM_TOUCHES = Platform.OS === 'ios';
// iOS: dopo il tocco su un pallino lo zoom della mappa resta spento per questo tempo (ms).
// Apple Maps interpreta "tocco + trascinamento subito dopo" come zoom con un dito (doppio tocco
// e trascina): il trascinamento che segue il tocco su un pallino diventava uno zoom.
const ZOOM_LOCK_AFTER_TAP_MS = 500;

/** Area di tocco di un elemento della mappa. */
function hitArea(feature) {
  return feature.properties.cluster
    ? { visual: clusterSize(feature.properties.records) / 2, slop: CLUSTER_TOUCH_SLOP }
    : { visual: DOT_VISUAL_RADIUS, slop: DOT_TOUCH_SLOP };
}

/** Diagnostica: marker più vicino al punto toccato, con la distanza e la direzione (px). */
function describeNearest(features, point, region, size) {
  const project = screenProjector(region, size);
  let nearest = null;
  for (const f of features) {
    const [lon, lat] = f.geometry.coordinates;
    const dx = project.x(lon) - point.x;
    const dy = project.y(lat) - point.y;
    const d = Math.hypot(dx, dy);
    if (!nearest || d < nearest.d) nearest = { f, d, dx, dy };
  }
  if (!nearest) return 'nessun marker sulla mappa';
  const kind = nearest.f.properties.cluster ? `gruppo di ${nearest.f.properties.records}` : 'pallino';
  return `il più vicino è un ${kind} a ${Math.round(nearest.d)} px (dx ${Math.round(nearest.dx)}, dy ${Math.round(nearest.dy)}), ${features.length} visibili`;
}

/** Diagnostica dei tocchi, solo in sviluppo (Expo Go): compare nei log di Metro. */
function logTap(source, point, result) {
  if (!__DEV__) return;
  console.log(`[tocco] ${source} ${Math.round(point.x)},${Math.round(point.y)} -> ${result}`);
}

/** Tema scelto nelle Impostazioni applicato a tutta l'app (anche mappa e barre di sistema). */
function applyTheme(theme) {
  Appearance.setColorScheme?.(theme === 'auto' ? 'unspecified' : theme);
}

/** Punti da mostrare: una specie o, per "Tutte le specie", tutte quelle con segnalazioni. */
function loadDatasets(item, manifest, speciesList) {
  return item.all
    ? loadAllDatasets(speciesList, manifest)
    : readSpeciesPoints(item, manifest).then((data) => (data ? [{ species: item, data }] : null));
}

/** Regione della mappa che inquadra la zona di "Vicino a me" (cerchio con un piccolo margine). */
function areaToRegion({ center, radiusM }) {
  const delta = (radiusM / 111320) * 2.4;
  return { ...center, latitudeDelta: delta, longitudeDelta: delta };
}

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
  const [topBarBottom, setTopBarBottom] = useState(0);
  const selectionCounter = useRef(0);
  const selectedIdRef = useRef(null); // pallino selezionato, letto dai gestori dei tocchi
  const centeredKeyRef = useRef(null);

  /**
   * Riquadro reale della regione sulla mappa (iOS): Apple Maps non fa corrispondere la regione
   * a tutta la vista, quindi si chiede alla mappa dove disegna due angoli della regione e se ne
   * ricavano i margini (vedi NO_INSETS in geo.js). I margini dipendono dall'impaginazione, non
   * dalla regione: valgono anche durante i movimenti successivi. Si rimisurano a ogni fine
   * movimento, solo con regioni comunicate dalla mappa (quella iniziale richiesta viene adattata
   * alle proporzioni dello schermo); se la misura non riesce restano gli ultimi validi.
   */
  const mapInsetsRef = useRef(NO_INSETS);
  const mapSize = useCallback(
    () => ({ width: mapWidthRef.current, height: mapHeightRef.current, insets: mapInsetsRef.current }),
    [],
  );
  const calibrateMap = useCallback(async (measured) => {
    const map = mapRef.current;
    if (Platform.OS !== 'ios' || !map?.pointForCoordinate || !mapWidthRef.current) return;
    try {
      const { northWest, southEast } = regionCorners(measured);
      const [nw, se] = await Promise.all([map.pointForCoordinate(northWest), map.pointForCoordinate(southEast)]);
      // la mappa si è mossa durante la misura: i punti non corrispondono più a questa regione
      if (regionRef.current !== measured) return;
      const insets = insetsFromEdges(nw, se, { width: mapWidthRef.current, height: mapHeightRef.current });
      if (!insets) return;
      const previous = mapInsetsRef.current;
      mapInsetsRef.current = insets;
      if (__DEV__ && Object.keys(insets).some((k) => Math.abs(insets[k] - previous[k]) >= 1)) {
        const r = (v) => Math.round(v);
        console.log(
          `[tocco] riquadro della regione: margini alto ${r(insets.top)}, basso ${r(insets.bottom)}, ` +
            `sinistra ${r(insets.left)}, destra ${r(insets.right)}`,
        );
      }
    } catch {
      // misura non disponibile: restano i margini precedenti
    }
  }, []);

  const handleRegionChange = useCallback(
    (next) => {
      regionRef.current = next;
      setRegion(next);
      calibrateMap(next);
    },
    [calibrateMap],
  );
  // Durante il movimento si aggiorna solo il ref (niente render): i tocchi fatti mentre la
  // mappa rallenta usano la posizione reale, non quella dell'ultimo movimento concluso.
  const trackRegion = useCallback((next) => {
    regionRef.current = next;
  }, []);

  // "Vicino a me" come filtro della mappa: { center, radiusM } o null (tutta Italia)
  const [area, setArea] = useState(null);
  const areaRef = useRef(null);
  useEffect(() => {
    areaRef.current = area;
  }, [area]);

  const { clusters, visibleCount, expansionZoom, leaves } = useClusters(datasets, region, filters, area);
  useEffect(() => {
    clustersRef.current = clusters;
  }, [clusters]);

  // Manifest dei dati scaricati (null = dati inclusi nell'app); vedi applyNewData più sotto.
  const [manifest, setManifest] = useState(null);
  const [updatingData, setUpdatingData] = useState(false);
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
        setLoading(false); // un caricamento ancora in corso di un'altra specie non va più atteso
        return;
      }
      setLoading(true);
      // Caricamento dinamico: dati scaricati (se più recenti) o inclusi nell'app.
      loadDatasets(item, manifest, speciesList)
        .catch(() => null)
        .then((loaded) => {
          if (request !== loadRequest.current) return; // nel frattempo è stata scelta un'altra specie
          setDatasets(loaded);
          setLoading(false);
          if (!loaded) {
            Alert.alert('Dati non disponibili', 'Non è stato possibile leggere le segnalazioni. Riprova.');
            return;
          }
          // con "Vicino a me" attivo si inquadra la zona: fuori non ci sono segnalazioni mostrate
          const target = focus ?? areaRef.current;
          if (target?.bbox) {
            mapRef.current?.animateToRegion(bboxToRegion(target.bbox), 600);
          } else if (target) {
            mapRef.current?.animateToRegion(areaToRegion(target), 600);
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
    try {
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
    } catch {
      // GPS spento, servizi di localizzazione disattivati o nessun segnale
      Alert.alert('Posizione non disponibile', 'Controlla che la localizzazione sia attiva e riprova.');
    }
  }, [hasLocation]);

  // Callback stabili: i marker memoizzati non si ridisegnano a ogni pan/zoom.
  const [zoomLocked, setZoomLocked] = useState(false);
  const zoomLockTimer = useRef(null);
  useEffect(() => () => clearTimeout(zoomLockTimer.current), []);
  const selectPoint = useCallback((feature) => {
    if (Platform.OS === 'ios') {
      setZoomLocked(true);
      clearTimeout(zoomLockTimer.current);
      zoomLockTimer.current = setTimeout(() => setZoomLocked(false), ZOOM_LOCK_AFTER_TAP_MS);
    }
    // stesso pallino già selezionato (es. secondo tocco di un doppio tocco per lo zoom)
    if (selectedIdRef.current === feature.properties.id) return;
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
   * Tocco sulla mappa in un punto dello schermo (dentro la mappa): seleziona il pallino o apre
   * il gruppo più vicino, oppure chiude la selezione. `source` dice da dove arriva il tocco.
   * Lo stesso tocco ricevuto due volte (dai due canali) viene gestito una sola volta.
   */
  const lastTapRef = useRef({ t: 0, x: 0, y: 0, source: null, paired: true });
  const handleTapAt = useCallback(
    (point, source) => {
      const now = Date.now();
      const last = lastTapRef.current;
      if (
        !last.paired &&
        last.source !== source &&
        now - last.t < TAP_DEDUP_MS &&
        Math.hypot(point.x - last.x, point.y - last.y) < TAP_DEDUP_PX
      ) {
        last.paired = true; // doppione dello stesso tocco dall'altro canale
        logTap(source, point, 'già gestito');
        return;
      }
      lastTapRef.current = { t: now, x: point.x, y: point.y, source, paired: false };
      const size = mapSize();
      const region = regionRef.current;
      const best = size.width && size.height ? findFeatureAtPoint(clustersRef.current, point, region, size, hitArea) : null;
      if (!best) {
        if (__DEV__) logTap(source, point, `nessun marker; ${describeNearest(clustersRef.current, point, region, size)}`);
        clearSelection();
      } else if (best.properties.cluster) {
        if (__DEV__) logTap(source, point, `gruppo di ${best.properties.records}; ${describeNearest([best], point, region, size)}`);
        pressCluster(best);
      } else {
        if (__DEV__) logTap(source, point, `pallino ${best.properties.id}; ${describeNearest([best], point, region, size)}`);
        selectPoint(best);
      }
    },
    [clearSelection, pressCluster, selectPoint, mapSize],
  );

  /**
   * Tocco sulla mappa (evento della mappa). Su Android arrivano qui solo i tocchi fuori dai
   * marker (i marker gestiscono il proprio tocco). Su iOS arriva circa 0,3 s dopo il tocco
   * (react-native-maps aspetta di escludere un doppio tocco): fa da riserva agli eventi di tocco.
   *
   * `position` si usa solo su iOS, dove è in punti dello schermo come le dimensioni della mappa.
   * Su Android è in pixel fisici (Projection.toScreenLocation di Google Maps): confrontata con
   * misure in punti indicherebbe un altro posto della mappa (×2-3) e selezionerebbe un marker
   * lontano dal dito. Lì si parte dalle coordinate geografiche del tocco.
   *
   * Su iOS a volte arriva un onPress con posizione 0,0 (dopo il tocco di un marker): non è un
   * tocco vero e veniva trattato come un tocco nel vuoto, chiudendo la scheda appena aperta.
   */
  const handleMapPress = useCallback(
    (e) => {
      const { coordinate, position } = e.nativeEvent;
      const size = mapSize();
      if (!size.width || !size.height) return;
      let point = null;
      if (Platform.OS === 'ios') {
        if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return;
        if (position.x === 0 && position.y === 0) return; // evento senza posizione reale
        point = { x: position.x, y: position.y };
      } else if (coordinate) {
        const project = screenProjector(regionRef.current, size);
        point = { x: project.x(coordinate.longitude), y: project.y(coordinate.latitude) };
      }
      if (point) handleTapAt(point, 'mappa');
    },
    [handleTapAt, mapSize],
  );

  /**
   * iOS: tocco riconosciuto dagli eventi di tocco di React Native, appena il dito si alza,
   * senza l'attesa del doppio tocco dell'onPress della mappa. I marker non gestiscono il
   * tocco (vedi MapMarkers.js): handleTapAt cerca il marker più vicino al punto toccato.
   */
  const touchRef = useRef(null);
  const mapContainerRef = useRef(null);
  const mapOffsetRef = useRef({ x: 0, y: 0 });
  const onMapTouchStart = useCallback((e) => {
    const { touches, pageX, pageY, timestamp } = e.nativeEvent;
    touchRef.current = touches && touches.length > 1 ? null : { x: pageX, y: pageY, t: timestamp ?? Date.now() };
  }, []);
  const onMapTouchMove = useCallback((e) => {
    const start = touchRef.current;
    if (!start) return;
    const { touches, pageX, pageY } = e.nativeEvent;
    if ((touches && touches.length > 1) || Math.hypot(pageX - start.x, pageY - start.y) > TAP_MAX_MOVE) {
      touchRef.current = null; // trascinamento o zoom con due dita
    }
  }, []);
  const onMapTouchEnd = useCallback(
    (e) => {
      const start = touchRef.current;
      touchRef.current = null;
      if (!start) return;
      const { pageX, pageY, timestamp } = e.nativeEvent;
      const elapsed = (timestamp ?? Date.now()) - start.t;
      if (elapsed > TAP_MAX_MS || Math.hypot(pageX - start.x, pageY - start.y) > TAP_MAX_MOVE) return;
      handleTapAt({ x: pageX - mapOffsetRef.current.x, y: pageY - mapOffsetRef.current.y }, 'tocco');
    },
    [handleTapAt],
  );
  const onMapTouchCancel = useCallback(() => {
    touchRef.current = null;
  }, []);

  // id del punto selezionato (per l'animazione del pallino); null se è un elenco da cluster
  const selectedId = selection?.pointId ?? null;
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

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
      const insets = mapInsetsRef.current;
      const pointY = latitudeToScreenY(selection.coordinate.latitude, region, mapHeight, insets);
      const covered = pointY > cardTop - CARD_CLEARANCE || pointY < topLimit + CARD_CLEARANCE;
      if (!covered) return;

      const targetY = (topLimit + cardTop) / 2;
      const latitude = shiftCenterLatitude(region, mapHeight, pointY - targetY, insets);
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

  /**
   * Scheda di una specie. Aperta da un'altra schermata (elenco specie, Vicino a me, rapporto per
   * regione, novità), alla chiusura si torna a quella schermata invece che alla mappa. iOS non
   * mostra due Modal insieme: la schermata si chiude, la scheda si apre dopo l'animazione, e alla
   * chiusura della scheda la schermata si riapre (con il suo stato: ricerca, regione, scheda).
   */
  const sheetOriginRef = useRef(null);
  const openSheet = useCallback((item) => {
    sheetOriginRef.current = null; // dalla mappa: alla chiusura si resta sulla mappa
    setSheetSpecies(item);
  }, []);
  const openSheetAfter = useCallback((origin, item) => {
    sheetOriginRef.current = origin;
    setTimeout(() => setSheetSpecies(item), 400);
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
    openSheetAfter('regions', item);
  }, [openSheetAfter]);

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
    openSheetAfter('panel', item);
  }, [openSheetAfter]);

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
    openSheetAfter('nearby', item);
  }, [openSheetAfter]);

  /** Zona di "Vicino a me" sulla mappa: attivata, cambiata (raggio, posizione) o spenta. */
  const changeArea = useCallback((next) => {
    const prev = areaRef.current;
    const same =
      prev && next && prev.radiusM === next.radiusM &&
      prev.center.latitude === next.center.latitude && prev.center.longitude === next.center.longitude;
    if (same || (!prev && !next)) return;
    areaRef.current = next;
    setArea(next);
    setSelection(null);
    if (next) mapRef.current?.animateToRegion(areaToRegion(next), 600);
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
  // Novità della settimana e specie / regioni seguite
  const [news, setNews] = useState(null);
  const [follows, setFollows] = useState(NO_FOLLOWS);
  const followsRef = useRef(NO_FOLLOWS); // vedi changeFollow
  const [newsSeen, setNewsSeen] = useState(undefined); // undefined = non ancora letto
  const [newsOpen, setNewsOpen] = useState(false);
  const [seenAtOpen, setSeenAtOpen] = useState(null);
  const [notify, setNotify] = useState(false);
  const notifyRef = useRef(false);
  useEffect(() => {
    let active = true;
    readNews(manifest)
      .catch(() => null)
      .then((n) => {
        if (active) setNews(n);
      });
    return () => {
      active = false;
    };
  }, [manifest]);
  useEffect(() => {
    let active = true;
    Promise.all([loadFollows(), loadNewsSeen(), loadNotify()]).then(([f, seen, n]) => {
      if (!active) return;
      followsRef.current = f;
      setFollows(f);
      setNewsSeen(seen);
      setNotify(n);
    });
    return () => {
      active = false;
    };
  }, []);

  // Avviso sulla mappa: novità non ancora viste (solo quelle seguite, se l'utente segue qualcosa).
  const newsBadge = useMemo(() => {
    if (!news || newsSeen === undefined) return null;
    // mai aperte: solo l'ultima settimana, non tutto lo storico
    const summary = summarize(newsSeen ? weeksSince(news, newsSeen) : latestWeeks(news));
    if (hasFollows(follows)) {
      const followed = filterFollowed(summary, follows);
      return followed.total ? `${followed.total.toLocaleString('it-IT')} novità per te` : null;
    }
    return summary.total ? 'Novità della settimana' : null;
  }, [news, newsSeen, follows]);

  // Le novità risultano viste quando la schermata si apre davvero (anche dalla notifica).
  const newsSeenRef = useRef(undefined);
  useEffect(() => {
    newsSeenRef.current = newsSeen;
  }, [newsSeen]);
  const openNews = useCallback(() => {
    setSeenAtOpen(newsSeenRef.current ?? null);
    setNewsOpen(true);
  }, []);
  const markNewsSeen = useCallback(() => {
    const newest = newestDate(news);
    if (newest) {
      setNewsSeen(newest);
      saveNewsSeen(newest);
    }
  }, [news]);

  // Apertura dell'app toccando la notifica delle novità (anche ad app chiusa).
  useEffect(() => {
    const handle = (response) => {
      if (response?.notification.request.content.data?.screen !== 'novita') return;
      setPanelOpen(false);
      setTimeout(openNews, 400);
    };
    // versioni sincrone: quelle *Async sono deprecate in expo-notifications (SDK 58)
    try {
      const response = Notifications.getLastNotificationResponse();
      if (response) {
        handle(response);
        Notifications.clearLastNotificationResponse();
      }
    } catch {
      // modulo non disponibile (es. alcune versioni di Expo Go): niente apertura dalla notifica
    }
    const subscription = Notifications.addNotificationResponseReceivedListener(handle);
    return () => subscription.remove();
  }, [openNews]);

  // Valori correnti letti da un ref: più tocchi su "Segui" prima del render successivo (elenco
  // delle Novità) si sommano invece di sovrascriversi.
  useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);
  const changeFollow = useCallback((kind, value) => {
    const next = toggleFollow(followsRef.current, kind, value);
    followsRef.current = next;
    setFollows(next);
    saveFollows(next);
    if (!hasFollows(next) && notifyRef.current) {
      // niente da seguire: niente avvisi
      notifyRef.current = false;
      setNotify(false);
      saveNotify(false);
      disableNewsAlerts().catch(() => {});
    }
  }, []);

  const changeNotify = useCallback(async (enabled) => {
    if (!enabled) {
      setNotify(false);
      saveNotify(false);
      disableNewsAlerts().catch(() => {});
      return;
    }
    try {
      if (await enableNewsAlerts()) {
        setNotify(true);
        saveNotify(true);
        // si avvisa solo delle novità che arriveranno da ora in poi
        const newest = newestDate(news);
        if (newest) saveNewsNotified(newest);
      } else {
        Alert.alert(
          'Notifiche non consentite',
          'Per ricevere gli avvisi consenti le notifiche a IAS Tracker nelle impostazioni del telefono.',
        );
      }
    } catch {
      Alert.alert('Avvisi non disponibili', 'Non è stato possibile attivare il controllo in background.');
    }
  }, [news]);

  const showSpeciesFromNews = useCallback(
    (item, region) => {
      if (!item) return;
      setNewsOpen(false);
      const full = speciesList.find((s) => s.slug === item.slug) ?? item;
      selectSpecies(full, region ? { bbox: region.bbox } : null);
    },
    [selectSpecies, speciesList],
  );
  const openSheetFromNews = useCallback((item) => {
    setNewsOpen(false);
    openSheetAfter('news', item);
  }, [openSheetAfter]);

  // Chiusura della scheda specie: si torna alla schermata da cui era stata aperta (vedi openSheet).
  const closeSheet = useCallback(() => {
    setSheetSpecies(null);
    const origin = sheetOriginRef.current;
    sheetOriginRef.current = null;
    const reopen = {
      panel: () => setPanelOpen(true),
      regions: () => setRegionsOpen(true),
      nearby: () => setNearbyOpen(true),
      news: () => setNewsOpen(true), // senza openNews: le novità "non viste" restano quelle di prima
    }[origin];
    if (reopen) setTimeout(reopen, 400);
  }, []);

  // --- Impostazioni ---------------------------------------------------------------------
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState('auto');
  const [mapType, setMapType] = useState('standard');
  const [signature, setSignature] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([loadTheme(), loadMapType(), loadSignature()]).then(([t, m, sig]) => {
      if (!active) return;
      setTheme(t);
      applyTheme(t);
      setMapType(m);
      setSignature(sig);
    });
    return () => {
      active = false;
    };
  }, []);

  const changeTheme = useCallback((t) => {
    setTheme(t);
    saveTheme(t);
    applyTheme(t);
  }, []);
  const changeMapType = useCallback((m) => {
    setMapType(m);
    saveMapType(m);
  }, []);
  const changeSignature = useCallback((text) => {
    setSignature(text);
    saveSignature(text);
  }, []);
  const resetFilters = useCallback(() => changeFilters(DEFAULT_FILTERS), [changeFilters]);

  // Specie mostrata, letta quando cambiano i dati (a fine scaricamento la schermata può essere cambiata).
  const speciesRef = useRef(null);
  useEffect(() => {
    speciesRef.current = species;
  }, [species]);

  /**
   * Nuovi dati in uso (scaricati all'avvio o dalle Impostazioni, oppure eliminati): statistiche
   * e punti della specie mostrata si ricaricano subito, invece di restare quelli precedenti
   * finché non si sceglie di nuovo la specie.
   */
  const applyNewData = useCallback((latest) => {
    setManifest(latest);
    const shown = speciesRef.current;
    if (!shown) return;
    setSelection(null); // i punti selezionati appartengono ai dati precedenti
    const list = SPECIES.map((s) => withRemoteStats(s, latest));
    const item = shown.all ? shown : (list.find((s) => s.slug === shown.slug) ?? shown);
    if (!shown.all) setSpecies(item);
    // Nuova richiesta: un caricamento ancora in corso (es. una specie appena scelta) viene
    // superato, quindi è questa richiesta a spegnere lo spinner (prima restava acceso).
    const request = ++loadRequest.current;
    if (!item.total) {
      setDatasets(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    loadDatasets(item, latest, list)
      .catch(() => null)
      .then((loaded) => {
        if (request !== loadRequest.current) return;
        setLoading(false);
        if (loaded) setDatasets(loaded); // se non si leggono, restano i punti già mostrati
      });
  }, []);

  // Dati aggiornati: prima quelli già scaricati, poi (al massimo ogni 12 ore) controllo online.
  // Mentre si scaricano i file nuovi compare un avviso discreto sotto la barra superiore.
  useEffect(() => {
    let active = true;
    (async () => {
      const stored = await loadStoredManifest();
      if (active && stored) setManifest(stored);
      const { manifest: latest, status } = await checkForUpdates({
        onDownloadStart: () => {
          if (active) setUpdatingData(true);
        },
      });
      if (!active) return;
      setUpdatingData(false);
      // negli altri casi il manifest è quello già salvato, appena impostato
      if (latest && (status === 'updated' || status === 'incomplete')) applyNewData(latest);
    })();
    return () => {
      active = false;
    };
  }, [applyNewData]);

  /** Aggiornamento manuale dalle Impostazioni: se arrivano dati nuovi, la mappa li mostra subito. */
  const updateNow = useCallback(async () => {
    const result = await checkForUpdates({ force: true, onDownloadStart: () => setUpdatingData(true) });
    setUpdatingData(false);
    if (result.manifest && (result.status === 'updated' || result.status === 'incomplete')) {
      applyNewData(result.manifest);
    }
    return result;
  }, [applyNewData]);

  // Dopo l'eliminazione la specie mostrata torna ai dati inclusi nell'app.
  const clearData = useCallback(async () => {
    await clearDownloadedData();
    applyNewData(null);
  }, [applyNewData]);

  const openWelcomeFromSettings = useCallback(() => {
    setSettingsOpen(false);
    setTimeout(() => setWelcomeOpen(true), 400);
  }, []);

  // "Tutte le specie": la voce si aggiorna con i dati (numero di specie e totale correnti)
  const topSpecies = species?.all ? allSpeciesItem : species;
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
      {/* Contenitore della mappa: su iOS riceve i tocchi per la selezione dei marker */}
      <View
        ref={mapContainerRef}
        style={StyleSheet.absoluteFill}
        onLayout={() => {
          // posizione della mappa nella vista principale: pageX/pageY dei tocchi sono relativi
          // alla stessa vista (measureInWindow si riferisce alla finestra, che può differire)
          mapContainerRef.current?.measure?.((x, y, w, h, pageX, pageY) => {
            mapOffsetRef.current = { x: pageX || 0, y: pageY || 0 };
            logTap('mappa', { x: pageX || 0, y: pageY || 0 }, `posizione della mappa, ${Math.round(w)}×${Math.round(h)}`);
          });
        }}
        onTouchStart={TAP_FROM_TOUCHES ? onMapTouchStart : undefined}
        onTouchMove={TAP_FROM_TOUCHES ? onMapTouchMove : undefined}
        onTouchEnd={TAP_FROM_TOUCHES ? onMapTouchEnd : undefined}
        onTouchCancel={TAP_FROM_TOUCHES ? onMapTouchCancel : undefined}
      >
      <MapView
        ref={mapRef}
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.mapBackground }]}
        initialRegion={ITALY_REGION}
        onRegionChange={trackRegion}
        onRegionChangeComplete={handleRegionChange}
        mapType={mapType}
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
        // nord sempre in alto e niente inclinazione: il calcolo del marker toccato è esatto
        rotateEnabled={false}
        pitchEnabled={false}
        zoomEnabled={!zoomLocked}
      >
        {area && (
          <Circle
            center={area.center}
            radius={area.radiusM}
            strokeColor="rgba(46,125,50,0.8)"
            fillColor="rgba(46,125,50,0.06)"
            strokeWidth={2}
          />
        )}
        {clusters.map((f) => {
          if (f.properties.cluster) {
            // il numero fa parte della chiave: su Android il marker è una bitmap che non si ridisegna
            return (
              <ClusterMarker
                key={`c-${f.properties.cluster_id}-${f.properties.records}`}
                feature={f}
                onPress={pressCluster}
              />
            );
          }
          // key stabile: i marker non vengono ricreati quando cambia la selezione, ma sì quando
          // cambia l'aspetto (filtri), perché su Android la bitmap non si ridisegnerebbe
          return (
            <DotMarker
              key={`d-${f.properties.id}-${f.properties.automatic ? 1 : 0}${f.properties.approximate ? 1 : 0}`}
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
            holes={(poly.buchi ?? []).map((h) => h.map(([longitude, latitude]) => ({ latitude, longitude })))}
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
      </View>

      {/* Barra superiore: specie selezionata e apertura dell'elenco */}
      <View
        style={[styles.topBar, { top: insets.top + 8 }]}
        onLayout={(e) => {
          const { y, height } = e.nativeEvent.layout;
          topBarBottomRef.current = y + height;
          setTopBarBottom(y + height);
        }}
      >
        <Pressable
          style={styles.speciesButton}
          onPress={() => setPanelOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={
            topSpecies
              ? `Specie mostrata: ${topSpecies.commonName}, ${
                  topSpecies.total === 0
                    ? 'nessuna segnalazione in Italia'
                    : `${visibleCount} segnalazioni${filtersActive ? ' con i filtri attivi' : ''}`
                }`
              : 'Scegli una specie'
          }
          accessibilityHint="Apre l'elenco delle specie"
        >
          <Text style={styles.appName}>IAS Tracker</Text>
          <Text style={styles.speciesName} numberOfLines={1}>
            {topSpecies ? topSpecies.commonName : 'Scegli una specie'}
          </Text>
          {topSpecies && (
            <Text style={styles.speciesMeta} numberOfLines={1}>
              <Text style={styles.italic}>{topSpecies.scientificName}</Text>
              {topSpecies.total === 0
                ? ' · nessuna segnalazione in Italia'
                : ` · ${visibleCount.toLocaleString('it-IT')} segnalazioni${area ? ` entro ${area.radiusM / 1000} km` : ''}`}
            </Text>
          )}
        </Pressable>
        {loading && (
          <ActivityIndicator style={styles.spinner} color={colors.primary} accessibilityLabel="Caricamento" />
        )}
        {species && !species.all && (
          <Pressable
            style={styles.infoRound}
            onPress={() => openSheet(species)}
            accessibilityRole="button"
            accessibilityLabel={`Scheda di ${species.commonName}`}
          >
            <Text style={styles.infoRoundText} allowFontScaling={false}>
              ⓘ
            </Text>
          </Pressable>
        )}
      </View>

      {/* Avvisi sotto la barra superiore: dati in aggiornamento, novità */}
      <View style={[styles.pills, { top: topBarBottom + 8 }]} pointerEvents="box-none">
        {updatingData && <StatusPill floating label="Aggiornamento dei dati in corso…" />}
        {area && (
          <Pressable
            style={styles.areaPill}
            onPress={() => changeArea(null)}
            accessibilityRole="button"
            accessibilityLabel={`Mostrate solo le segnalazioni entro ${area.radiusM / 1000} chilometri da te. Tocca per tornare a tutta Italia`}
          >
            <Text style={styles.areaPillText}>
              📍 Entro {area.radiusM / 1000} km da te <Text style={styles.areaPillAction}> · Tutta Italia ✕</Text>
            </Text>
          </Pressable>
        )}
        {newsBadge && !selection && (
          <Pressable
            style={styles.newsPill}
            onPress={openNews}
            accessibilityRole="button"
            accessibilityLabel={`${newsBadge}. Apri le novità`}
          >
            <Text style={styles.newsPillText}>● {newsBadge}</Text>
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
        onOpenSheet={(slug) => openSheet(speciesList.find((s) => s.slug === slug) ?? null)}
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
        areaActive={!!area}
        onAreaChange={changeArea}
        currentSpecies={species}
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
            area={area}
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
        onSettings={() => openFromPanel(setSettingsOpen)}
        onRegions={() => openFromPanel(setRegionsOpen)}
        onNotebook={() => openFromPanel(setNotebookOpen)}
        onNews={() => {
          setPanelOpen(false);
          setTimeout(openNews, 400);
        }}
        newsBadge={newsBadge}
        onClose={() => setPanelOpen(false)}
      />

      <RegionReport
        visible={regionsOpen}
        speciesList={speciesList}
        manifest={manifest}
        filters={filters}
        onShowSpecies={showSpeciesInRegion}
        onInfo={openSheetFromRegions}
        followedRegions={follows.regions}
        onToggleFollowRegion={(code) => changeFollow('regions', code)}
        onClose={() => setRegionsOpen(false)}
      />

      <NewsScreen
        visible={newsOpen}
        news={news}
        follows={follows}
        seenAtOpen={seenAtOpen}
        speciesList={speciesList}
        notify={notify}
        onToggleNotify={changeNotify}
        onToggleFollow={changeFollow}
        onShowSpecies={showSpeciesFromNews}
        onInfo={openSheetFromNews}
        onShow={markNewsSeen}
        onClose={() => setNewsOpen(false)}
      />

      <WelcomeScreen visible={welcomeOpen} onDone={finishWelcome} />

      <SettingsScreen
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        dataDate={dataDate(manifest)}
        updating={updatingData}
        onUpdateNow={updateNow}
        onClearData={clearData}
        mapType={mapType}
        onChangeMapType={changeMapType}
        showGrid={showGrid}
        onToggleGrid={toggleGrid}
        filtersSummary={filtersSummary}
        onResetFilters={resetFilters}
        theme={theme}
        onChangeTheme={changeTheme}
        signature={signature}
        onChangeSignature={changeSignature}
        notify={notify}
        canNotify={hasFollows(follows)}
        onToggleNotify={changeNotify}
        onOpenWelcome={openWelcomeFromSettings}
      />

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
        onClose={closeSheet}
        onOpenSpecies={(slug) => setSheetSpecies(speciesList.find((s) => s.slug === slug) ?? null)}
        followed={sheetSpecies ? follows.species.includes(sheetSpecies.slug) : false}
        onToggleFollow={(slug) => changeFollow('species', slug)}
      />
      <ReportScreen
        key={reportKey}
        visible={reportOpen}
        initialSpecies={species?.all ? null : species}
        initialKind={reportKind}
        signature={signature}
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
    pills: { position: 'absolute', left: 12, right: 12, alignItems: 'flex-start', gap: 8 },
    newsPill: {
      backgroundColor: c.surface,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 7,
      ...shadow,
    },
    newsPillText: { color: c.warning, fontSize: 13, fontWeight: '700' },
    areaPill: {
      backgroundColor: c.surface,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 7,
      ...shadow,
    },
    areaPillText: { color: c.primary, fontSize: 13, fontWeight: '700' },
    areaPillAction: { color: c.textSecondary, fontWeight: '600' },
  });
};
