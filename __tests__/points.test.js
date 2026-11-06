import { describeFilters } from '../src/components/FiltersPanel';
import { DEFAULT_FILTERS, activeFilterCount, groupByLocation, passesFilters } from '../src/data/points';

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

describe('filtri', () => {
  const base = { includeAutomatic: true, minYear: null, maxUncertainty: null };

  test('periodo: esclude le segnalazioni precedenti e quelle senza anno', () => {
    const { count } = groupByLocation(DATA, { ...base, minYear: 2015 });
    expect(count).toBe(2); // 2020 e 2021
  });

  test('precisione: esclude incertezza maggiore o non indicata', () => {
    const { count } = groupByLocation(DATA, { ...base, maxUncertainty: 100 });
    expect(count).toBe(2); // 10 m e 5 m
  });

  test('posizione approssimativa solo se tutte le incertezze sono note e ampie', () => {
    const { features } = groupByLocation(DATA, base);
    const approx = features.find((f) => f.geometry.coordinates[0] === 12.7);
    const mixed = features.find((f) => f.geometry.coordinates[0] === 12.5); // 10 m e non indicata
    expect(approx.properties.approximate).toBe(true);
    expect(mixed.properties.approximate).toBe(false);
  });

  test('passesFilters e conteggio dei filtri attivi', () => {
    expect(passesFilters({ year: 2020, automatic: false, uncertainty: null }, DEFAULT_FILTERS)).toBe(true);
    expect(passesFilters({ year: 2020, automatic: true, uncertainty: null }, DEFAULT_FILTERS)).toBe(false);
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, minYear: 2015, includeAutomatic: true })).toBe(2);
  });

  test('descrizione breve dei filtri', () => {
    expect(describeFilters(DEFAULT_FILTERS)).toBe('');
    expect(describeFilters({ includeAutomatic: true, minYear: 2015, maxUncertainty: 1000 })).toBe(
      'dal 2015 · ≤ 1 km · con Pl@ntNet',
    );
  });
});
