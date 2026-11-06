import { memo, useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';

// Durata del tracking iniziale della vista (ms). Su Android il marker personalizzato
// diventa una bitmap: va disegnato prima di spegnere il tracking, altrimenti resta vuoto.
// (Su Apple Maps tracksViewChanges viene ignorato: i marker sono viste native.)
const INITIAL_TRACKING_MS = 500;

/**
 * Chi riceve il tocco sui marker:
 * - iOS (Apple Maps): il riconoscimento del tocco di un marker personalizzato dipende
 *   dalle dimensioni della sua vista React, che con la nuova architettura possono essere
 *   sbagliate, e i tocchi vanno persi. Per questo i marker NON gestiscono il tocco: lo
 *   riceve la MapView (che su iOS registra ogni tocco, anche sopra i marker) e App.js
 *   trova il marker più vicino al punto toccato (vedi hitTest in App.js).
 * - Android (Google Maps): il tocco su un marker non arriva alla MapView, quindi il marker
 *   lo gestisce direttamente (qui è affidabile: l'area è la bitmap del marker).
 */
const MARKER_HANDLES_TAP = Platform.OS === 'android';

/** tracksViewChanges acceso alla creazione del marker e spento poco dopo. */
function useInitialTracking() {
  const [tracking, setTracking] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setTracking(false), INITIAL_TRACKING_MS);
    return () => clearTimeout(t);
  }, []);
  return tracking;
}

function abbreviate(count) {
  if (count < 1000) return String(count);
  return `${(count / 1000).toLocaleString('it-IT', { maximumFractionDigits: count < 10000 ? 1 : 0 })}k`;
}

/** Diametro (px) del cerchio di un cluster: usato anche per il calcolo dei tocchi. */
export function clusterSize(count) {
  if (count < 10) return 30;
  if (count < 100) return 38;
  if (count < 1000) return 46;
  return 54;
}

/** Cluster numerato. */
export const ClusterMarker = memo(function ClusterMarker({ feature, onPress }) {
  const tracking = useInitialTracking();
  const [longitude, latitude] = feature.geometry.coordinates;
  const count = feature.properties.records;
  const size = clusterSize(count);
  return (
    <Marker
      coordinate={{ latitude, longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      onPress={MARKER_HANDLES_TAP ? () => onPress(feature) : undefined}
      tracksViewChanges={tracking}
    >
      <View style={[styles.cluster, { width: size, height: size, borderRadius: size / 2 }]}>
        {/* dimensione fissa: il cerchio non si adatta al testo ingrandito dalle impostazioni */}
        <Text style={styles.clusterText} allowFontScaling={false}>
          {abbreviate(count)}
        </Text>
      </View>
    </Marker>
  );
});

/**
 * Segnalazione isolata: pallino leggero; il tocco apre la scheda.
 * Quando è selezionato si ingrandisce con un'animazione elastica e mostra un anello rosso.
 * L'anello sta DENTRO lo stesso marker, centrato nello stesso contenitore del pallino:
 * così è concentrico per costruzione (un marker separato poteva risultare decentrato).
 * Su Android il tracking della vista è acceso alla creazione e durante l'animazione di
 * selezione, solo su questo marker.
 */
const DOT_SELECTED_SCALE = 1.5;
const DOT_BOX = 40; // lato del marker (px); i pallini distano almeno 40 px
export const DOT_HIT_RADIUS = DOT_BOX / 2; // raggio (px) entro cui un tocco seleziona il pallino
const RING = 30; // diametro dell'anello di selezione (px)

export const DotMarker = memo(function DotMarker({ feature, selected, onPress }) {
  const [tracking, setTracking] = useState(true);
  const [scale] = useState(() => new Animated.Value(selected ? DOT_SELECTED_SCALE : 1));
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      // creazione: tracking iniziale, poi la vista resta "fotografata"
      firstRender.current = false;
      const t = setTimeout(() => setTracking(false), INITIAL_TRACKING_MS);
      return () => clearTimeout(t);
    }
    // cambio di selezione: tracking acceso solo per la durata dell'animazione
    setTracking(true);
    const animation = Animated.spring(scale, {
      toValue: selected ? DOT_SELECTED_SCALE : 1,
      friction: 4,
      tension: 120,
      useNativeDriver: false, // la vista del marker deve ridisegnarsi nella mappa
    });
    animation.start(() => setTracking(false));
    return () => animation.stop();
  }, [selected, scale]);

  const [longitude, latitude] = feature.geometry.coordinates;
  return (
    <Marker
      coordinate={{ latitude, longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      onPress={MARKER_HANDLES_TAP ? () => onPress(feature) : undefined}
      tracksViewChanges={tracking}
    >
      {/* contenitore fisso: spazio per anello e pallino ingrandito */}
      <View style={styles.dotBox}>
        {selected && <View style={styles.ring} />}
        <Animated.View
          style={[
            styles.dot,
            feature.properties.automatic && styles.dotAutomatic,
            feature.properties.approximate &&
              (feature.properties.automatic ? styles.dotApproximateAutomatic : styles.dotApproximate),
            { transform: [{ scale }] },
          ]}
        />
      </View>
    </Marker>
  );
});

const styles = StyleSheet.create({
  cluster: {
    backgroundColor: 'rgba(46,125,50,0.85)',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clusterText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  dotBox: { width: DOT_BOX, height: DOT_BOX, alignItems: 'center', justifyContent: 'center' },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#2e7d32',
    borderWidth: 2,
    borderColor: '#fff',
  },
  dotAutomatic: { backgroundColor: '#ef8a00' },
  // posizione approssimativa: pallino vuoto con il bordo del colore della categoria
  dotApproximate: { backgroundColor: '#fff', borderColor: '#2e7d32', borderWidth: 2.5 },
  dotApproximateAutomatic: { backgroundColor: '#fff', borderColor: '#ef8a00', borderWidth: 2.5 },
  ring: {
    position: 'absolute',
    top: (DOT_BOX - RING) / 2,
    left: (DOT_BOX - RING) / 2,
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 3,
    borderColor: '#d32f2f',
    backgroundColor: 'rgba(211,47,47,0.12)',
  },
});
