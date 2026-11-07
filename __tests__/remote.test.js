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
  }
  class Directory extends File {
    get exists() {
      return true;
    }
  }
  return { File, Directory, Paths: { document: { uri: 'doc' } } };
});

const AsyncStorage = require('@react-native-async-storage/async-storage');
const { checkForUpdates } = require('../src/data/remote');

const manifest = {
  schema: 1,
  generato_il: '2030-01-07T00:00:00Z',
  dati_gbif_al: '2030-01-07T00:00:00Z',
  specie: {
    ailanto: { totale: 1, punti: { file: 'species/ailanto.json', sha: 'a1' } },
    kudzu: { totale: 1, punti: { file: 'species/kudzu.json', sha: 'k1' } },
  },
};

function mockServer(failing) {
  global.fetch = jest.fn(async (url) => {
    const name = url.split('/').pop();
    if (name === 'manifest.json') return { ok: true, text: async () => JSON.stringify(manifest) };
    if (failing.has(name)) return { ok: false, status: 503 };
    return { ok: true, text: async () => JSON.stringify({ punti: [], fonti: [] }) };
  });
}

test('i file non scaricati vengono ritentati al controllo successivo', async () => {
  mockServer(new Set(['kudzu.json']));
  const onDownloadStart = jest.fn();
  const first = await checkForUpdates({ force: true, onDownloadStart });
  expect(onDownloadStart).toHaveBeenCalledTimes(1);
  expect(first.downloaded).toBe(1);
  expect(first.manifest.incompleto).toBe(true);
  expect(first.manifest.specie.kudzu.punti).toBeNull();

  mockServer(new Set());
  const second = await checkForUpdates({ force: true });
  expect(second.downloaded).toBe(1); // solo kudzu: ailanto è già aggiornato
  expect(second.manifest.incompleto).toBeUndefined();
  expect(second.manifest.specie.kudzu.punti.sha).toBe('k1');

  const idle = jest.fn();
  const third = await checkForUpdates({ force: true, onDownloadStart: idle });
  expect(third.downloaded).toBe(0);
  expect(idle).not.toHaveBeenCalled(); // niente da scaricare: nessun avviso
  expect(JSON.parse(await AsyncStorage.getItem('ias-tracker/remote-manifest/v1')).incompleto).toBeUndefined();
});
