// Distanze sulla Terra e zone circolari ("Vicino a me"). Funzioni pure, testate in __tests__/.

const EARTH_RADIUS_M = 6371008.8;
const toRad = (deg) => (deg * Math.PI) / 180;

/** Distanza in metri tra due punti (formula dell'emisenoverso). */
export function distanceMeters(a, b) {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Riquadro grossolano attorno a un cerchio, per scartare in fretta i punti lontani prima del
 * calcolo esatto della distanza.
 */
export function circleBox(center, radiusM) {
  const dLat = radiusM / 111320;
  const dLon = dLat / Math.max(0.01, Math.cos(toRad(center.latitude)));
  return { dLat, dLon };
}

/**
 * Funzione (lon, lat) => true se il punto è dentro la zona { center, radiusM }; null senza zona.
 * @param {{center: {latitude: number, longitude: number}, radiusM: number} | null} area
 */
export function areaPredicate(area) {
  if (!area) return null;
  const { center, radiusM } = area;
  const { dLat, dLon } = circleBox(center, radiusM);
  return (lon, lat) =>
    Math.abs(lat - center.latitude) <= dLat &&
    Math.abs(lon - center.longitude) <= dLon &&
    distanceMeters(center, { latitude: lat, longitude: lon }) <= radiusM;
}
