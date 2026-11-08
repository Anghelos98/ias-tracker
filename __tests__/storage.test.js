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

// --- Spazio limitato su Android, taccuino illeggibile, invii confermati ------------------

describe('limiti e problemi del taccuino', () => {
  const { Platform } = require('react-native');
  const { NOTEBOOK_MAX_BYTES, NOTEBOOK_WARN, loadNotebook, utf8Length } = require('../src/reports/storage');
  const originalOS = Platform.OS;

  afterEach(() => {
    Platform.OS = originalOS;
  });

  test('byte in UTF-8 (la codifica di SQLite)', () => {
    expect(utf8Length('abc')).toBe(3);
    expect(utf8Length('è')).toBe(2);
    expect(utf8Length('€')).toBe(3);
    expect(utf8Length('🌿')).toBe(4);
    expect(utf8Length('a\ud83c')).toBe(4); // metà di una coppia surrogata alla fine
  });

  test('Android: oltre la soglia non si aggiungono voci, ma si può ancora eliminare e annotare invii', async () => {
    Platform.OS = 'android';
    await addReport(entry('grande', { note: 'x'.repeat(NOTEBOOK_MAX_BYTES - 2000) }));
    const before = await loadNotebook();
    expect(before.fill).toBeGreaterThan(NOTEBOOK_WARN); // avviso "quasi pieno" nel taccuino

    await expect(addReport(entry('nuova', { note: 'y'.repeat(2000) }))).rejects.toMatchObject({ code: 'full' });
    expect((await loadReports()).map((r) => r.id)).toEqual(['grande']); // niente sovrascritto

    await markSent('grande', 'email', true);
    expect((await loadReports())[0].sent).toHaveLength(1);
    await deleteReport('grande');
    expect((await loadNotebook()).fill).toBeLessThan(0.01);
    await addReport(entry('nuova', { note: 'y'.repeat(2000) })); // spazio liberato
  });

  test('iOS: nessun limite (i valori grandi sono file separati)', async () => {
    Platform.OS = 'ios';
    await addReport(entry('grande', { note: 'x'.repeat(NOTEBOOK_MAX_BYTES) }));
    await addReport(entry('altra'));
    expect((await loadNotebook()).fill).toBe(0);
  });

  test("taccuino illeggibile: segnalato all'interfaccia, mai sovrascritto", async () => {
    await AsyncStorage.setItem(KEY, '{"non è": "un elenco"}');
    expect(await loadNotebook()).toEqual({ entries: [], problem: 'unreadable', fill: 0 });
    await expect(addReport(entry('nuova'))).rejects.toMatchObject({ code: 'unreadable' });
    expect(await AsyncStorage.getItem(KEY)).toBe('{"non è": "un elenco"}');
  });

  test('invio annotato come confermato o no', async () => {
    await addReport(entry('a'));
    await markSent('a', 'email', true);
    await markSent('a', 'regione');
    const [report] = await loadReports();
    expect(report.sent.map((s) => [s.channel, s.confirmed])).toEqual([
      ['email', true],
      ['regione', false],
    ]);
  });
});
