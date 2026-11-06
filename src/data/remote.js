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

function cacheFile(relPath) {
  // relPath: "species/<slug>.json", "sheets/<slug>.json" o "root/photos.json"
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

/**
 * Controlla se ci sono dati nuovi e scarica i file cambiati.
 * Non lancia errori: senza rete restituisce il manifest già salvato.
 * @returns {Promise<{manifest: object|null, downloaded: number}>}
 */
export async function checkForUpdates({ force = false } = {}) {
  const stored = await loadStoredManifest();
  try {
    const last = Number(await AsyncStorage.getItem(LAST_CHECK_KEY)) || 0;
    if (!force && Date.now() - last < CHECK_INTERVAL_MS) return { manifest: stored, downloaded: 0 };

    const remote = JSON.parse(await fetchWithTimeout(`${DATA_BASE_URL}/manifest.json`));
    if (remote.schema !== SCHEMA) return { manifest: stored, downloaded: 0 };
    if (stored && stored.generato_il === remote.generato_il) {
      await AsyncStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
      return { manifest: stored, downloaded: 0 };
    }

    // Scarica i file cambiati. Se un file non si scarica, nel manifest salvato resta
    // l'impronta vecchia, così verrà ritentato al prossimo controllo.
    let downloaded = 0;
    const saved = { ...remote, specie: {} };

    // Foto (un solo file per tutte le specie)
    if (remote.foto && (stored?.foto?.sha !== remote.foto.sha || !cacheFile(`root/${remote.foto.file}`).exists)) {
      try {
        const text = await fetchWithTimeout(`${DATA_BASE_URL}/${remote.foto.file}`);
        JSON.parse(text);
        const local = cacheFile(`root/${remote.foto.file}`);
        if (local.exists) local.delete();
        local.create();
        await local.write(text);
        downloaded += 1;
      } catch {
        saved.foto = stored?.foto ?? null;
      }
    }

    for (const [slug, entry] of Object.entries(remote.specie)) {
      const previous = stored?.specie?.[slug];
      const next = { ...entry };
      for (const kind of ['punti', 'scheda']) {
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
        }
      }
      saved.specie[slug] = next;
    }

    await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify(saved));
    await AsyncStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
    return { manifest: saved, downloaded };
  } catch {
    return { manifest: stored, downloaded: 0 };
  }
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

/** Punti di una specie: dati scaricati se più recenti, altrimenti quelli inclusi nell'app. */
export async function readSpeciesPoints(species, manifest) {
  if (remoteIsNewer(manifest)) {
    const cached = await readCached(manifest, species.slug, 'punti');
    if (cached) return cached;
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

/** Foto delle specie: scaricate se più recenti, altrimenti quelle incluse nell'app. */
export async function readPhotos(manifest) {
  if (remoteIsNewer(manifest) && manifest.foto) {
    try {
      const file = cacheFile(`root/${manifest.foto.file}`);
      if (file.exists) return JSON.parse(await file.text());
    } catch {
      // si usano quelle incluse nell'app
    }
  }
  return require('../../assets/data/photos.json');
}

/** Statistiche della specie (totale, anni, area) aggiornate con i dati scaricati. */
export function withRemoteStats(species, manifest) {
  if (!remoteIsNewer(manifest)) return species;
  const stats = manifest.specie?.[species.slug];
  if (!stats) return species;
  return {
    ...species,
    total: stats.totale,
    automatic: stats.identificazioni_automatiche,
    years: stats.anni,
    bbox: stats.bbox,
  };
}

/** Data dei dati effettivamente in uso (ISO). */
export function dataDate(manifest) {
  return remoteIsNewer(manifest) ? manifest.dati_gbif_al : DATA_UPDATED_AT;
}
