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

const DEG = Math.PI / 180;

/**
 * Bordi superiore e inferiore della regione, in coordinate di Mercatore.
 * La mappa mette il centro della regione al centro dello schermo, quindi i bordi sono
 * simmetrici in Mercatore (non in gradi) e distano in gradi esattamente latitudeDelta.
 *
 * Formula chiusa: con i bordi a latitudine m ± Δ/2 e merc(φ) = atanh(sin φ), la condizione
 * merc(alto) + merc(basso) = 2·merc(centro) si riduce a sin m = cos(Δ/2) · sin(centro).
 * (Sostituisce una bisezione di 60 passi, ripetuta per ogni marker a ogni tocco.)
 */
function verticalBounds(region) {
  const half = region.latitudeDelta / 2;
  const middle = Math.asin(Math.cos(half * DEG) * Math.sin(region.latitude * DEG)) / DEG;
  return { top: toMercator(middle + half), bottom: toMercator(middle - half) };
}

/**
 * Riquadro della mappa che corrisponde alla regione: margini (punti) tra i bordi della vista e
 * i bordi della regione. Con margini nulli la regione occupa tutta la vista.
 *
 * Su iOS la regione riportata da Apple Maps NON copre tutta la vista: misurato sul telefono,
 * i pallini risultavano calcolati fino a 40 px più in alto del punto in cui sono disegnati
 * (scarto che cresce allontanandosi dal centro, solo in verticale), e i tocchi andavano persi.
 * App.js misura il riquadro reale con la mappa stessa (pointForCoordinate, vedi insetsFromEdges).
 */
export const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

/**
 * Conversione da coordinate geografiche a punti dello schermo per una regione e una mappa
 * di date dimensioni (nord in alto, senza inclinazione). I bordi si calcolano una volta sola:
 * conviene quando si proiettano molti punti con la stessa regione.
 * @param {{width: number, height: number, insets?: typeof NO_INSETS}} size
 */
export function screenProjector(region, { width, height, insets = NO_INSETS }) {
  const { top, bottom } = verticalBounds(region);
  const west = region.longitude - region.longitudeDelta / 2;
  const innerWidth = width - insets.left - insets.right;
  const innerHeight = height - insets.top - insets.bottom;
  return {
    x: (longitude) => insets.left + ((longitude - west) / region.longitudeDelta) * innerWidth,
    y: (latitude) => insets.top + ((top - toMercator(latitude)) / (top - bottom)) * innerHeight,
  };
}

/** Posizione verticale (in punti dello schermo) di una latitudine dentro la regione visibile. */
export function latitudeToScreenY(latitude, region, mapHeight, insets = NO_INSETS) {
  return screenProjector(region, { width: 0, height: mapHeight, insets }).y(latitude);
}

/**
 * Nuova latitudine del centro della mappa per spostare verticalmente il contenuto di
 * `shiftY` punti (positivo = il contenuto sale sullo schermo). Lo zoom non cambia.
 */
export function shiftCenterLatitude(region, mapHeight, shiftY, insets = NO_INSETS) {
  const { top, bottom } = verticalBounds(region);
  const mercatorPerPoint = (top - bottom) / (mapHeight - insets.top - insets.bottom);
  return fromMercator(toMercator(region.latitude) - shiftY * mercatorPerPoint);
}

/** Posizione orizzontale (in punti dello schermo) di una longitudine dentro la regione visibile. */
export function longitudeToScreenX(longitude, region, mapWidth) {
  const west = region.longitude - region.longitudeDelta / 2;
  return ((longitude - west) / region.longitudeDelta) * mapWidth;
}

/** Angoli nord-ovest e sud-est della regione (coordinate geografiche). */
export function regionCorners(region) {
  const { top, bottom } = verticalBounds(region);
  const halfLon = region.longitudeDelta / 2;
  return {
    northWest: { latitude: fromMercator(top), longitude: region.longitude - halfLon },
    southEast: { latitude: fromMercator(bottom), longitude: region.longitude + halfLon },
  };
}

/**
 * Margini del riquadro della regione a partire dai punti dello schermo in cui la mappa disegna
 * gli angoli nord-ovest e sud-est (regionCorners). Restituisce null se i valori non sono
 * plausibili (il riquadro deve occupare buona parte della vista): si tengono quelli precedenti.
 */
export function insetsFromEdges(northWest, southEast, { width, height }) {
  const values = [northWest?.x, northWest?.y, southEast?.x, southEast?.y];
  if (!values.every(Number.isFinite) || !width || !height) return null;
  const insets = {
    top: northWest.y,
    left: northWest.x,
    bottom: height - southEast.y,
    right: width - southEast.x,
  };
  const plausible =
    southEast.x - northWest.x > width * 0.5 &&
    southEast.y - northWest.y > height * 0.5 &&
    Math.abs(insets.top) < height * 0.25 &&
    Math.abs(insets.bottom) < height * 0.25 &&
    Math.abs(insets.left) < width * 0.25 &&
    Math.abs(insets.right) < width * 0.25;
  return plausible ? insets : null;
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
export function findFeatureAtPoint(features, point, region, size, hitArea) {
  const project = screenProjector(region, size);
  let best = null;
  let bestScore = Infinity;
  let bestDistance = Infinity;
  for (const f of features) {
    const [lon, lat] = f.geometry.coordinates;
    const distance = Math.hypot(project.x(lon) - point.x, project.y(lat) - point.y);
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
