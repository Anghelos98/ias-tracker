// Controlli sulla forma dei dati scaricati (src/data/remote.js).
//
// 1. Tutti i file inclusi nell'app, prodotti dalla stessa pipeline dei dati pubblicati,
//    devono passare: un controllo troppo severo scarterebbe in silenzio gli aggiornamenti
//    settimanali (l'app resterebbe ferma ai dati dell'installazione). Se la pipeline cambia
//    formato, questo test lo segnala prima della pubblicazione.
// 2. Le forme che farebbero chiudere l'app vanno rifiutate.
import fs from 'fs';
import path from 'path';

import { isValidDataFile } from '../src/data/remote';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-file-system', () => ({ Paths: {}, File: jest.fn(), Directory: jest.fn() }));

const DATA = path.dirname(require.resolve('../assets/data/news.json'));
const read = (...parts) => JSON.parse(fs.readFileSync(path.join(DATA, ...parts), 'utf8'));
const filesIn = (dir) => fs.readdirSync(path.join(DATA, dir)).filter((f) => f.endsWith('.json'));

describe("i dati inclusi nell'app passano tutti i controlli", () => {
  test.each([
    ['punti', 'species'],
    ['scheda', 'sheets'],
    ['griglia', 'grid'],
  ])('%s (assets/data/%s)', (kind, dir) => {
    const files = filesIn(dir);
    expect(files.length).toBeGreaterThan(0);
    const rejected = files.filter((f) => !isValidDataFile(kind, read(dir, f)));
    expect(rejected).toEqual([]);
  });

  test.each([
    ['foto', 'photos.json'],
    ['simili', 'lookalikes.json'],
    ['europa', 'easin.json'],
    ['novita', 'news.json'],
  ])('%s (%s)', (kind, file) => {
    expect(isValidDataFile(kind, read(file))).toBe(true);
  });
});

// --- Punti -----------------------------------------------------------------------------

const FONTI = [{ nome: 'iNaturalist', licenza: 'CC BY 4.0', link: 'https://www.inaturalist.org/observations/' }];
const POINT = [12.49, 41.89, 2024, 0, 0, 15, 12, 4567890123, 98765, 19800];
const points = (...punti) => ({ fonti: FONTI, punti });

test('punti: formati validi, anche delle versioni precedenti e successive', () => {
  expect(isValidDataFile('punti', points(POINT))).toBe(true);
  expect(isValidDataFile('punti', points([12.49, 41.89, null, 0, 1, null]))).toBe(true); // 6 campi
  expect(isValidDataFile('punti', points([...POINT, 'campo futuro']))).toBe(true);
  expect(isValidDataFile('punti', { fonti: [{ nome: 'X', licenza: null }], punti: [] })).toBe(true);
});

test("punti: ogni campo che potrebbe chiudere l'app viene rifiutato", () => {
  const withField = (i, value) => {
    const p = [...POINT];
    p[i] = value;
    return points(p);
  };
  for (const bad of [
    points(null), // destrutturazione di null
    points('12.49,41.89'),
    withField(0, '12.49'), // coordinate non numeriche o fuori scala
    withField(0, NaN),
    withField(1, 999),
    withField(2, { anno: 2024 }), // anno mostrato come testo: un oggetto chiude l'app
    withField(3, 5), // fonte inesistente
    withField(3, -1),
    withField(4, 'sì'),
    withField(5, -10),
    withField(6, '12'),
    withField(7, { id: 1 }),
    withField(8, 'x'.repeat(65)),
    withField(9, 1e12), // giorno fuori da qualsiasi data: toISOString lancia un errore
    withField(9, 19800.5),
  ]) {
    expect(isValidDataFile('punti', bad)).toBe(false);
  }
  expect(isValidDataFile('punti', { fonti: [{ nome: { testo: 'x' } }], punti: [] })).toBe(false);
  expect(isValidDataFile('punti', { fonti: [null], punti: [] })).toBe(false);
  expect(isValidDataFile('punti', { fonti: FONTI, punti: {} })).toBe(false);
});

// --- Schede, griglie e file comuni -----------------------------------------------------------

test('scheda ISPRA: testi che non sono testi ed elenchi che non sono elenchi vengono rifiutati', () => {
  const sheet = read('sheets', 'ailanthus-altissima.json');
  expect(isValidDataFile('scheda', { ...sheet, campo_nuovo: { x: 1 } })).toBe(true);
  for (const change of [
    { descrizione: 'un testo invece di un elenco' }, // .map su un testo
    { descrizione: [{ p: 'x' }] },
    { presenza_italia: 3 },
    { sezioni: [{ titolo: 'A', blocchi: { testo: 'x' } }] },
    { sezioni: [{ titolo: 'A', blocchi: [{ testo: ['x'] }] }] },
    { fonte: 'ISPRA' },
    { fonte: { url: { href: 'x' } } },
  ]) {
    expect(isValidDataFile('scheda', { ...sheet, ...change })).toBe(false);
  }
  expect(isValidDataFile('scheda', [])).toBe(false);
});

test('griglia: poligoni con coordinate non valide vengono rifiutati (li disegna la mappa)', () => {
  const ring = [
    [12, 41],
    [12.1, 41],
    [12.1, 41.1],
    [12, 41],
  ];
  expect(isValidDataFile('griglia', { poligoni: [{ esterno: ring, buchi: [] }] })).toBe(true);
  expect(isValidDataFile('griglia', { poligoni: [{ esterno: [[12, 'x']], buchi: [] }] })).toBe(false);
  expect(isValidDataFile('griglia', { poligoni: [{ esterno: ring, buchi: [[[200, 41]]] }] })).toBe(false);
  expect(isValidDataFile('griglia', { poligoni: [{ buchi: [] }] })).toBe(false);
});

test('foto, specie simili ed EASIN: voci malformate vengono rifiutate', () => {
  const photo = { url: 'https://x.y/a.jpg', pagina: 'https://x.y/p', autore: 'A', licenza: 'CC BY' };
  expect(isValidDataFile('foto', { specie: { a: [photo] } })).toBe(true);
  expect(isValidDataFile('foto', { specie: { a: photo } })).toBe(false); // .map su un oggetto
  expect(isValidDataFile('foto', { specie: { a: [{ ...photo, autore: undefined }] } })).toBe(false); // CC BY senza autore
  expect(isValidDataFile('foto', { specie: [] })).toBe(false);

  expect(isValidDataFile('simili', { specie: { a: { voci: [{ citazione: 'c', simili: ['b'] }] } } })).toBe(true);
  expect(isValidDataFile('simili', { specie: { a: { voci: [{ citazione: 'c', simili: 'b' }] } } })).toBe(false);
  expect(isValidDataFile('simili', { specie: { a: { correlate: 'b' } } })).toBe(false);

  const easin = {
    url: 'https://x.y',
    paesi_presenza: ['IT'],
    vie_introduzione: [],
    impatti: [],
    prima_introduzione_europa: null,
  };
  expect(isValidDataFile('europa', { specie: { a: easin } })).toBe(true);
  expect(isValidDataFile('europa', { specie: { a: { ...easin, impatti: [{ settore: 'x' }] } } })).toBe(false);
  expect(isValidDataFile('europa', { specie: { a: { ...easin, prima_introduzione_europa: { anno: {} } } } })).toBe(
    false,
  );
  expect(isValidDataFile('europa', { specie: { a: { ...easin, paesi_presenza: 'IT' } } })).toBe(false);
});

test('tipo di file sconosciuto: rifiutato', () => {
  expect(isValidDataFile('altro', {})).toBe(false);
});
