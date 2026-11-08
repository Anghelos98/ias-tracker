import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

import { DATA_UPDATED_AT } from './species';

// Aggiornamento dei dati senza nuova versione dell'app.
//
// Un workflow di GitHub Actions rigenera ogni settimana i dati e li pubblica su GitHub Pages
// (vedi .github/workflows/update-data.yml e scripts/build_site.py). L'app legge il manifest,
// scarica solo i file la cui impronta (sha) è cambiata e li salva sul telefono. I dati inclusi
// nell'app restano la riserva quando non c'è rete o i dati scaricati sono più vecchi.

export const DATA_BASE_URL = 'https://anghelos98.github.io/ias-tracker/data/v1';
const SCHEMA = 1;
const MANIFEST_KEY = 'ias-tracker/remote-manifest/v1';
const LAST_CHECK_KEY = 'ias-tracker/remote-last-check/v1';
const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000; // al massimo un controllo ogni 12 ore
const TIMEOUT_MS = 15000;
const GLOBAL_FILES = ['foto', 'simili', 'europa', 'novita']; // file del manifest comuni a tutte le specie

function cacheFile(relPath) {
  // relPath: "species/<slug>.json", "sheets/<slug>.json", "grid/<slug>.json" o "root/<file>.json"
  const [folder, name] = relPath.split('/');
  const dir = new Directory(Paths.document, 'data-v1', folder);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return new File(dir, name);
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

/** Manifest dei dati già scaricati (o null). */
export async function loadStoredManifest() {
  try {
    const raw = await AsyncStorage.getItem(MANIFEST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** true se i dati scaricati sono più recenti di quelli inclusi nell'app. */
function remoteIsNewer(manifest) {
  return Boolean(manifest?.dati_gbif_al && manifest.dati_gbif_al > DATA_UPDATED_AT);
}

// I controlli (all'avvio, manuale dalle Impostazioni) si eseguono uno alla volta: due
// scaricamenti contemporanei scriverebbero gli stessi file.
let checkQueue = Promise.resolve();

/**
 * Controlla se ci sono dati nuovi e scarica i file cambiati.
 * Non lancia errori: senza rete restituisce il manifest già salvato.
 * @param {{force?: boolean, onDownloadStart?: () => void}} [options]
 *   force: controlla anche se l'ultimo controllo è recente (aggiornamento manuale)
 *   onDownloadStart: chiamata una volta, solo se ci sono davvero file da scaricare
 * @returns {Promise<{manifest: object|null, downloaded: number,
 *   status: 'skipped'|'current'|'updated'|'incomplete'|'unsupported'|'offline'}>}
 */
export function checkForUpdates(options = {}) {
  const result = checkQueue.then(() => runCheck(options));
  checkQueue = result.catch(() => {});
  return result;
}

async function runCheck({ force = false, onDownloadStart } = {}) {
  const stored = await loadStoredManifest();
  try {
    const last = Number(await AsyncStorage.getItem(LAST_CHECK_KEY)) || 0;
    if (!force && Date.now() - last < CHECK_INTERVAL_MS) return { manifest: stored, downloaded: 0, status: 'skipped' };

    const remote = JSON.parse(await fetchWithTimeout(`${DATA_BASE_URL}/manifest.json`));
    // dati in un formato più recente: servirà un aggiornamento dell'app
    if (remote.schema !== SCHEMA) return { manifest: stored, downloaded: 0, status: 'unsupported' };
    // Stessa versione già scaricata per intero: niente da fare. Se l'ultimo scaricamento era
    // rimasto incompleto (`incompleto`), si ritentano i file mancanti.
    if (stored && stored.generato_il === remote.generato_il && !stored.incompleto) {
      await AsyncStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
      return { manifest: stored, downloaded: 0, status: 'current' };
    }

    // Scarica i file cambiati. Se un file non si scarica, nel manifest salvato resta
    // l'impronta vecchia, così verrà ritentato al prossimo controllo.
    onDownloadStart?.();
    let downloaded = 0;
    let failed = 0;
    const saved = { ...remote, specie: {} };

    // File comuni a tutte le specie (foto, specie simili)
    for (const key of GLOBAL_FILES) {
      const file = remote[key];
      if (!file) continue;
      const local = cacheFile(`root/${file.file}`);
      if (stored?.[key]?.sha === file.sha && local.exists) continue;
      try {
        const text = await fetchWithTimeout(`${DATA_BASE_URL}/${file.file}`);
        JSON.parse(text);
        if (local.exists) local.delete();
        local.create();
        await local.write(text);
        downloaded += 1;
      } catch {
        saved[key] = stored?.[key] ?? null;
        failed += 1;
      }
    }

    for (const [slug, entry] of Object.entries(remote.specie)) {
      const previous = stored?.specie?.[slug];
      const next = { ...entry };
      for (const kind of ['punti', 'scheda', 'griglia']) {
        const file = entry[kind];
        if (!file) continue;
        const local = cacheFile(file.file);
        if (previous?.[kind]?.sha === file.sha && local.exists) continue;
        try {
          const text = await fetchWithTimeout(`${DATA_BASE_URL}/${file.file}`);
          JSON.parse(text); // non salvare file troncati o corrotti
          if (local.exists) local.delete();
          local.create();
          await local.write(text);
          downloaded += 1;
        } catch {
          next[kind] = previous?.[kind] ?? null;
          failed += 1;
        }
      }
      saved.specie[slug] = next;
    }

    if (failed) saved.incompleto = true;
    await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify(saved));
    await AsyncStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
    return { manifest: saved, downloaded, status: failed ? 'incomplete' : 'updated' };
  } catch {
    return { manifest: stored, downloaded: 0, status: 'offline' };
  }
}

/** Momento dell'ultimo controllo online riuscito (ms) o null. */
export async function lastCheckTime() {
  try {
    return Number(await AsyncStorage.getItem(LAST_CHECK_KEY)) || null;
  } catch {
    return null;
  }
}

/**
 * Elimina i dati scaricati: l'app torna a quelli inclusi nell'installazione e li riscarica al
 * prossimo controllo. Utile se i dati scaricati sembrano danneggiati o per liberare spazio.
 */
export function clearDownloadedData() {
  const run = checkQueue.then(async () => {
    globalCache.clear();
    const dir = new Directory(Paths.document, 'data-v1');
    if (dir.exists) dir.delete();
    await AsyncStorage.multiRemove([MANIFEST_KEY, LAST_CHECK_KEY]);
  });
  checkQueue = run.catch(() => {});
  return run;
}

async function readCached(manifest, slug, kind) {
  const entry = manifest?.specie?.[slug]?.[kind];
  if (!entry) return null;
  try {
    const file = cacheFile(entry.file);
    return file.exists ? JSON.parse(await file.text()) : null;
  } catch {
    return null;
  }
}

/** Il file dei punti ha la forma attesa? (un file malformato bloccherebbe la mappa) */
export function isValidPointsData(data) {
  return Boolean(data && Array.isArray(data.punti) && Array.isArray(data.fonti));
}

/** Punti di una specie: dati scaricati se più recenti, altrimenti quelli inclusi nell'app. */
export async function readSpeciesPoints(species, manifest) {
  if (remoteIsNewer(manifest)) {
    const cached = await readCached(manifest, species.slug, 'punti');
    if (isValidPointsData(cached)) return cached;
    if (manifest.specie?.[species.slug]?.totale === 0) return null;
  }
  return species.load ? species.load() : null;
}

/** Scheda ISPRA di una specie: scaricata se più recente, altrimenti quella inclusa nell'app. */
export async function readSpeciesSheet(species, manifest) {
  if (remoteIsNewer(manifest)) {
    const cached = await readCached(manifest, species.slug, 'scheda');
    if (cached) return cached;
  }
  return species.sheet ? species.sheet() : null;
}

// File comuni già letti, per impronta (sha): foto, specie simili ed EASIN servono a ogni
// apertura di una scheda specie, e rileggerli e decodificarli ogni volta era lavoro sprecato.
// Si conservano solo le letture riuscite; la cache si svuota con clearDownloadedData.
const globalCache = new Map();

async function readGlobal(manifest, key) {
  if (remoteIsNewer(manifest) && manifest[key]) {
    const { file: name, sha } = manifest[key];
    const cacheKey = `${key}|${name}|${sha}`;
    const cached = globalCache.get(cacheKey);
    if (cached) return cached;
    try {
      const file = cacheFile(`root/${name}`);
      if (file.exists) {
        const data = JSON.parse(await file.text());
        globalCache.set(cacheKey, data);
        return data;
      }
    } catch {
      // si usa il file incluso nell'app
    }
  }
  return null;
}

/** Griglia ISPRA 10×10 km di una specie: scaricata se più recente, altrimenti inclusa nell'app. */
export async function readSpeciesGrid(species, manifest) {
  if (remoteIsNewer(manifest)) {
    const cached = await readCached(manifest, species.slug, 'griglia');
    if (Array.isArray(cached?.poligoni)) return cached;
  }
  return species.grid ? species.grid() : null;
}

/** Foto delle specie (iNaturalist): scaricate se più recenti, altrimenti quelle incluse nell'app. */
export async function readPhotos(manifest) {
  return (await readGlobal(manifest, 'foto')) ?? require('../../assets/data/photos.json');
}

/** Specie simili (citazioni ISPRA): scaricate se più recenti, altrimenti quelle incluse nell'app. */
export async function readLookalikes(manifest) {
  return (await readGlobal(manifest, 'simili')) ?? require('../../assets/data/lookalikes.json');
}

/** Dati europei EASIN: scaricati se più recenti, altrimenti quelli inclusi nell'app. */
export async function readEasin(manifest) {
  return (await readGlobal(manifest, 'europa')) ?? require('../../assets/data/easin.json');
}

/** Novità delle ultime settimane: scaricate se più recenti, altrimenti quelle incluse nell'app. */
export async function readNews(manifest) {
  return (await readGlobal(manifest, 'novita')) ?? require('../../assets/data/news.json');
}

/** Statistiche della specie (totale, anni, area) aggiornate con i dati scaricati. */
export function withRemoteStats(species, manifest) {
  if (!remoteIsNewer(manifest)) return species;
  const stats = manifest.specie?.[species.slug];
  if (!stats) return species;
  // campi mancanti o non validi: si tengono quelli inclusi nell'app
  return {
    ...species,
    total: Number.isFinite(stats.totale) ? stats.totale : species.total,
    automatic: Number.isFinite(stats.identificazioni_automatiche) ? stats.identificazioni_automatiche : species.automatic,
    years: stats.anni === undefined ? species.years : stats.anni,
    bbox: Array.isArray(stats.bbox) && stats.bbox.length === 4 ? stats.bbox : species.total ? species.bbox : null,
  };
}

/** Data dei dati effettivamente in uso (ISO). */
export function dataDate(manifest) {
  return remoteIsNewer(manifest) ? manifest.dati_gbif_al : DATA_UPDATED_AT;
}
