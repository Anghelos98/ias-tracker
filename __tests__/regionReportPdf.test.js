import { regionReportHtml, trendSvg } from '../src/reports/regionReportHtml';

const REPORT = {
  total: 12,
  species: [
    { species: { commonName: 'Ailanto', scientificName: 'Ailanthus altissima' }, count: 10, firstYear: 2015, lastYear: 2024 },
    { species: { commonName: 'Erba <pesce>', scientificName: 'Salvinia molesta' }, count: 2, firstYear: 2020, lastYear: 2020 },
  ],
  trend: [
    { year: 2023, count: 0 },
    { year: 2024, count: 7 },
    { year: 2025, count: 3 },
  ],
  earlier: 1,
  undated: 1,
};

test('documento completo con tabella, grafico, fonti e data', () => {
  const html = regionReportHtml(REPORT, {
    regionName: 'Lazio',
    dataDate: '2026-11-02T04:00:00+00:00',
    filtersText: 'dal 2015',
    now: new Date('2026-11-06T10:00:00Z'),
  });
  expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
  expect(html).toContain('Specie vegetali esotiche invasive – Lazio');
  expect(html).toContain('6 novembre 2026');
  expect(html).toContain('Dati GBIF aggiornati al 2 novembre 2026');
  expect(html).toContain('Filtri applicati: dal 2015');
  expect(html).toContain('<svg');
  expect(html).toContain('2015–2024');
  expect(html).toContain('<td class="n">2020</td>'); // un solo anno
  expect(html).toContain('Erba &lt;pesce&gt;'); // testo protetto
  expect(html).toContain('Prima del 2023: 1 segnalazione.');
  expect(html).toContain('GBIF.org');
});

test('senza segnalazioni non disegna il grafico', () => {
  const html = regionReportHtml(
    { total: 0, species: [], trend: REPORT.trend, earlier: 0, undated: 0 },
    { regionName: 'Molise', dataDate: '2026-11-02' },
  );
  expect(html).not.toContain('<svg');
  expect(html).toContain('Nessuna segnalazione');
  expect(html).not.toContain('Filtri applicati');
});

test('una barra per anno, alta in proporzione', () => {
  const svg = trendSvg(REPORT.trend, { width: 300, height: 100 });
  const heights = [...svg.matchAll(/<rect [^>]*height="([\d.]+)"/g)].map((m) => Number(m[1]));
  expect(heights).toHaveLength(3);
  expect(heights[1]).toBeGreaterThan(heights[2]);
  expect(heights[0]).toBe(1); // anno senza segnalazioni: linea sottile
});
