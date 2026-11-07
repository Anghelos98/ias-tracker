// Calcolo delle specie segnalate vicino a una posizione. Funzioni pure, testate in __tests__/.

import { passesFilters, todayDay } from './points';

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

/** "350 m", "2,4 km", "12 km" */
export function formatDistance(meters) {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  const km = meters / 1000;
  return `${km.toLocaleString('it-IT', { maximumFractionDigits: km < 10 ? 1 : 0 })} km`;
}

/**
 * Specie con almeno una segnalazione entro `radiusM` dalla posizione, ordinate per distanza
 * della segnalazione più vicina. Rispetta i filtri dell'utente.
 *
 * @param {{species: object, data: object}[]} datasets  punti di ogni specie (formato compatto)
 * @param {{latitude: number, longitude: number}} position
 * @param {number} radiusM
 * @param {import('./points').Filters} filters
 * @returns {{species: object, count: number, nearest: number, nearestPoint: {latitude: number, longitude: number}}[]}
 */
export function speciesNearby(datasets, position, radiusM, filters) {
  // Riquadro grossolano per scartare in fretta i punti lontani prima del calcolo esatto.
  const dLat = radiusM / 111320;
  const dLon = dLat / Math.max(0.01, Math.cos(toRad(position.latitude)));
  const results = [];
  const today = todayDay();
  for (const { species, data } of datasets) {
    let count = 0;
    let nearest = Infinity;
    let nearestPoint = null;
    for (const [lon, lat, year, , automatic, uncertainty, , , , day] of data.punti) {
      if (Math.abs(lat - position.latitude) > dLat || Math.abs(lon - position.longitude) > dLon) continue;
      const record = { year, automatic: automatic === 1, uncertainty: uncertainty ?? null, day: day ?? null };
      if (!passesFilters(record, filters, today)) continue;
      const d = distanceMeters(position, { latitude: lat, longitude: lon });
      if (d > radiusM) continue;
      count += 1;
      if (d < nearest) {
        nearest = d;
        nearestPoint = { latitude: lat, longitude: lon };
      }
    }
    if (count > 0) results.push({ species, count, nearest, nearestPoint });
  }
  return results.sort((a, b) => a.nearest - b.nearest);
}
