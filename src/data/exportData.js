// Esportazione delle segnalazioni mostrate in CSV, GeoJSON e KML. Funzioni pure, testate.
// Ogni riga riporta fonte e licenza del dato, necessarie per citarlo correttamente.

import { passesFilters } from './points';

export const EXPORT_FORMATS = {
  csv: { label: 'CSV', extension: 'csv', mimeType: 'text/csv', uti: 'public.comma-separated-values-text' },
  geojson: { label: 'GeoJSON', extension: 'geojson', mimeType: 'application/geo+json', uti: 'public.json' },
  kml: { label: 'KML', extension: 'kml', mimeType: 'application/vnd.google-earth.kml+xml', uti: 'com.google.earth.kml' },
};

export const ATTRIBUTION =
  'Dati: GBIF.org (consultato tramite IAS Tracker). Ogni segnalazione mantiene la licenza del dataset ' +
  'di origine (colonna "licenza"): CC0, CC BY o CC BY-NC (solo uso non commerciale). Citare GBIF.org e il dataset.';

/**
 * Righe da esportare: segnalazioni che passano i filtri, facoltativamente solo dentro un
 * riquadro [ovest, sud, est, nord].
 */
export function exportRows(datasets, filters, bbox = null) {
  const rows = [];
  for (const { species, data } of datasets) {
    for (const [lon, lat, year, sourceIdx, automatic, uncertainty] of data.punti) {
      if (bbox && (lon < bbox[0] || lat < bbox[1] || lon > bbox[2] || lat > bbox[3])) continue;
      const record = { year, automatic: automatic === 1, uncertainty: uncertainty ?? null };
      if (!passesFilters(record, filters)) continue;
      rows.push({
        specie: species.scientificName,
        nome_comune: species.commonName,
        latitudine: lat,
        longitudine: lon,
        anno: year,
        incertezza_m: uncertainty ?? null,
        fonte: data.fonti[sourceIdx].nome,
        licenza: data.fonti[sourceIdx].licenza,
        identificazione_automatica: automatic === 1,
      });
    }
  }
  return rows;
}

const COLUMNS = [
  'specie',
  'nome_comune',
  'latitudine',
  'longitudine',
  'anno',
  'incertezza_m',
  'fonte',
  'licenza',
  'identificazione_automatica',
];

function csvCell(value) {
  if (value == null) return '';
  const text = String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCSV(rows) {
  const lines = [COLUMNS.join(',')];
  for (const row of rows) lines.push(COLUMNS.map((c) => csvCell(row[c])).join(','));
  return `${lines.join('\n')}\n`;
}

export function toGeoJSON(rows, meta = {}) {
  return JSON.stringify(
    {
      type: 'FeatureCollection',
      metadata: { attribuzione: ATTRIBUTION, ...meta },
      features: rows.map(({ latitudine, longitudine, ...properties }) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [longitudine, latitudine] },
        properties,
      })),
    },
    null,
    1,
  );
}

function xml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function toKML(rows, title = 'IAS Tracker') {
  const placemarks = rows.map((r) => {
    const details = [
      `Anno: ${r.anno ?? 'non indicato'}`,
      `Fonte: ${r.fonte}`,
      `Licenza: ${r.licenza ?? 'non indicata'}`,
      r.incertezza_m != null ? `Incertezza: ± ${r.incertezza_m} m` : null,
      r.identificazione_automatica ? 'Identificazione automatica' : null,
    ]
      .filter(Boolean)
      .join('\n');
    return [
      '  <Placemark>',
      `    <name>${xml(`${r.nome_comune} (${r.specie})`)}</name>`,
      `    <description>${xml(details)}</description>`,
      `    <Point><coordinates>${r.longitudine},${r.latitudine},0</coordinates></Point>`,
      '  </Placemark>',
    ].join('\n');
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2">',
    '<Document>',
    `  <name>${xml(title)}</name>`,
    `  <description>${xml(ATTRIBUTION)}</description>`,
    ...placemarks,
    '</Document>',
    '</kml>',
    '',
  ].join('\n');
}

export function formatExport(format, rows, { title, meta } = {}) {
  if (format === 'csv') return toCSV(rows);
  if (format === 'geojson') return toGeoJSON(rows, meta);
  return toKML(rows, title);
}

/** Nome del file: "ias-tracker_ailanthus-altissima_2026-11-06.csv" */
export function exportFileName(slug, format, date = new Date()) {
  return `ias-tracker_${slug}_${date.toISOString().slice(0, 10)}.${EXPORT_FORMATS[format].extension}`;
}
