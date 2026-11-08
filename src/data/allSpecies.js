import { dataDate, readSpeciesPoints } from './remote';

// Punti di tutte le specie, caricati una volta sola per versione dei dati.
// Servono a "Vicino a me" e alla vista di tutte le specie insieme.

let cache = { key: null, promise: null };

/**
 * @param {object[]} speciesList  catalogo (con le statistiche aggiornate)
 * @param {object|null} manifest  dati scaricati
 * @returns {Promise<{species: object, data: object}[]>}
 */
export function loadAllDatasets(speciesList, manifest) {
  // Non basta la data dei dati: uno scaricamento incompleto e il suo completamento successivo
  // hanno la stessa data ma file diversi (prima alcune specie usavano ancora i dati inclusi).
  const key = `${dataDate(manifest)}|${manifest?.generato_il ?? ''}|${manifest?.incompleto ? 1 : 0}`;
  if (cache.key !== key || !cache.promise) {
    const promise = Promise.all(
      speciesList
        .filter((s) => s.total > 0)
        .map(async (species) => ({ species, data: await readSpeciesPoints(species, manifest).catch(() => null) })),
    ).then((list) => list.filter((d) => d.data));
    promise.catch(() => {
      cache = { key: null, promise: null }; // riprova la prossima volta
    });
    cache = { key, promise };
  }
  return cache.promise;
}
