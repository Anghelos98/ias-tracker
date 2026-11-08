// Punti di tutte le specie: si ricaricano quando cambiano i dati scaricati, anche se la data dei
// dati resta la stessa (scaricamento incompleto completato in seguito).

jest.mock('../src/data/remote', () => ({
  dataDate: () => '2030-01-07T00:00:00Z',
  readSpeciesPoints: jest.fn(async () => ({ punti: [], fonti: [] })),
}));

const { readSpeciesPoints } = require('../src/data/remote');
const { loadAllDatasets } = require('../src/data/allSpecies');

const LIST = [
  { slug: 'a', total: 3 },
  { slug: 'b', total: 0 },
];

test('cache per versione dei dati, completamento compreso', async () => {
  const incomplete = { generato_il: 'g1', incompleto: true };
  expect(await loadAllDatasets(LIST, incomplete)).toHaveLength(1); // solo le specie con segnalazioni
  await loadAllDatasets(LIST, { ...incomplete });
  expect(readSpeciesPoints).toHaveBeenCalledTimes(1); // stessa versione: dalla cache

  await loadAllDatasets(LIST, { generato_il: 'g1' }); // file mancanti scaricati
  expect(readSpeciesPoints).toHaveBeenCalledTimes(2);
  await loadAllDatasets(LIST, { generato_il: 'g2' });
  expect(readSpeciesPoints).toHaveBeenCalledTimes(3);
});
