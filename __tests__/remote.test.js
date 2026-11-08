// Aggiornamento dei dati: un file che non si scarica va ritentato al controllo successivo,
// anche se il manifest pubblicato non è cambiato.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-file-system', () => {
  const files = new Map();
  class File {
    constructor(...parts) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    get exists() {
      return files.has(this.uri);
    }
    create() {
      files.set(this.uri, '');
    }
    delete() {
      files.delete(this.uri);
    }
    write(text) {
      files.set(this.uri, text);
    }
    text() {
      return Promise.resolve(files.get(this.uri));
    }
    digest(algorithm) {
      if (algorithm !== 'SHA-256') throw new Error('algoritmo non previsto');
      const text = files.get(this.uri);
      return Promise.resolve(require('crypto').createHash('sha256').update(text, 'utf8').digest('hex'));
    }
    move(destination, { overwrite = false } = {}) {
      if (files.has(destination.uri) && !overwrite) throw new Error('destinazione esistente');
      files.set(destination.uri, files.get(this.uri));
      files.delete(this.uri);
      return Promise.resolve();
    }
  }
  class Directory extends File {
    get exists() {
      return true;
    }
  }
  return { File, Directory, Paths: { document: { uri: 'doc' } } };
});

const { createHash } = require('crypto');
const AsyncStorage = require('@react-native-async-storage/async-storage');
const { checkForUpdates } = require('../src/data/remote');

/** Impronta come nel manifest pubblicato (scripts/build_site.py): sha256, prime 16 cifre. */
const sha = (text) => createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
const POINTS = JSON.stringify({ punti: [], fonti: [] });
const POINTS_SHA = sha(POINTS);

const manifest = {
  schema: 1,
  generato_il: '2030-01-07T00:00:00Z',
  dati_gbif_al: '2030-01-07T00:00:00Z',
  specie: {
    'ailanthus-altissima': { totale: 1, punti: { file: 'species/ailanthus-altissima.json', sha: POINTS_SHA } },
    'impatiens-glandulifera': { totale: 1, punti: { file: 'species/impatiens-glandulifera.json', sha: POINTS_SHA } },
  },
};

function mockServer(failing) {
  global.fetch = jest.fn(async (url) => {
    const name = url.split('/').pop();
    if (name === 'manifest.json') return { ok: true, text: async () => JSON.stringify(manifest) };
    if (failing.has(name)) return { ok: false, status: 503 };
    return { ok: true, text: async () => POINTS };
  });
}

test('i file non scaricati vengono ritentati al controllo successivo', async () => {
  mockServer(new Set(['impatiens-glandulifera.json']));
  const onDownloadStart = jest.fn();
  const first = await checkForUpdates({ force: true, onDownloadStart });
  expect(onDownloadStart).toHaveBeenCalledTimes(1);
  expect(first.downloaded).toBe(1);
  expect(first.manifest.incompleto).toBe(true);
  expect(first.manifest.specie['impatiens-glandulifera'].punti).toBeNull();

  mockServer(new Set());
  const second = await checkForUpdates({ force: true });
  expect(second.downloaded).toBe(1); // solo la balsamina: l'ailanto è già aggiornato
  expect(second.manifest.incompleto).toBeUndefined();
  expect(second.manifest.specie['impatiens-glandulifera'].punti.sha).toBe(POINTS_SHA);

  const idle = jest.fn();
  const third = await checkForUpdates({ force: true, onDownloadStart: idle });
  expect(third.downloaded).toBe(0);
  expect(idle).not.toHaveBeenCalled(); // niente da scaricare: nessun avviso
  expect(JSON.parse(await AsyncStorage.getItem('ias-tracker/remote-manifest/v1')).incompleto).toBeUndefined();
});

test('i file comuni (foto, simili, EASIN) si leggono una volta per versione', async () => {
  const { File } = require('expo-file-system');
  const { clearDownloadedData, readPhotos } = require('../src/data/remote');
  const file = new File({ uri: 'doc' }, 'data-v1', 'root', 'foto.json');
  file.write(JSON.stringify({ specie: { a: [] } }));
  const m = { ...manifest, foto: { file: 'foto.json', sha: 'f1' } };
  expect(await readPhotos(m)).toEqual({ specie: { a: [] } });
  file.write(JSON.stringify({ specie: { b: [] } }));
  expect(await readPhotos(m)).toEqual({ specie: { a: [] } }); // stessa impronta: dalla memoria
  expect(await readPhotos({ ...m, foto: { file: 'foto.json', sha: 'f2' } })).toEqual({ specie: { b: [] } });
  await clearDownloadedData();
  file.write(JSON.stringify({ specie: { c: [] } }));
  expect(await readPhotos(m)).toEqual({ specie: { c: [] } }); // dopo l'eliminazione si rilegge
});

// --- Difesa in profondità sui dati scaricati ------------------------------------------------

/** Server finto: manifest dato e contenuto di ogni file per nome. */
function mockSite(siteManifest, files) {
  global.fetch = jest.fn(async (url) => {
    const path = url.slice('https://anghelos98.github.io/ias-tracker/data/v1/'.length);
    if (path === 'manifest.json') return { ok: true, text: async () => JSON.stringify(siteManifest) };
    if (path in files) return { ok: true, text: async () => files[path] };
    return { ok: false, status: 404 };
  });
  return global.fetch;
}

test('percorsi dal manifest fuori dalla cartella dei dati: niente scaricamento né scrittura', async () => {
  const fetchMock = mockSite(
    {
      ...manifest,
      generato_il: '2030-02-01T00:00:00Z',
      foto: { file: '../reports', sha: 'x' },
      specie: { 'ailanthus-altissima': { totale: 1, punti: { file: '../reports/a.json', sha: 'z' } } },
    },
    { '../reports/a.json': POINTS },
  );
  const result = await checkForUpdates({ force: true });
  expect(fetchMock).toHaveBeenCalledTimes(1); // solo il manifest
  expect(result.status).toBe('incomplete');
  expect(result.manifest.foto).toBeNull();
});

test("le specie che l'app non conosce vengono ignorate (niente scaricamenti a raffica)", async () => {
  const unknown = Object.fromEntries(
    Array.from({ length: 500 }, (_, i) => [
      `finta-${i}`,
      { totale: 1, punti: { file: `species/finta-${i}.json`, sha: 's' } },
    ]),
  );
  const fetchMock = mockSite({ ...manifest, generato_il: '2030-03-01T00:00:00Z', specie: unknown }, {});
  const result = await checkForUpdates({ force: true });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(result.manifest.specie).toEqual({});
});

test('novità con una forma inattesa: non salvate, e se già salvate si usano quelle incluse', async () => {
  const { File } = require('expo-file-system');
  const { readNews } = require('../src/data/remote');
  const bad = JSON.stringify({ settimane: [{ dati_al: '2030-01-07', specie: { x: null } }] });
  mockSite(
    { ...manifest, generato_il: '2030-04-01T00:00:00Z', novita: { file: 'news.json', sha: sha(bad) } },
    {
      'news.json': bad,
    },
  );
  const result = await checkForUpdates({ force: true });
  expect(result.manifest.novita).toBeNull();
  const local = new File({ uri: 'doc' }, 'data-v1', 'root', 'news.json');
  expect(local.exists).toBe(false);

  // file rovinato salvato da una versione precedente
  local.write(JSON.stringify({ settimane: {} }));
  const news = await readNews({ ...manifest, novita: { file: 'news.json', sha: 'vecchio' } });
  expect(news).toEqual(require('../assets/data/news.json'));
});

test('file troppo grandi non vengono salvati', async () => {
  const huge = JSON.stringify({ punti: [], fonti: [], x: 'a'.repeat(20 * 1024 * 1024) });
  mockSite(
    { ...manifest, generato_il: '2030-05-01T00:00:00Z' },
    {
      'species/ailanthus-altissima.json': huge,
      'species/impatiens-glandulifera.json': POINTS,
    },
  );
  const result = await checkForUpdates({ force: true });
  expect(result.status).toBe('incomplete');
  expect(result.manifest.specie['impatiens-glandulifera'].punti.sha).toBe(POINTS_SHA);
});

test('manifest malformato: restano i dati già salvati', async () => {
  const before = await checkForUpdates({ force: true, onDownloadStart: () => {} }).then((r) => r.manifest);
  mockSite({ schema: 1, generato_il: 'x', dati_gbif_al: 'non è una data', specie: [] }, {});
  const result = await checkForUpdates({ force: true });
  expect(result.status).toBe('offline');
  expect(result.manifest).toEqual(before);
});

test('statistiche non valide (riquadro fuori scala, totale negativo): si tengono quelle incluse', () => {
  const { withRemoteStats } = require('../src/data/remote');
  const { SPECIES } = require('../src/data/species');
  const ailanto = SPECIES.find((s) => s.slug === 'ailanthus-altissima');
  const m = {
    ...manifest,
    specie: { 'ailanthus-altissima': { totale: -5, anni: 'x', bbox: [7, 36, 'NaN', 999] } },
  };
  const result = withRemoteStats(ailanto, m);
  expect(result.total).toBe(ailanto.total);
  expect(result.years).toEqual(ailanto.years);
  expect(result.bbox).toEqual(ailanto.bbox);
  const good = withRemoteStats(ailanto, {
    ...manifest,
    specie: { 'ailanthus-altissima': { totale: 3, bbox: [7, 36, 18, 47] } },
  });
  expect(good.total).toBe(3);
  expect(good.bbox).toEqual([7, 36, 18, 47]);
});

// --- Integrità dei file scaricati ----------------------------------------------------------

const AILANTO = 'doc/data-v1/species/ailanthus-altissima.json';

/** Manifest con un nuovo file dei punti dell'ailanto (contenuto e impronta dati). */
function siteWithAilanto(generato, content, contentSha = sha(content)) {
  return mockSite(
    {
      ...manifest,
      generato_il: generato,
      specie: {
        'ailanthus-altissima': { totale: 1, punti: { file: 'species/ailanthus-altissima.json', sha: contentSha } },
      },
    },
    { 'species/ailanthus-altissima.json': content },
  );
}

async function savedText(uri) {
  const { File } = require('expo-file-system');
  const file = new File(uri);
  return file.exists ? file.text() : null;
}

test('file diverso da quello pubblicato (impronta): non salvato, resta il precedente intero', async () => {
  const good = JSON.stringify({
    punti: [[12.5, 41.9, 2024, 0, 0, 10, 12, 1, null, 19800]],
    fonti: [{ nome: 'Fonte', licenza: 'CC0' }],
  });
  siteWithAilanto('2030-06-01T00:00:00Z', good);
  expect((await checkForUpdates({ force: true })).status).toBe('updated');
  expect(await savedText(AILANTO)).toBe(good);

  // Il manifest annuncia un file nuovo, ma il sito serve ancora quello vecchio (cache) o un
  // file diverso: forma valida, impronta sbagliata.
  siteWithAilanto('2030-06-08T00:00:00Z', POINTS, sha('contenuto annunciato'));
  const result = await checkForUpdates({ force: true });
  expect(result.status).toBe('incomplete');
  expect(result.manifest.specie['ailanthus-altissima'].punti.sha).toBe(sha(good)); // si ritenterà
  expect(await savedText(AILANTO)).toBe(good);
  expect(await savedText(`${AILANTO}.tmp`)).toBeNull(); // nessun file temporaneo lasciato
});

test('impronta mancante o non valida nel manifest: il file non viene scaricato', async () => {
  const fetchMock = siteWithAilanto('2030-06-15T00:00:00Z', POINTS, 'non-esadecimale!');
  const result = await checkForUpdates({ force: true });
  expect(result.status).toBe('incomplete');
  expect(fetchMock).toHaveBeenCalledTimes(1); // solo il manifest
});

test("un solo punto malformato: il file non viene salvato (chiuderebbe l'app)", async () => {
  const before = await savedText(AILANTO);
  const bad = JSON.stringify({
    punti: [[12.5, 41.9, 2024, 0, 0, 10], null],
    fonti: [{ nome: 'Fonte', licenza: null }],
  });
  siteWithAilanto('2030-06-22T00:00:00Z', bad);
  expect((await checkForUpdates({ force: true })).status).toBe('incomplete');
  expect(await savedText(AILANTO)).toBe(before);
});

test("file già salvato ma malformato (versione precedente): si usano i punti inclusi nell'app", async () => {
  const { File } = require('expo-file-system');
  const { readSpeciesPoints } = require('../src/data/remote');
  const { SPECIES } = require('../src/data/species');
  const ailanto = SPECIES.find((s) => s.slug === 'ailanthus-altissima');
  new File(AILANTO).write(JSON.stringify({ punti: [['12', 41.9]], fonti: [] }));
  const m = {
    ...manifest,
    specie: { 'ailanthus-altissima': { totale: 1, punti: { file: 'species/ailanthus-altissima.json', sha: 'x' } } },
  };
  expect(await readSpeciesPoints(ailanto, m)).toEqual(await ailanto.load());
});

test("novità: le specie che l'app non conosce non arrivano a notifiche e conteggi", () => {
  const { knownSpeciesOnly } = require('../src/data/remote');
  const news = {
    settimane: [
      {
        dati_al: '2030-01-07T00:00:00Z',
        specie: { 'ailanthus-altissima': { nuove: 2 }, "Aggiorna subito l'app su sito-falso.it": { nuove: 1 } },
      },
      { dati_al: '2029-12-31T00:00:00Z' },
    ],
  };
  const result = knownSpeciesOnly(news);
  expect(Object.keys(result.settimane[0].specie)).toEqual(['ailanthus-altissima']);
  expect(result.settimane[1]).toEqual(news.settimane[1]);
});
