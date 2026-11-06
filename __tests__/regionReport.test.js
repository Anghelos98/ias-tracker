import { DEFAULT_FILTERS } from '../src/data/points';
import { TREND_YEARS, regionReport, regionReportCSV, regionSummaries } from '../src/data/regionReport';
import { REGIONS } from '../src/data/regions';

const ailanto = { slug: 'ailanthus-altissima', commonName: 'Ailanto', scientificName: 'Ailanthus altissima' };
const panace = {
  slug: 'heracleum-mantegazzianum',
  commonName: 'Panace di Mantegazza',
  scientificName: 'Heracleum mantegazzianum',
};
const fonti = [{ nome: 'A', licenza: 'CC BY 4.0' }];

// [lon, lat, anno, fonte, automatica, incertezza, regione]
const datasets = [
  {
    species: ailanto,
    data: {
      fonti,
      punti: [
        [12.5, 41.9, 2024, 0, 0, 10, 12],
        [12.6, 41.8, 2020, 0, 0, null, 12],
        [12.7, 41.7, 1990, 0, 0, null, 12],
        [12.8, 41.6, null, 0, 0, null, 12],
        [9.2, 45.5, 2025, 0, 1, null, 3], // automatica: esclusa con i filtri predefiniti
        [13.0, 38.0, 2022, 0, 0, null, null], // in mare
        [9.1, 45.4, 2023, 0, 0, null], // dati vecchi senza regione
      ],
    },
  },
  { species: panace, data: { fonti, punti: [[12.4, 41.95, 2024, 0, 0, null, 12]] } },
];

describe('regionSummaries', () => {
  test('tutte le 20 regioni in ordine alfabetico, con conteggi filtrati', () => {
    const list = regionSummaries(datasets, DEFAULT_FILTERS);
    expect(list).toHaveLength(20);
    expect(list.map((r) => r.region.name)).toEqual(
      [...REGIONS.map((r) => r.name)].sort((a, b) => a.localeCompare(b, 'it')),
    );
    const lazio = list.find((r) => r.region.code === 12);
    expect(lazio).toMatchObject({ total: 5, species: 2 });
    expect(list.find((r) => r.region.code === 3).total).toBe(0);
  });

  test('i filtri cambiano i conteggi', () => {
    const list = regionSummaries(datasets, { ...DEFAULT_FILTERS, includeAutomatic: true });
    expect(list.find((r) => r.region.code === 3).total).toBe(1);
  });
});

describe('regionReport', () => {
  const report = regionReport(datasets, DEFAULT_FILTERS, 12, 2026);

  test('specie ordinate per numero di segnalazioni, con primo e ultimo anno', () => {
    expect(report.total).toBe(5);
    expect(report.species.map((s) => [s.species.slug, s.count, s.firstYear, s.lastYear])).toEqual([
      ['ailanthus-altissima', 4, 1990, 2024],
      ['heracleum-mantegazzianum', 1, 2024, 2024],
    ]);
  });

  test('andamento degli ultimi anni, più segnalazioni precedenti e senza anno', () => {
    expect(report.trend).toHaveLength(TREND_YEARS);
    expect(report.trend[0].year).toBe(2026 - TREND_YEARS + 1);
    expect(report.trend.at(-1)).toEqual({ year: 2026, count: 0 });
    expect(report.trend.find((t) => t.year === 2024).count).toBe(2);
    expect(report.earlier).toBe(1);
    expect(report.undated).toBe(1);
  });

  test('CSV con una riga per specie', () => {
    expect(regionReportCSV(report, 'Lazio').split('\n')).toEqual([
      'regione,specie,nome_comune,segnalazioni,primo_anno,ultimo_anno',
      'Lazio,Ailanthus altissima,Ailanto,4,1990,2024',
      'Lazio,Heracleum mantegazzianum,Panace di Mantegazza,1,2024,2024',
      '',
    ]);
  });
});
