/**
 * Colori dei marker della mappa, usati anche dalla legenda (FiltersPanel). File separato da
 * MapMarkers.js perché quello importa react-native-maps (modulo nativo).
 *
 * Il tipo di segnalazione è il colore del pallino (verde / arancione); la posizione
 * approssimativa ha il centro grigio e il bordo del colore del tipo; i gruppi sono viola, per
 * non confonderli con le singole segnalazioni.
 */
export const MARKER_COLORS = {
  verified: '#2e7d32',
  automatic: '#ef8a00',
  approximate: '#90a4ae',
  cluster: 'rgba(94,53,177,0.9)',
};
