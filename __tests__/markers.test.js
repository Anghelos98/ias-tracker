// Marker della mappa: supercluster crea oggetti nuovi a ogni spostamento della mappa, quindi
// memo deve confrontare il contenuto (altrimenti tutti i marker si ridisegnano ogni volta).

jest.mock('react-native-maps', () => ({ Marker: 'Marker' }));

const { sameFeature } = require('../src/components/MapMarkers');

const feature = (coordinates, properties) => ({ type: 'Feature', geometry: { type: 'Point', coordinates }, properties });

test('punto: stesse proprietà e stessa posizione, anche se l’oggetto è nuovo', () => {
  const props = { id: 'a:1', records: [] };
  expect(sameFeature(feature([12.5, 41.9], props), feature([12.5, 41.9], props))).toBe(true);
  // dati o filtri cambiati: proprietà nuove
  expect(sameFeature(feature([12.5, 41.9], props), feature([12.5, 41.9], { ...props }))).toBe(false);
  expect(sameFeature(feature([12.5, 41.9], props), feature([12.6, 41.9], props))).toBe(false);
});

test('cluster: stesso identificativo, numero e posizione', () => {
  const c = (id, records, coords = [12.5, 41.9]) => feature(coords, { cluster: true, cluster_id: id, records });
  expect(sameFeature(c(7, 12), c(7, 12))).toBe(true);
  expect(sameFeature(c(7, 12), c(7, 13))).toBe(false);
  expect(sameFeature(c(7, 12), c(8, 12))).toBe(false);
  expect(sameFeature(c(7, 12), c(7, 12, [12.5, 42]))).toBe(false);
  // un punto e un cluster nella stessa posizione non sono lo stesso elemento
  expect(sameFeature(c(7, 1), feature([12.5, 41.9], { id: 'a:1', records: 1 }))).toBe(false);
});
