// Taccuino salvato sul telefono: modifiche in sequenza, niente sovrascritture se l'elenco
// non si legge, URI delle foto ricostruiti dopo un aggiornamento dell'app (iOS).

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-file-system', () => {
  class File {
    constructor(...parts) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    get exists() {
      return false;
    }
    delete() {}
    copy() {}
  }
  class Directory extends File {
    create() {}
  }
  return { File, Directory, Paths: { document: { uri: 'file:///nuovo-contenitore/Documents' } } };
});

const AsyncStorage = require('@react-native-async-storage/async-storage');
const { addReport, deleteReport, loadReports, markSent } = require('../src/reports/storage');

const KEY = 'ias-tracker/reports/v1';
const entry = (id, extra = {}) => ({ id, latitude: 45, longitude: 9, photos: [], sent: [], note: '', ...extra });

beforeEach(async () => {
  await AsyncStorage.clear();
});

test('modifiche ravvicinate non si cancellano a vicenda', async () => {
  await Promise.all([addReport(entry('a')), addReport(entry('b')), addReport(entry('c'))]);
  await Promise.all([markSent('a', 'email'), deleteReport('b')]);
  const reports = await loadReports();
  expect(reports.map((r) => r.id).sort()).toEqual(['a', 'c']);
  expect(reports.find((r) => r.id === 'a').sent).toHaveLength(1);
});

test("se l'elenco salvato non si legge, non viene sovrascritto", async () => {
  await AsyncStorage.setItem(KEY, '{non è json');
  await expect(addReport(entry('nuova'))).rejects.toThrow();
  expect(await AsyncStorage.getItem(KEY)).toBe('{non è json');
  expect(await loadReports()).toEqual([]); // l'interfaccia mostra un elenco vuoto senza errori
  // la coda resta utilizzabile dopo un errore
  await AsyncStorage.removeItem(KEY);
  await addReport(entry('dopo'));
  expect((await loadReports()).map((r) => r.id)).toEqual(['dopo']);
});

test('URI delle foto ricostruiti nella cartella attuale dell’app', async () => {
  await AsyncStorage.setItem(
    KEY,
    JSON.stringify([entry('a', { photos: ['file:///vecchio-contenitore/Documents/reports/a-1.jpg'] })]),
  );
  const [report] = await loadReports();
  expect(report.photos).toEqual(['file:///nuovo-contenitore/Documents/reports/a-1.jpg']);
});

test('voci incomplete: campi mancanti completati, voci senza posizione scartate', async () => {
  await AsyncStorage.setItem(KEY, JSON.stringify([{ id: 'x', latitude: 45, longitude: 9 }, { id: 'y' }, null]));
  const reports = await loadReports();
  expect(reports).toHaveLength(1);
  expect(reports[0]).toMatchObject({ id: 'x', photos: [], sent: [], note: '' });
});
