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

/** Posizione verticale (in punti dello schermo) di una latitudine dentro la regione visibile. */
export function latitudeToScreenY(latitude, region, mapHeight) {
  const top = toMercator(region.latitude + region.latitudeDelta / 2);
  const bottom = toMercator(region.latitude - region.latitudeDelta / 2);
  return ((top - toMercator(latitude)) / (top - bottom)) * mapHeight;
}

/**
 * Nuova latitudine del centro della mappa per spostare verticalmente il contenuto di
 * `shiftY` punti (positivo = il contenuto sale sullo schermo). Lo zoom non cambia.
 */
export function shiftCenterLatitude(region, mapHeight, shiftY) {
  const top = toMercator(region.latitude + region.latitudeDelta / 2);
  const bottom = toMercator(region.latitude - region.latitudeDelta / 2);
  const mercatorPerPoint = (top - bottom) / mapHeight;
  return fromMercator(toMercator(region.latitude) - shiftY * mercatorPerPoint);
}

/** Posizione orizzontale (in punti dello schermo) di una longitudine dentro la regione visibile. */
export function longitudeToScreenX(longitude, region, mapWidth) {
  const west = region.longitude - region.longitudeDelta / 2;
  return ((longitude - west) / region.longitudeDelta) * mapWidth;
}
