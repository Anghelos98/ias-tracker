// Rapporto per regione: specie, numero di segnalazioni e andamento negli anni.
// Funzioni pure, testate in __tests__/regionReport.test.js.
//
// La regione di ogni segnalazione (codice ISTAT 1-20) è il settimo campo dei punti, calcolato
// dalla pipeline dati con i confini ISTAT (scripts/build_app_data.py). I dati senza quel campo
// (versioni precedenti) o i punti in mare aperto non rientrano in nessuna regione.

import { passesFilters } from './points';
import { REGIONS } from './regions';

/** Anni mostrati nel grafico dell'andamento (gli ultimi N, anno in corso compreso). */
export const TREND_YEARS = 15;

function* filteredPoints(datasets, filters) {
  for (const { species, data } of datasets) {
    for (const p of data.punti) {
      const [, , year, , automatic, uncertainty, region] = p;
      const record = { year, automatic: automatic === 1, uncertainty: uncertainty ?? null };
      if (passesFilters(record, filters)) yield { species, year, region: region ?? null };
    }
  }
}

/**
 * Riepilogo di tutte le regioni (anche quelle senza segnalazioni), in ordine alfabetico.
 * @returns {{region: {code: number, name: string, bbox: number[]}, total: number, species: number}[]}
 */
export function regionSummaries(datasets, filters) {
  const byCode = new Map(REGIONS.map((r) => [r.code, { total: 0, species: new Set() }]));
  for (const { species, region } of filteredPoints(datasets, filters)) {
    const entry = byCode.get(region);
    if (!entry) continue;
    entry.total += 1;
    entry.species.add(species.slug);
  }
  return REGIONS.map((region) => ({
    region,
    total: byCode.get(region.code).total,
    species: byCode.get(region.code).species.size,
  })).sort((a, b) => a.region.name.localeCompare(b.region.name, 'it'));
}

/**
 * Rapporto di una regione.
 * @returns {{
 *   total: number,
 *   species: {species: object, count: number, firstYear: number|null, lastYear: number|null}[],
 *   trend: {year: number, count: number}[],   ultimi TREND_YEARS anni
 *   earlier: number,                          segnalazioni con anno precedente
 *   undated: number                           segnalazioni senza anno
 * }}
 */
export function regionReport(datasets, filters, code, currentYear = new Date().getFullYear()) {
  const firstTrendYear = currentYear - TREND_YEARS + 1;
  const bySpecies = new Map();
  const byYear = new Map();
  let total = 0;
  let earlier = 0;
  let undated = 0;

  for (const { species, year, region } of filteredPoints(datasets, filters)) {
    if (region !== code) continue;
    total += 1;
    let s = bySpecies.get(species.slug);
    if (!s) {
      s = { species, count: 0, firstYear: null, lastYear: null };
      bySpecies.set(species.slug, s);
    }
    s.count += 1;
    if (year == null) {
      undated += 1;
      continue;
    }
    if (s.firstYear == null || year < s.firstYear) s.firstYear = year;
    if (s.lastYear == null || year > s.lastYear) s.lastYear = year;
    if (year < firstTrendYear) earlier += 1;
    else if (year <= currentYear) byYear.set(year, (byYear.get(year) ?? 0) + 1);
  }

  const trend = [];
  for (let y = firstTrendYear; y <= currentYear; y += 1) trend.push({ year: y, count: byYear.get(y) ?? 0 });

  return {
    total,
    species: [...bySpecies.values()].sort(
      (a, b) => b.count - a.count || a.species.commonName.localeCompare(b.species.commonName, 'it'),
    ),
    trend,
    earlier,
    undated,
  };
}

function csvCell(value) {
  if (value == null) return '';
  const text = String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Tabella CSV del rapporto (una riga per specie), da condividere o aprire in un foglio di calcolo. */
export function regionReportCSV(report, regionName) {
  const lines = [['regione', 'specie', 'nome_comune', 'segnalazioni', 'primo_anno', 'ultimo_anno'].join(',')];
  for (const s of report.species) {
    lines.push(
      [regionName, s.species.scientificName, s.species.commonName, s.count, s.firstYear, s.lastYear]
        .map(csvCell)
        .join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}
