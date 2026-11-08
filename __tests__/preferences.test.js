jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const AsyncStorage = require('@react-native-async-storage/async-storage');
const {
  SIGNATURE_MAX,
  loadFilters,
  loadFollows,
  loadMapType,
  loadSignature,
  loadTheme,
  saveSignature,
} = require('../src/data/preferences');
const { DEFAULT_FILTERS } = require('../src/data/points');
const { isValidPointsData, withRemoteStats } = require('../src/data/remote');
const { exportRows } = require('../src/data/exportData');

beforeEach(async () => {
  await AsyncStorage.clear();
});

test('filtri salvati: solo chiavi note e con il tipo giusto', async () => {
  await AsyncStorage.setItem(
    'ias-tracker/filters/v1',
    JSON.stringify({ includeAutomatic: 'sì', minYear: 2010, maxUncertainty: null, altro: 1 }),
  );
  expect(await loadFilters()).toEqual({ ...DEFAULT_FILTERS, minYear: 2010 });
});

test('filtri non leggibili: valori predefiniti', async () => {
  await AsyncStorage.setItem('ias-tracker/filters/v1', 'null');
  expect(await loadFilters()).toEqual(DEFAULT_FILTERS);
});

test('specie e regioni seguite: elenchi sempre presenti', async () => {
  await AsyncStorage.setItem('ias-tracker/follows/v1', JSON.stringify({ species: 'ailanto' }));
  expect(await loadFollows()).toEqual({ species: [], regions: [] });
});

test('file dei punti scaricato: forma controllata', () => {
  expect(isValidPointsData({ punti: [], fonti: [] })).toBe(true);
  expect(isValidPointsData({ punti: [] })).toBe(false);
  expect(isValidPointsData(null)).toBe(false);
});

test('impostazioni: valori sconosciuti tornano ai predefiniti, firma limitata', async () => {
  expect(await loadTheme()).toBe('auto');
  await AsyncStorage.setItem('ias-tracker/theme/v1', 'viola');
  expect(await loadTheme()).toBe('auto');
  await AsyncStorage.setItem('ias-tracker/map-type/v1', 'hybrid');
  expect(await loadMapType()).toBe('hybrid');
  await saveSignature('x'.repeat(SIGNATURE_MAX + 10));
  expect(await loadSignature()).toHaveLength(SIGNATURE_MAX);
});

test('statistiche scaricate incomplete: si tengono quelle incluse nell’app', () => {
  const species = { slug: 'x', total: 10, automatic: 1, years: { min: 2000, max: 2020 }, bbox: [1, 2, 3, 4] };
  const manifest = { dati_gbif_al: '2999-01-01T00:00:00+00:00', specie: { x: { totale: null, bbox: 'rotto' } } };
  expect(withRemoteStats(species, manifest)).toMatchObject({ total: 10, automatic: 1, bbox: [1, 2, 3, 4] });
});

test('esportazione: una fonte mancante non blocca il file', () => {
  const data = { fonti: [], punti: [[12, 41, 2020, 3, 0, null, 9, 1, null]] };
  const [row] = exportRows([{ species: { scientificName: 'A b', commonName: 'A' }, data }], DEFAULT_FILTERS);
  expect(row.fonte).toBe('Fonte sconosciuta');
});

test('"Ultimi 5 anni" salvato dalla versione precedente (anno fisso) diventa relativo', async () => {
  const year = new Date().getFullYear();
  const old = { includeAutomatic: false, minYear: year - 4, maxAgeDays: null, maxUncertainty: null };
  await AsyncStorage.setItem('ias-tracker/filters/v1', JSON.stringify(old));
  expect(await loadFilters()).toEqual({ ...DEFAULT_FILTERS, lastYears: 5 });
  // salvato dalla versione attuale: il campo lastYears c'è, l'anno resta quello scelto
  await AsyncStorage.setItem('ias-tracker/filters/v1', JSON.stringify({ ...DEFAULT_FILTERS, minYear: year - 4 }));
  expect(await loadFilters()).toEqual({ ...DEFAULT_FILTERS, minYear: year - 4 });
  await AsyncStorage.setItem('ias-tracker/filters/v1', JSON.stringify({ ...DEFAULT_FILTERS, lastYears: 5 }));
  expect(await loadFilters()).toEqual({ ...DEFAULT_FILTERS, lastYears: 5 });
});
