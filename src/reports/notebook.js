// Taccuino di campo: le voci salvate sul telefono sono presenze (segnalazioni di una specie)
// o interventi di gestione (taglio, eradicazione…). Funzioni pure, testate in __tests__/.

import { csvCell } from '../utils/csv';
import { escapeMarkup as xml, kmlDescription } from '../utils/markup';

/** Tipi di intervento di gestione. */
export const INTERVENTIONS = [
  { value: 'taglio', label: 'Taglio' },
  { value: 'sfalcio', label: 'Sfalcio' },
  { value: 'eradicazione', label: 'Eradicazione / estirpazione' },
  { value: 'cercinatura', label: 'Cercinatura' },
  { value: 'trattamento', label: 'Trattamento chimico' },
  { value: 'smaltimento', label: 'Smaltimento del materiale' },
  { value: 'monitoraggio', label: 'Controllo / monitoraggio' },
  { value: 'altro', label: 'Altro' },
];

/**
 * Lunghezza massima delle note (caratteri), circa una pagina. Il taccuino è salvato come un
 * unico testo con spazio limitato su Android (vedi NOTEBOOK_MAX_BYTES in storage.js): una nota
 * enorme incollata per sbaglio non deve poterlo riempire.
 */
export const NOTE_MAX = 2000;

/** Le voci salvate prima del taccuino non hanno il campo `kind`: sono presenze. */
export function entryKind(entry) {
  return entry.kind === 'intervento' ? 'intervento' : 'presenza';
}

export function interventionLabel(value) {
  return INTERVENTIONS.find((i) => i.value === value)?.label ?? 'Intervento';
}

/** "Presenza" oppure "Intervento: Taglio". */
export function entryTitle(entry) {
  return entryKind(entry) === 'intervento' ? `Intervento: ${interventionLabel(entry.intervention)}` : 'Presenza';
}

/** Filtra le voci per tipo: 'tutte' | 'presenza' | 'intervento'. */
export function filterEntries(entries, kind) {
  return kind === 'tutte' ? entries : entries.filter((e) => entryKind(e) === kind);
}

/**
 * Canali di invio di una voce, divisi tra invii confermati dal sistema e invii solo avviati
 * (app di posta o condivisione aperte; vedi reports/send.js). Le voci delle versioni
 * precedenti non hanno il campo `confirmed`: invio non confermato.
 * @returns {{confirmed: string[], unconfirmed: string[]}} canali distinti, nell'ordine
 */
export function sendStatus(entry) {
  const confirmed = new Set();
  const unconfirmed = new Set();
  for (const s of entry.sent ?? []) (s.confirmed === true ? confirmed : unconfirmed).add(s.channel);
  for (const channel of confirmed) unconfirmed.delete(channel); // confermato almeno una volta
  return { confirmed: [...confirmed], unconfirmed: [...unconfirmed] };
}

// ------------------------------------------------------------------ esportazione

export const NOTEBOOK_FORMATS = {
  csv: { label: 'CSV', extension: 'csv', mimeType: 'text/csv', uti: 'public.comma-separated-values-text' },
  geojson: { label: 'GeoJSON', extension: 'geojson', mimeType: 'application/geo+json', uti: 'public.json' },
  kml: {
    label: 'KML',
    extension: 'kml',
    mimeType: 'application/vnd.google-earth.kml+xml',
    uti: 'com.google.earth.kml',
  },
};

/**
 * Una riga per voce, con nomi di colonna in italiano. "inviata": canali con invio confermato;
 * "invio_non_confermato": app di posta o condivisione aperte, invio non verificabile.
 */
export function notebookRows(entries) {
  return entries.map((e) => {
    const sent = sendStatus(e);
    return {
      data: e.createdAt,
      tipo: entryKind(e),
      intervento: entryKind(e) === 'intervento' ? interventionLabel(e.intervention) : '',
      specie: e.scientificName,
      nome_comune: e.commonName,
      latitudine: e.latitude,
      longitudine: e.longitude,
      precisione_m: e.accuracy != null ? Math.round(e.accuracy) : null,
      origine_posizione: e.locationSource,
      note: e.note?.trim() ?? '',
      rilevatore: e.signature?.trim() ?? '',
      foto: e.photos?.length ?? 0,
      inviata: sent.confirmed.join(' '),
      invio_non_confermato: sent.unconfirmed.join(' '),
    };
  });
}

const COLUMNS = [
  'data',
  'tipo',
  'intervento',
  'specie',
  'nome_comune',
  'latitudine',
  'longitudine',
  'precisione_m',
  'origine_posizione',
  'note',
  'rilevatore',
  'foto',
  'inviata',
  'invio_non_confermato',
];

export function formatNotebook(format, entries) {
  const rows = notebookRows(entries);
  if (format === 'csv') {
    return `${[COLUMNS.join(','), ...rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(','))].join('\n')}\n`;
  }
  if (format === 'geojson') {
    return JSON.stringify(
      {
        type: 'FeatureCollection',
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
  const placemarks = rows.map((r) => {
    const details = [
      `Data: ${r.data}`,
      r.intervento ? `Intervento: ${r.intervento}` : 'Presenza',
      r.precisione_m != null ? `Precisione: ± ${r.precisione_m} m` : null,
      r.note ? `Note: ${r.note}` : null,
      r.rilevatore ? `Rilevatore: ${r.rilevatore}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    return [
      '  <Placemark>',
      `    <name>${xml(`${r.nome_comune} (${r.specie})`)}</name>`,
      `    <description>${kmlDescription(details)}</description>`,
      `    <Point><coordinates>${r.longitudine},${r.latitudine},0</coordinates></Point>`,
      '  </Placemark>',
    ].join('\n');
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2">',
    '<Document>',
    '  <name>AlienHub – taccuino di campo</name>',
    ...placemarks,
    '</Document>',
    '</kml>',
    '',
  ].join('\n');
}

/** "ias-tracker_taccuino_2026-11-06.csv" */
export function notebookFileName(format, date = new Date()) {
  return `ias-tracker_taccuino_${date.toISOString().slice(0, 10)}.${NOTEBOOK_FORMATS[format].extension}`;
}
