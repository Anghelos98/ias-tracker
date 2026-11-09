// Registro di diagnostica delle build di prova (src/diagnostics/log.js).

// la scrittura sul file è raggruppata con un timer: timer finti, nessun timer resta acceso
jest.useFakeTimers();

// File in memoria al posto di expo-file-system
const mockFiles = new Map();
jest.mock('expo-file-system', () => {
  class File {
    constructor(dir, name) {
      this.uri = `${dir}/${name}`;
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    create() {
      mockFiles.set(this.uri, '');
    }
    delete() {
      mockFiles.delete(this.uri);
    }
    textSync() {
      return mockFiles.get(this.uri);
    }
    writeSync(text) {
      mockFiles.set(this.uri, text);
    }
  }
  return { File, Paths: { document: 'doc', cache: 'cache' } };
});
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ expoConfig: { version: '1.0.0' }, executionEnvironment: 'standalone' }));

/** Carica il modulo da capo, con il registro attivo o no. */
function loadLog(enabled) {
  let mod;
  const previous = process.env.EXPO_PUBLIC_DIAGNOSTICS;
  if (enabled) process.env.EXPO_PUBLIC_DIAGNOSTICS = '1';
  else delete process.env.EXPO_PUBLIC_DIAGNOSTICS;
  jest.isolateModules(() => {
    mod = require('../src/diagnostics/log');
  });
  if (previous === undefined) delete process.env.EXPO_PUBLIC_DIAGNOSTICS;
  else process.env.EXPO_PUBLIC_DIAGNOSTICS = previous;
  return mod;
}

const LOG_FILE = 'doc/registro-diagnostica.txt';

beforeEach(() => {
  mockFiles.clear();
});

test('formato delle righe: ora locale, categoria, messaggi su più righe rientrati', () => {
  const { formatLine, timestamp } = loadLog(false);
  const date = new Date(2026, 10, 9, 8, 5, 3, 7);
  expect(timestamp(date)).toBe('2026-11-09 08:05:03.007');
  expect(formatLine('mappa', 'pronta', date)).toBe('2026-11-09 08:05:03.007 [mappa] pronta');
  expect(formatLine('errore', 'a\nb', date)).toBe('2026-11-09 08:05:03.007 [errore] a\n    b');
  // messaggi lunghissimi troncati
  expect(formatLine('x', 'y'.repeat(5000), date).length).toBeLessThan(1600);
});

test('descrizione dei valori passati alla console', () => {
  const { describeValue } = loadLog(false);
  expect(describeValue('testo')).toBe('testo');
  expect(describeValue({ a: 1 })).toBe('{"a":1}');
  expect(describeValue(undefined)).toBe('undefined');
  const err = new TypeError('rotto');
  expect(describeValue(err)).toMatch(/^TypeError: rotto/);
  const cyclic = {};
  cyclic.self = cyclic;
  expect(describeValue(cyclic)).toBe('[object Object]');
});

test('tiene solo le ultime righe', () => {
  const { keepLast } = loadLog(false);
  expect(keepLast([1, 2, 3], 2)).toEqual([2, 3]);
  expect(keepLast([1], 2)).toEqual([1]);
});

test('disattivato (versione pubblica): non scrive nulla', () => {
  const log = loadLog(false);
  expect(log.DIAGNOSTICS_ENABLED).toBe(false);
  log.diag('mappa', 'pronta');
  log.diagError('errore', new Error('x'));
  log.flushDiagnostics();
  log.installDiagnostics();
  expect(log.diagnosticsCount()).toBe(0);
  expect(mockFiles.size).toBe(0);
});

test('attivo: annota, salva sul file e lo ritrova al riavvio', () => {
  let log = loadLog(true);
  log.diag('specie', 'Ailanto: caricamento');
  log.diagError('errore', new Error('rotto')); // gli errori si scrivono subito
  expect(mockFiles.get(LOG_FILE)).toMatch(/\[specie\] Ailanto: caricamento\n.*\[errore\] Error: rotto/);
  expect(log.diagnosticsCount()).toBe(2);

  // nuovo avvio: le righe precedenti restano, comprese quelle su più righe
  log = loadLog(true);
  log.diag('avvio', 'di nuovo');
  expect(log.diagnosticsCount()).toBe(3);

  log.clearDiagnostics();
  expect(log.diagnosticsCount()).toBe(1); // resta solo "registro cancellato"
});

test('attivo: al massimo MAX_LINES righe', () => {
  const log = loadLog(true);
  for (let i = 0; i < log.MAX_LINES + 50; i++) log.diag('prova', `evento ${i}`);
  log.flushDiagnostics();
  expect(log.diagnosticsCount()).toBe(log.MAX_LINES);
  const text = mockFiles.get(LOG_FILE);
  expect(text).not.toMatch(/evento 49\n/);
  expect(text).toMatch(/evento 1049$/);
});

test('attivo: condivisione di una copia con il riepilogo del telefono', async () => {
  const Sharing = require('expo-sharing');
  const log = loadLog(true);
  log.diag('mappa', 'pronta');
  await log.shareDiagnostics();
  expect(Sharing.shareAsync).toHaveBeenCalledWith(
    expect.stringMatching(/^cache\/ias-tracker_registro_\d{8}-\d{4}\.txt$/),
    expect.objectContaining({ mimeType: 'text/plain' }),
  );
  const copy = [...mockFiles.entries()].find(([uri]) => uri.startsWith('cache/'))[1];
  expect(copy).toMatch(/^IAS Tracker 1\.0\.0 · /);
  expect(copy).toMatch(/\[mappa\] pronta/);
});
