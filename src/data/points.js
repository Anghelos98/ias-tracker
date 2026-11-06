// Trasformazione dei punti di una specie (formato compatto) in punti per la mappa, con i
// filtri scelti dall'utente. Funzioni pure, senza dipendenze dall'interfaccia: sono coperte
// dai test in __tests__/.

/** Oltre questa incertezza (metri) una posizione è considerata approssimativa. */
export const APPROXIMATE_M = 1000;

/**
 * @typedef {Object} Filters
 * @property {boolean} includeAutomatic   includere le identificazioni solo automatiche
 * @property {number|null} minYear        solo segnalazioni da quest'anno (escluse quelle senza anno)
 * @property {number|null} maxUncertainty solo posizioni con incertezza nota e non superiore (metri)
 */
export const DEFAULT_FILTERS = { includeAutomatic: false, minYear: null, maxUncertainty: null };

/** Pagina del record su GBIF (i dati delle versioni precedenti non hanno l'identificativo). */
export function gbifUrl(gbifId) {
  return gbifId != null ? `https://www.gbif.org/occurrence/${gbifId}` : null;
}

/** Pagina del dato nella banca dati di origine (iNaturalist, Pl@ntNet…), se nota. */
export function originalUrl(source, originalId) {
  return source?.link && originalId != null ? `${source.link}${originalId}` : null;
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

/** Il record passa i filtri? */
export function passesFilters({ year, automatic, uncertainty }, filters) {
  if (!filters.includeAutomatic && automatic) return false;
  if (filters.minYear != null && (year == null || year < filters.minYear)) return false;
  if (filters.maxUncertainty != null && (uncertainty == null || uncertainty > filters.maxUncertainty)) return false;
  return true;
}

/** Numero di filtri diversi da quelli predefiniti (per il badge del pulsante). */
export function activeFilterCount(filters) {
  return Object.keys(DEFAULT_FILTERS).filter((k) => filters[k] !== DEFAULT_FILTERS[k]).length;
}

/**
 * Raggruppa per posizione i record di una o più specie: record con coordinate identiche
 * diventano UN solo punto con l'elenco dei record (anche di specie diverse), altrimenti
 * sulla mappa sarebbero segnalini sovrapposti. Ogni record porta con sé la sua specie.
 *
 * @param {{species: {slug: string, commonName: string, scientificName: string}, data: {fonti: {nome: string, licenza: string|null}[], punti: Array<[number, number, number|null, number, 0|1, number|null]>}}[]} datasets
 * @param {Filters} filters
 * @returns {{features: object[], count: number}} punti GeoJSON e numero di record inclusi
 */
export function groupDatasets(datasets, filters) {
  const byLocation = new Map();
  let count = 0;
  for (const { species, data } of datasets) {
    const speciesInfo = { slug: species.slug, commonName: species.commonName, scientificName: species.scientificName };
    data.punti.forEach(([lon, lat, year, sourceIdx, automatic, uncertainty, , gbifId, originalId], i) => {
      const source = data.fonti[sourceIdx];
      const record = {
        id: `${species.slug}:${i}`,
        species: speciesInfo,
        year,
        source: source.nome,
        license: source.licenza,
        automatic: automatic === 1,
        uncertainty: uncertainty ?? null,
        gbifUrl: gbifUrl(gbifId),
        originalUrl: originalUrl(source, originalId),
      };
      if (!passesFilters(record, filters)) return;
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
