import { groupByLocation } from '../src/data/points';

const DATA = {
  fonti: [
    { nome: 'iNaturalist', licenza: 'CC BY-NC 4.0' },
    { nome: 'Pl@ntNet automatically identified occurrences', licenza: 'CC BY 4.0' },
  ],
  punti: [
    [12.5, 41.9, 2010, 0, 0, 10],
    [12.5, 41.9, 2020, 0, 0, null], // stessa posizione del precedente
    [12.6, 41.8, 2021, 1, 1, 5], // identificazione automatica
    [12.7, 41.7, null, 0, 0, 3000],
  ],
};

test('unisce i record con coordinate identiche e ordina dal più recente', () => {
  const { features, count } = groupByLocation(DATA, { includeAutomatic: false });
  expect(count).toBe(3);
  expect(features).toHaveLength(2);
  const shared = features.find((f) => f.geometry.coordinates[0] === 12.5);
  expect(shared.properties.records.map((r) => r.year)).toEqual([2020, 2010]);
  expect(shared.properties.records[0]).toMatchObject({ source: 'iNaturalist', license: 'CC BY-NC 4.0' });
});

test('include le identificazioni automatiche solo se richiesto', () => {
  expect(groupByLocation(DATA, { includeAutomatic: false }).count).toBe(3);
  const all = groupByLocation(DATA, { includeAutomatic: true });
  expect(all.count).toBe(4);
  const auto = all.features.find((f) => f.geometry.coordinates[0] === 12.6);
  expect(auto.properties.automatic).toBe(true);
});
