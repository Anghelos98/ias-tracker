// Trasformazione dei punti di una specie (formato compatto) in punti per la mappa, con i
// filtri scelti dall'utente. Funzioni pure, senza dipendenze dall'interfaccia: sono coperte
// dai test in __tests__/.

import { areaPredicate } from '../utils/distance';
import { safeWebUrl } from '../utils/url';

/** Oltre questa incertezza (metri) una posizione è considerata approssimativa. */
export const APPROXIMATE_M = 1000;

/**
 * @typedef {Object} Filters
 * @property {boolean} includeAutomatic   includere le identificazioni solo automatiche
 * @property {number|null} minYear        solo segnalazioni dal 1° gennaio di quest'anno (escluse quelle
 *                                        senza anno)
 * @property {number|null} maxAgeDays     solo segnalazioni degli ultimi N giorni (escluse quelle senza
 *                                        data completa); alternativo a minYear
 * @property {number|null} lastYears      solo segnalazioni degli ultimi N anni contati dalla data di oggi
 *                                        (dall'8/11/2021 se oggi è l'8/11/2026), vedi lastYearsStartDay;
 *                                        alternativo a minYear
 * @property {number|null} maxUncertainty solo posizioni con incertezza nota e non superiore (metri)
 */
export const DEFAULT_FILTERS = {
  includeAutomatic: false,
  minYear: null,
  maxAgeDays: null,
  lastYears: null,
  maxUncertainty: null,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Primo giorno (giorni dal 1970) del periodo "ultimi N anni": la data di oggi di N anni fa
 * (8 novembre 2026, 5 anni -> 8 novembre 2021). Il 29 febbraio di un anno non bisestile
 * diventa il 1° marzo.
 */
export function lastYearsStartDay(today, years) {
  const d = new Date(today * DAY_MS);
  return Math.floor(Date.UTC(d.getUTCFullYear() - years, d.getUTCMonth(), d.getUTCDate()) / DAY_MS);
}

// Inizio del periodo "ultimi N anni", memorizzato: passesFilters lo chiede per ogni record.
let startCache = { today: null, years: null, day: null, year: null };
function lastYearsStart(today, years) {
  if (startCache.today !== today || startCache.years !== years) {
    const day = lastYearsStartDay(today, years);
    startCache = { today, years, day, year: new Date(day * DAY_MS).getUTCFullYear() };
  }
  return startCache;
}

const MONTHS = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
];

/** "19 aprile 2026" da un giorno espresso in giorni dal 1970 (calcolato in UTC, senza fusi). */
export function formatDay(day) {
  const d = new Date(day * DAY_MS);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Giorno di oggi in giorni dal 1° gennaio 1970 (stessa unità del campo "giorno" dei punti). */
export function todayDay(now = Date.now()) {
  return Math.floor(now / DAY_MS);
}

/** Data ISO (AAAA-MM-GG) di un giorno espresso in giorni dal 1970. */
export function dayToIso(day) {
  return day != null ? new Date(day * DAY_MS).toISOString().slice(0, 10) : null;
}

/** Pagina del record su GBIF (i dati delle versioni precedenti non hanno l'identificativo). */
export function gbifUrl(gbifId) {
  // solo identificativi numerici: l'indirizzo resta una pagina di gbif.org
  return gbifId != null && /^\d+$/.test(String(gbifId)) ? `https://www.gbif.org/occurrence/${gbifId}` : null;
}

/** Pagina del dato nella banca dati di origine (iNaturalist, Pl@ntNet…), se nota. */
export function originalUrl(source, originalId) {
  return source?.link && originalId != null ? safeWebUrl(`${source.link}${originalId}`) : null;
}

/** Nome leggibile della banca dati di origine a partire dall'indirizzo. */
export function originalSiteName(url) {
  const host = /^https?:\/\/([^/]+)/.exec(url ?? '')?.[1]?.replace(/^www\./, '');
  if (!host) return null;
  if (host.endsWith('inaturalist.org')) return 'iNaturalist';
  if (host.endsWith('plantnet.org')) return 'Pl@ntNet';
  if (host.endsWith('observation.org')) return 'Observation.org';
  return host;
}

/**
 * Il record passa i filtri? `today` serve solo ai test (giorni dal 1970).
 *
 * Periodo:
 * - "dal <anno>" (minYear): dal 1° gennaio di quell'anno, in base all'anno dell'osservazione;
 * - "ultimi N anni" (lastYears): dalla data di oggi di N anni fa. Con la data completa si
 *   confronta il giorno; con il solo anno il record conta se l'anno cade tutto nel periodo
 *   (successivo a quello di inizio), altrimenti non si può sapere ed è escluso;
 * - "ultimo mese / anno" (maxAgeDays): solo record con la data completa.
 */
export function passesFilters({ year, automatic, uncertainty, day }, filters, today = todayDay()) {
  if (!filters.includeAutomatic && automatic) return false;
  if (filters.minYear != null && (year == null || year < filters.minYear)) return false;
  if (filters.maxAgeDays != null && (day == null || day < today - filters.maxAgeDays)) return false;
  if (filters.lastYears != null) {
    const start = lastYearsStart(today, filters.lastYears);
    if (day != null ? day < start.day : year == null || year <= start.year) return false;
  }
  if (filters.maxUncertainty != null && (uncertainty == null || uncertainty > filters.maxUncertainty)) return false;
  return true;
}

/** Numero di filtri diversi da quelli predefiniti (per il badge del pulsante). */
export function activeFilterCount(filters) {
  // anno minimo, ultimi giorni e ultimi anni sono modi diversi di scegliere lo stesso filtro (periodo)
  const period = filters.minYear != null || filters.maxAgeDays != null || filters.lastYears != null;
  return (period ? 1 : 0) + (filters.includeAutomatic ? 1 : 0) + (filters.maxUncertainty != null ? 1 : 0);
}

/**
 * Raggruppa per posizione i record di una o più specie: record con coordinate identiche
 * diventano UN solo punto con l'elenco dei record (anche di specie diverse), altrimenti
 * sulla mappa sarebbero segnalini sovrapposti. Ogni record porta con sé la sua specie.
 *
 * @param {{species: {slug: string, commonName: string, scientificName: string}, data: {fonti: {nome: string, licenza: string|null}[], punti: Array<[number, number, number|null, number, 0|1, number|null]>}}[]} datasets
 * @param {Filters} filters
 * @param {{center: {latitude: number, longitude: number}, radiusM: number} | null} [area]
 *   "Vicino a me" attivo: solo le segnalazioni entro il raggio
 * @returns {{features: object[], count: number}} punti GeoJSON e numero di record inclusi
 */
export function groupDatasets(datasets, filters, area = null) {
  const byLocation = new Map();
  const today = todayDay();
  const inArea = areaPredicate(area);
  let count = 0;
  for (const { species, data } of datasets) {
    const speciesInfo = { slug: species.slug, commonName: species.commonName, scientificName: species.scientificName };
    data.punti.forEach(([lon, lat, year, sourceIdx, automatic, uncertainty, , gbifId, originalId, day], i) => {
      if (inArea && !inArea(lon, lat)) return;
      const source = data.fonti[sourceIdx] ?? { nome: 'Fonte sconosciuta', licenza: null };
      const record = {
        id: `${species.slug}:${i}`,
        species: speciesInfo,
        year,
        day: day ?? null,
        source: source.nome,
        license: source.licenza,
        automatic: automatic === 1,
        uncertainty: uncertainty ?? null,
        gbifUrl: gbifUrl(gbifId),
        originalUrl: originalUrl(source, originalId),
      };
      if (!passesFilters(record, filters, today)) return;
      const key = `${lon},${lat}`;
      let location = byLocation.get(key);
      if (!location) {
        location = { lon, lat, records: [] };
        byLocation.set(key, location);
      }
      location.records.push(record);
      count += 1;
    });
  }

  const features = [];
  for (const { lon, lat, records } of byLocation.values()) {
    records.sort((r1, r2) => (r2.year ?? 0) - (r1.year ?? 0));
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: {
        id: records[0].id,
        records,
        automatic: records.every((r) => r.automatic),
        // approssimativa solo se tutte le segnalazioni hanno un'incertezza nota e ampia
        approximate: records.every((r) => r.uncertainty != null && r.uncertainty > APPROXIMATE_M),
      },
    });
  }
  return { features, count };
}

/** Specie distinte tra le segnalazioni di un punto, nell'ordine in cui compaiono. */
export function speciesOfRecords(records) {
  const seen = new Map();
  for (const r of records) if (!seen.has(r.species.slug)) seen.set(r.species.slug, r.species);
  return [...seen.values()];
}
