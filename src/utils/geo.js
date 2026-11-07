import { Dimensions } from 'react-native';

export const ITALY_REGION = {
  latitude: 41.9,
  longitude: 12.5,
  latitudeDelta: 11,
  longitudeDelta: 11,
};

/** Livello di zoom "stile web map" (0-20) corrispondente alla regione visibile. */
export function regionToZoom(region) {
  const { width } = Dimensions.get('window');
  const zoom = Math.log2((360 * (width / 256)) / region.longitudeDelta);
  return Math.max(0, Math.min(20, Math.round(zoom)));
}

/** Bounding box [ovest, sud, est, nord] della regione visibile. */
export function regionToBBox(region) {
  return [
    region.longitude - region.longitudeDelta / 2,
    region.latitude - region.latitudeDelta / 2,
    region.longitude + region.longitudeDelta / 2,
    region.latitude + region.latitudeDelta / 2,
  ];
}

/** Regione che inquadra un bbox [ovest, sud, est, nord], con un piccolo margine. */
export function bboxToRegion([west, south, east, north], padding = 1.3) {
  return {
    latitude: (south + north) / 2,
    longitude: (west + east) / 2,
    latitudeDelta: Math.max((north - south) * padding, 0.05),
    longitudeDelta: Math.max((east - west) * padding, 0.05),
  };
}

// --- Proiezione di Mercatore (quella usata dalla mappa) -----------------------------

const toMercator = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const fromMercator = (y) => (Math.atan(Math.exp(y)) * 360) / Math.PI - 90;

/**
 * Bordi superiore e inferiore della regione, in coordinate di Mercatore.
 * La mappa mette il centro della regione al centro dello schermo, quindi i bordi sono
 * simmetrici in Mercatore (non in gradi) e distano in gradi esattamente latitudeDelta.
 * Si trova la semi-ampiezza k con merc(top) = c + k, merc(bottom) = c - k per bisezione.
 */
function verticalBounds(region) {
  const c = toMercator(region.latitude);
  const span = (k) => fromMercator(c + k) - fromMercator(c - k);
  let lo = 0;
  let hi = 10;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (span(mid) < region.latitudeDelta) lo = mid;
    else hi = mid;
  }
  const k = (lo + hi) / 2;
  return { top: c + k, bottom: c - k };
}

/** Posizione verticale (in punti dello schermo) di una latitudine dentro la regione visibile. */
export function latitudeToScreenY(latitude, region, mapHeight) {
  const { top, bottom } = verticalBounds(region);
  return ((top - toMercator(latitude)) / (top - bottom)) * mapHeight;
}

/**
 * Nuova latitudine del centro della mappa per spostare verticalmente il contenuto di
 * `shiftY` punti (positivo = il contenuto sale sullo schermo). Lo zoom non cambia.
 */
export function shiftCenterLatitude(region, mapHeight, shiftY) {
  const { top, bottom } = verticalBounds(region);
  const mercatorPerPoint = (top - bottom) / mapHeight;
  return fromMercator(toMercator(region.latitude) - shiftY * mercatorPerPoint);
}

/** Posizione orizzontale (in punti dello schermo) di una longitudine dentro la regione visibile. */
export function longitudeToScreenX(longitude, region, mapWidth) {
  const west = region.longitude - region.longitudeDelta / 2;
  return ((longitude - west) / region.longitudeDelta) * mapWidth;
}

/**
 * Elemento della mappa (cluster o punto) toccato: quello il cui BORDO è più vicino al punto
 * toccato, purché entro la tolleranza. Restituisce null se nessuno è abbastanza vicino.
 *
 * Confrontare la distanza dal bordo (e non dal centro) fa sì che un tocco dentro un cerchio
 * grande scelga sempre il cerchio, e che un tocco tra due elementi scelga quello più vicino.
 *
 * @param {object[]} features   cluster e punti visibili (GeoJSON)
 * @param {{x: number, y: number}} point   punto toccato, in punti dello schermo dentro la mappa
 * @param {object} region       regione visibile della mappa (nord in alto, senza inclinazione)
 * @param {{width: number, height: number}} size   dimensioni della mappa in punti
 * @param {(feature: object) => number | {visual: number, slop: number}} hitArea
 *   area di tocco: raggio disegnato (`visual`) e tolleranza oltre il bordo (`slop`), in punti;
 *   un numero equivale a { visual: 0, slop: numero }
 * @returns {object|null}
 */
export function findFeatureAtPoint(features, point, region, { width, height }, hitArea) {
  let best = null;
  let bestScore = Infinity;
  let bestDistance = Infinity;
  for (const f of features) {
    const [lon, lat] = f.geometry.coordinates;
    const distance = Math.hypot(
      longitudeToScreenX(lon, region, width) - point.x,
      latitudeToScreenY(lat, region, height) - point.y,
    );
    const area = hitArea(f);
    const { visual, slop } = typeof area === 'number' ? { visual: 0, slop: area } : area;
    const score = Math.max(0, distance - visual); // distanza dal bordo (0 = dentro)
    if (score > slop) continue;
    if (score < bestScore || (score === bestScore && distance < bestDistance)) {
      best = f;
      bestScore = score;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Come findFeatureAtPoint, ma a partire dalle coordinate geografiche del tocco (evento
 * onPress della mappa).
 *
 * @param {{latitude: number, longitude: number}} tap   coordinate del tocco
 */
export function findTappedFeature(features, tap, region, size, hitRadius) {
  const point = {
    x: longitudeToScreenX(tap.longitude, region, size.width),
    y: latitudeToScreenY(tap.latitude, region, size.height),
  };
  return findFeatureAtPoint(features, point, region, size, hitRadius);
}
