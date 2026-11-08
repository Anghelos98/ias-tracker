// Foto delle segnalazioni: si salva e si invia una copia ridisegnata, senza metadati EXIF
// (posizione, modello del telefono…), e la copia temporanea del selettore viene eliminata.

const mockDeleted = [];
jest.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file:///app/cache/' } },
  File: jest.fn().mockImplementation((uri) => ({
    uri,
    exists: true,
    delete: () => mockDeleted.push(uri),
  })),
}));

const mockSaveAsync = jest.fn(async () => ({
  uri: 'file:///app/cache/ImageManipulator/pulita.jpg',
  width: 10,
  height: 10,
}));
const mockManipulate = jest.fn(() => ({ renderAsync: async () => ({ saveAsync: mockSaveAsync }) }));
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: (...args) => mockManipulate(...args) },
  SaveFormat: { JPEG: 'jpeg' },
}));

const { photoWithoutMetadata } = require('../src/utils/cleanPhoto');

beforeEach(() => {
  mockDeleted.length = 0;
  jest.clearAllMocks();
});

test('la foto viene ridisegnata in JPEG (senza metadati) e la copia del selettore eliminata', async () => {
  const original = 'file:///app/cache/ImagePicker/originale.jpg';
  expect(await photoWithoutMetadata(original)).toBe('file:///app/cache/ImageManipulator/pulita.jpg');
  expect(mockManipulate).toHaveBeenCalledWith(original, { maxWidth: 4096, maxHeight: 4096 });
  expect(mockSaveAsync).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.7 });
  expect(mockDeleted).toEqual([original]);
});

test('un file fuori dalla cache dell’app non viene mai eliminato', async () => {
  await photoWithoutMetadata('file:///storage/emulated/0/DCIM/foto.jpg');
  expect(mockDeleted).toEqual([]);
});

test('se la foto non si può ridisegnare, errore (mai l’originale con i metadati)', async () => {
  mockSaveAsync.mockRejectedValueOnce(new Error('memoria esaurita'));
  await expect(photoWithoutMetadata('file:///app/cache/ImagePicker/x.jpg')).rejects.toThrow('memoria esaurita');
  expect(mockDeleted).toEqual([]);
});
