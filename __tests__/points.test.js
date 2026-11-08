import { describeFilters } from '../src/components/FiltersPanel';
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  groupDatasets,
  lastYearsStartDay,
  originalSiteName,
  passesFilters,
  speciesOfRecords,
} from '../src/data/points';

const SPECIES_A = { slug: 'a', commonName: 'Specie A', scientificName: 'Planta a' };
const groupByLocation = (data, filters) => groupDatasets([{ species: SPECIES_A, data }], filters);

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

describe('più specie insieme', () => {
  const other = { species: { slug: 'b', commonName: 'Specie B', scientificName: 'Planta b' }, data: {
    fonti: [{ nome: 'Herbarium', licenza: 'CC0 1.0' }],
    punti: [[12.5, 41.9, 2022, 0, 0, 5]], // stessa posizione di due record della specie A
  } };

  test('record di specie diverse nello stesso punto restano distinguibili', () => {
    const { features, count } = groupDatasets([{ species: SPECIES_A, data: DATA }, other], DEFAULT_FILTERS);
    expect(count).toBe(4);
    const shared = features.find((f) => f.geometry.coordinates[0] === 12.5);
    expect(shared.properties.records).toHaveLength(3);
    expect(shared.properties.records[0].species.slug).toBe('b'); // il più recente (2022)
    expect(speciesOfRecords(shared.properties.records).map((s) => s.slug)).toEqual(['b', 'a']);
    expect(new Set(shared.properties.records.map((r) => r.id)).size).toBe(3); // id unici tra specie
  });
});

describe('collegamento al dato originale', () => {
  const data = {
    fonti: [
      { nome: 'iNaturalist', licenza: 'CC BY-NC 4.0', link: 'https://www.inaturalist.org/observations/' },
      { nome: 'Wikiplantbase', licenza: 'CC BY 4.0' },
    ],
    punti: [
      [12.5, 41.9, 2020, 0, 0, 10, 12, 6131154472, 333966041],
      [12.6, 41.8, 2021, 1, 0, 5, 12, 42, null],
      [12.7, 41.7, 2022, 0, 0, 5], // dati di una versione precedente, senza identificativi
    ],
  };
  const records = groupByLocation(data, DEFAULT_FILTERS).features.map((f) => f.properties.records[0]);

  test('pagina GBIF e pagina della fonte di origine', () => {
    expect(records[0].gbifUrl).toBe('https://www.gbif.org/occurrence/6131154472');
    expect(records[0].originalUrl).toBe('https://www.inaturalist.org/observations/333966041');
    expect(records[1].gbifUrl).toBe('https://www.gbif.org/occurrence/42');
    expect(records[1].originalUrl).toBeNull();
    expect(records[2].gbifUrl).toBeNull();
    expect(records[2].originalUrl).toBeNull();
  });

  test('nome leggibile della banca dati di origine', () => {
    expect(originalSiteName('https://www.inaturalist.org/observations/1')).toBe('iNaturalist');
    expect(originalSiteName('https://identify.plantnet.org/k-world/observations/7')).toBe('Pl@ntNet');
    expect(originalSiteName('https://observation.org/observation/3')).toBe('Observation.org');
    expect(originalSiteName('https://example.it/x/3')).toBe('example.it');
    expect(originalSiteName(null)).toBeNull();
  });
});

test('periodo per data: ultimo mese e ultimo anno', () => {
  const today = 20000;
  const filters = (maxAgeDays) => ({ ...DEFAULT_FILTERS, maxAgeDays });
  const rec = (day) => ({ year: 2024, automatic: false, uncertainty: null, day });
  expect(passesFilters(rec(today - 10), filters(30), today)).toBe(true);
  expect(passesFilters(rec(today - 30), filters(30), today)).toBe(true);
  expect(passesFilters(rec(today - 31), filters(30), today)).toBe(false);
  expect(passesFilters(rec(null), filters(30), today)).toBe(false); // senza data completa
  expect(passesFilters(rec(today - 300), filters(365), today)).toBe(true);
  expect(passesFilters(rec(null), DEFAULT_FILTERS, today)).toBe(true);
  expect(activeFilterCount(filters(30))).toBe(1);
  expect(describeFilters(filters(30))).toBe('ultimo mese');
  expect(describeFilters({ ...DEFAULT_FILTERS, minYear: 2010 })).toBe('dal 2010');
});

test('ultimi 5 anni: dalla data di oggi di 5 anni fa', () => {
  const day = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  const filters = { ...DEFAULT_FILTERS, lastYears: 5 };
  const today = day(2026, 11, 8);
  const rec = (year, d = null) => ({ year, automatic: false, uncertainty: null, day: d });
  expect(lastYearsStartDay(today, 5)).toBe(day(2021, 11, 8));
  // con la data completa conta il giorno
  expect(passesFilters(rec(2021, day(2021, 11, 8)), filters, today)).toBe(true);
  expect(passesFilters(rec(2021, day(2021, 11, 7)), filters, today)).toBe(false);
  expect(passesFilters(rec(2021, day(2021, 12, 31)), filters, today)).toBe(true);
  // con il solo anno: dentro solo se l'anno è tutto nel periodo
  expect(passesFilters(rec(2022), filters, today)).toBe(true);
  expect(passesFilters(rec(2021), filters, today)).toBe(false);
  expect(passesFilters(rec(null), filters, today)).toBe(false);
  // relativo a oggi: lo stesso filtro un anno dopo parte dall'8 novembre 2022
  expect(passesFilters(rec(2022, day(2022, 11, 7)), filters, day(2027, 11, 8))).toBe(false);
  expect(passesFilters(rec(2022), filters, day(2027, 11, 8))).toBe(false);
  // 29 febbraio -> 1° marzo dell'anno non bisestile
  expect(lastYearsStartDay(day(2028, 2, 29), 5)).toBe(day(2023, 3, 1));
  expect(activeFilterCount(filters)).toBe(1);
  expect(activeFilterCount({ ...filters, includeAutomatic: true, maxUncertainty: 100 })).toBe(3);
  expect(describeFilters(filters)).toBe('ultimi 5 anni');
});

test('dal 2020: dal 1° gennaio, in base all’anno', () => {
  const filters = { ...DEFAULT_FILTERS, minYear: 2020 };
  const rec = (year, d = null) => ({ year, automatic: false, uncertainty: null, day: d });
  const jan1 = Math.floor(Date.UTC(2020, 0, 1) / 86400000);
  expect(passesFilters(rec(2020, jan1), filters)).toBe(true);
  expect(passesFilters(rec(2020), filters)).toBe(true);
  expect(passesFilters(rec(2019, jan1 - 1), filters)).toBe(false);
  expect(passesFilters(rec(null), filters)).toBe(false);
});
