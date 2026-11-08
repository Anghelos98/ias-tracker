import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

import { isPlausibleIsoDate } from './news';
import { DATA_UPDATED_AT, SPECIES } from './species';

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
// File del manifest comuni a tutte le specie, con il loro nome fisso (scripts/build_site.py):
// un nome diverso a ogni aggiornamento lascerebbe sul telefono i file vecchi, senza limite.
const GLOBAL_FILES = {
  foto: 'photos.json',
  simili: 'lookalikes.json',
  europa: 'easin.json',
  novita: 'news.json',
};

// Difesa in profondità sui dati scaricati. Il sito è del progetto, ma ciò che arriva dalla rete
// viene salvato sul telefono e riletto a ogni avvio: un errore della pipeline (o un account
// compromesso) non deve poter scrivere fuori dalla cartella dei dati, riempire la memoria o
// bloccare l'app a ogni apertura con un file dalla forma inattesa.
//
// Dimensione massima per tipo di file (caratteri del testo scaricato), con ampio margine sulle
// dimensioni di oggi, e in tutto: con un solo limite per file, 49 specie × 3 file arriverebbero a
// gigabyte. Il manifest, le schede e i file comuni sono piccoli; i punti crescono con GBIF.
const MAX_CHARS = {
  manifest: 1024 * 1024, // oggi ~20 KB
  punti: 10 * 1024 * 1024, // oggi il più grande è ~0,7 MB
  scheda: 512 * 1024, // ~11 KB
  griglia: 2 * 1024 * 1024, // ~92 KB
  foto: 1024 * 1024, // ~63 KB
  simili: 1024 * 1024, // ~9 KB
  europa: 1024 * 1024, // ~60 KB
  novita: 1024 * 1024,
};
const TOTAL_MAX_CHARS = 50 * 1024 * 1024; // tutti i file salvati insieme (oggi ~2 MB)
const KNOWN_SLUGS = new Set(SPECIES.map((s) => s.slug)); // solo le specie che l'app sa mostrare
const SPECIES_FOLDERS = { punti: 'species', scheda: 'sheets', griglia: 'grid' };
// Percorso relativo ammesso: una cartella nota e un nome semplice (niente "..", "/" o "\").
const CACHE_PATH = /^(species|sheets|grid|root)\/[a-z0-9][a-z0-9_-]*\.json$/;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isCount = (v) => Number.isInteger(v) && v >= 0;
// Impronta del file nel manifest: sha256 abbreviato (scripts/build_site.py ne usa 16 cifre).
const isSha = (v) => typeof v === 'string' && /^[0-9a-f]{16,64}$/.test(v);

// Controlli dei campi. Vanno controllati tutti quelli che l'app mostra o usa nei calcoli: in
// React Native un testo atteso che arriva come oggetto, o un elenco che arriva come testo,
// è un errore durante il disegno, cioè la chiusura dell'app.
const isOptString = (v) => v == null || typeof v === 'string';
const isOptText = (v) => v == null || typeof v === 'string' || Number.isFinite(v);
const isStringList = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isOptStringList = (v) => v == null || isStringList(v);
const isListOf = (v, check) => Array.isArray(v) && v.every(check);
const isOptListOf = (v, check) => v == null || isListOf(v, check);
const isOptInt = (v) => v == null || Number.isInteger(v);
const isLon = (v) => Number.isFinite(v) && v >= -180 && v <= 180;
const isLat = (v) => Number.isFinite(v) && v >= -90 && v <= 90;
// Identificativi GBIF e della banca dati di origine: numeri o testi brevi (gbifUrl e
// originalUrl li controllano di nuovo prima di comporre un indirizzo).
const isOptId = (v) => v == null || Number.isInteger(v) || (typeof v === 'string' && v.length <= 64);
// Giorno dell'osservazione (giorni dal 1970): oltre ±1.000.000 (circa 2700 anni) la data non
// esiste e la conversione in testo (toISOString) lancia un errore.
const MAX_DAY = 1000000;

/** Fonte di un file dei punti: nome mostrato nella scheda del punto, licenza e link. */
function isValidSource(s) {
  return isPlainObject(s) && typeof s.nome === 'string' && isOptString(s.licenza) && isOptString(s.link);
}

/**
 * Punto in formato compatto (scripts/build_app_data.py): [lon, lat, anno, fonte, automatica,
 * incertezza, regione, gbif_id, id_originale, giorno]. I campi dopo il sesto mancano nei dati
 * delle versioni precedenti; eventuali campi aggiunti in futuro sono ignorati.
 */
function isValidPoint(p, sourceCount) {
  return (
    Array.isArray(p) &&
    isLon(p[0]) &&
    isLat(p[1]) &&
    isOptInt(p[2]) && // anno
    (p[3] == null || (Number.isInteger(p[3]) && p[3] >= 0 && p[3] < sourceCount)) && // fonte
    (p[4] == null || p[4] === 0 || p[4] === 1) && // identificazione solo automatica
    (p[5] == null || (Number.isFinite(p[5]) && p[5] >= 0)) && // incertezza in metri
    isOptInt(p[6]) && // regione (codice ISTAT)
    isOptId(p[7]) &&
    isOptId(p[8]) &&
    (p[9] == null || (Number.isInteger(p[9]) && Math.abs(p[9]) <= MAX_DAY)) // giorno
  );
}

/** Scheda ISPRA: i campi mostrati da SpeciesSheet. */
function isValidSheet(s) {
  const texts = [
    'nome_scientifico_autore',
    'presenza_italia',
    'famiglia',
    'nome_inglese',
    'sinonimi',
    'mappa_distribuzione',
    'pdf_scheda',
    'pdf_valutazione_rischio',
  ];
  return (
    isPlainObject(s) &&
    texts.every((k) => isOptString(s[k])) &&
    isOptStringList(s.descrizione) &&
    isOptListOf(
      s.sezioni,
      (sec) =>
        isPlainObject(sec) &&
        typeof sec.titolo === 'string' &&
        isOptListOf(sec.blocchi, (b) => isPlainObject(b) && isOptString(b.sottotitolo) && isOptString(b.testo)),
    ) &&
    (s.fonte == null ||
      (isPlainObject(s.fonte) &&
        ['attribuzione', 'licenza', 'recuperato_il', 'url'].every((k) => isOptString(s.fonte[k]))))
  );
}

/** Anello di un poligono della griglia ISPRA: coppie [lon, lat] valide (le disegna la mappa). */
const isRing = (r) => isListOf(r, (c) => Array.isArray(c) && isLon(c[0]) && isLat(c[1]));

function isValidGrid(g) {
  return (
    isPlainObject(g) &&
    isListOf(g.poligoni, (p) => isPlainObject(p) && isRing(p.esterno) && isOptListOf(p.buchi, isRing))
  );
}

/** Foto di una specie (iNaturalist): autore e licenza vanno sempre mostrati (CC BY). */
const isValidPhotoList = (list) =>
  isListOf(
    list,
    (p) => isPlainObject(p) && ['url', 'pagina', 'autore', 'licenza'].every((k) => typeof p[k] === 'string'),
  );

/** Specie simili di una specie (citazioni ISPRA e collegamenti ad altre specie dell'elenco). */
const isValidLookalikes = (e) =>
  isPlainObject(e) &&
  isOptListOf(
    e.voci,
    (v) => isPlainObject(v) && typeof v.citazione === 'string' && isStringList(v.simili) && isOptString(v.url),
  ) &&
  isOptStringList(e.correlate);

/** Dati europei EASIN di una specie. */
const isValidEasin = (e) =>
  isPlainObject(e) &&
  isOptString(e.url) &&
  isOptStringList(e.paesi_presenza) &&
  isOptStringList(e.vie_introduzione) &&
  isOptListOf(e.impatti, (i) => isPlainObject(i) && typeof i.settore === 'string' && typeof i.livello === 'string') &&
  (e.prima_introduzione_europa == null ||
    (isPlainObject(e.prima_introduzione_europa) &&
      isOptText(e.prima_introduzione_europa.anno) &&
      isOptString(e.prima_introduzione_europa.paese)));

/** File comune con una voce per specie ({specie: {slug: voce}}), ogni voce controllata. */
const speciesMapOf = (isValidEntry) => (data) =>
  isPlainObject(data) && isPlainObject(data.specie) && Object.values(data.specie).every(isValidEntry);

function cacheFile(relPath) {
  // relPath: "species/<slug>.json", "sheets/<slug>.json", "grid/<slug>.json" o "root/<file>.json".
  // Arriva dal manifest scaricato: un percorso come "../reports" uscirebbe dalla cartella dei
  // dati e potrebbe cancellare o sovrascrivere altri file dell'app (es. le foto del taccuino).
  if (typeof relPath !== 'string' || !CACHE_PATH.test(relPath)) throw new Error('Percorso non valido');
  const [folder, name] = relPath.split('/');
  const dir = new Directory(Paths.document, 'data-v1', folder);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return new File(dir, name);
}

/** Percorso atteso del file di una specie: solo quello costruito dalla pipeline (build_site.py). */
function speciesPath(slug, kind) {
  return `${SPECIES_FOLDERS[kind]}/${slug}.json`;
}

/**
 * Novità con la forma attesa: sono lette all'avvio per l'avviso sulla mappa, e un campo di tipo
 * sbagliato (es. "settimane" non elenco) farebbe chiudere l'app a ogni apertura.
 */
export function isValidNews(data) {
  if (!isPlainObject(data) || !Array.isArray(data.settimane)) return false;
  return data.settimane.every(
    (w) =>
      isPlainObject(w) &&
      // date valide e non nel futuro: la più recente viene salvata come "già vista/annunciata"
      isPlausibleIsoDate(w.dati_al) &&
      (w.precedenti_al == null || isPlausibleIsoDate(w.precedenti_al)) &&
      (w.specie === undefined ||
        (isPlainObject(w.specie) &&
          Object.values(w.specie).every(
            (s) =>
              isPlainObject(s) &&
              isCount(s.nuove) &&
              (s.regioni === undefined || (isPlainObject(s.regioni) && Object.values(s.regioni).every(isCount))) &&
              (s.prime_regioni === undefined || (Array.isArray(s.prime_regioni) && s.prime_regioni.every(isCount))),
          ))),
  );
}

/**
 * Controllo della forma di ogni tipo di file, prima di salvarlo e quando lo si rilegge. Un file
 * che non passa non viene salvato (o, se già salvato, viene ignorato): l'app usa i dati inclusi
 * nell'installazione, che passano tutti questi controlli (__tests__/remoteValidation.test.js).
 */
const VALIDATORS = {
  punti: (data) => isValidPointsData(data),
  scheda: isValidSheet,
  griglia: isValidGrid,
  foto: speciesMapOf(isValidPhotoList),
  simili: speciesMapOf(isValidLookalikes),
  europa: speciesMapOf(isValidEasin),
  novita: isValidNews,
};

/** Il file ha la forma attesa per il suo tipo (una chiave di VALIDATORS)? */
export function isValidDataFile(kind, data) {
  return Boolean(VALIDATORS[kind]?.(data));
}

/**
 * Manifest con i campi su cui si basano il confronto delle date e lo scaricamento. La data dei
 * dati non può essere nel futuro: farebbe preferire i dati scaricati a quelli di qualsiasi
 * versione futura dell'app.
 */
function isValidManifest(m) {
  return (
    isPlainObject(m) &&
    typeof m.generato_il === 'string' &&
    m.generato_il.length <= 40 &&
    isPlausibleIsoDate(m.dati_gbif_al) &&
    isPlainObject(m.specie)
  );
}

/**
 * Scarica un file, lo controlla e solo allora sostituisce quello salvato.
 *
 * Il file viene scritto accanto a quello vecchio (".tmp") e poi spostato al suo posto: se l'app
 * viene chiusa a metà, resta il file precedente intero. Prima dello spostamento si confronta
 * l'impronta (sha256) del file scritto con quella del manifest: così si scartano anche i file
 * giusti nella forma ma diversi da quelli pubblicati, per esempio la versione precedente
 * servita dalla cache del sito subito dopo un aggiornamento (verrebbe salvata con l'impronta
 * nuova e non più riscaricata fino all'aggiornamento successivo).
 */
async function downloadTo(local, relPath, isValid, sha, maxChars) {
  if (!isSha(sha)) throw new Error('Impronta non valida');
  const text = await fetchWithTimeout(`${DATA_BASE_URL}/${relPath}`, maxChars);
  if (!isValid(JSON.parse(text))) throw new Error('Formato non valido'); // anche file troncati o corrotti
  const tmp = new File(`${local.uri}.tmp`);
  if (tmp.exists) tmp.delete();
  tmp.create();
  await tmp.write(text);
  if (!(await tmp.digest('SHA-256')).startsWith(sha)) {
    tmp.delete();
    throw new Error('Impronta diversa da quella del manifest');
  }
  await tmp.move(local, { overwrite: true });
  return text.length;
}

/**
 * Testo di un indirizzo, al massimo `maxChars` caratteri. Se il sito dichiara una dimensione
 * maggiore (Content-Length) il file non viene nemmeno letto; altrimenti si controlla dopo.
 */
async function fetchWithTimeout(url, maxChars) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const declared = Number(response.headers?.get?.('content-length'));
    if (declared > maxChars) {
      controller.abort();
      throw new Error('File troppo grande');
    }
    const text = await response.text();
    if (text.length > maxChars) throw new Error('File troppo grande');
    return text;
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
  // data controllata (anche nei manifest salvati da versioni precedenti): è mostrata
  // nell'interfaccia (dataDate) e non può essere nel futuro
  return isPlausibleIsoDate(manifest?.dati_gbif_al) && manifest.dati_gbif_al > DATA_UPDATED_AT;
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

    const remote = JSON.parse(await fetchWithTimeout(`${DATA_BASE_URL}/manifest.json`, MAX_CHARS.manifest));
    // dati in un formato più recente: servirà un aggiornamento dell'app
    if (remote?.schema !== SCHEMA) return { manifest: stored, downloaded: 0, status: 'unsupported' };
    // manifest malformato: si tengono i dati attuali (come senza rete)
    if (!isValidManifest(remote)) throw new Error('Manifest non valido');
    // Stessa versione già scaricata per intero: niente da fare. Se l'ultimo scaricamento era
    // rimasto incompleto (`incompleto`), si ritentano i file mancanti.
    if (stored && stored.generato_il === remote.generato_il && !stored.incompleto) {
      await AsyncStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
      return { manifest: stored, downloaded: 0, status: 'current' };
    }

    // Solo i campi usati dall'app, controllati: il manifest salvato non cresce con campi estranei.
    const saved = {
      schema: remote.schema,
      generato_il: remote.generato_il,
      dati_gbif_al: remote.dati_gbif_al,
      specie: {},
    };

    // File da tenere o da scaricare: prima i file comuni a tutte le specie (foto, specie simili,
    // EASIN, novità), poi quelli delle specie. Un file non valido (nome, percorso) conta come
    // non scaricato: nel manifest salvato resta la voce precedente, e si ritenterà.
    const tasks = [];
    let failed = 0;
    for (const [key, name] of Object.entries(GLOBAL_FILES)) {
      const file = remote[key];
      if (!file) continue;
      const fallback = () => {
        saved[key] = stored?.[key] ?? null;
      };
      try {
        if (file.file !== name) throw new Error('Nome non valido');
        tasks.push({
          kind: key,
          file,
          local: cacheFile(`root/${name}`),
          previousSha: stored?.[key]?.sha,
          apply: (entry) => (saved[key] = entry),
          fallback,
        });
      } catch {
        fallback();
        failed += 1;
      }
    }
    // Solo le specie note: un manifest con migliaia di voci inventate non provoca migliaia di
    // scaricamenti (né file sul telefono). Le specie che questa versione non conosce non
    // sarebbero comunque mostrate.
    for (const [slug, entry] of Object.entries(remote.specie)) {
      if (!KNOWN_SLUGS.has(slug) || !isPlainObject(entry)) continue;
      const previous = stored?.specie?.[slug];
      const next = speciesStats(entry);
      saved.specie[slug] = next;
      for (const kind of ['punti', 'scheda', 'griglia']) {
        const file = entry[kind];
        if (!file) continue;
        const fallback = () => {
          next[kind] = previous?.[kind] ?? null;
        };
        try {
          // il percorso deve essere esattamente quello della specie (vedi readCached)
          if (file.file !== speciesPath(slug, kind)) throw new Error('Percorso non valido');
          tasks.push({
            kind,
            file,
            local: cacheFile(file.file),
            previousSha: previous?.[kind]?.sha,
            apply: (e) => (next[kind] = e),
            fallback,
          });
        } catch {
          fallback();
          failed += 1;
        }
      }
    }

    // File già aggiornati: restano, e occupano parte dello spazio totale.
    let budget = TOTAL_MAX_CHARS;
    const toDownload = [];
    for (const task of tasks) {
      if (isSha(task.file.sha) && task.previousSha === task.file.sha && task.local.exists) {
        task.apply({ file: task.file.file, sha: task.file.sha });
        budget -= task.local.size ?? 0;
      } else toDownload.push(task);
    }

    // Scarica i file cambiati. Se un file non si scarica, nel manifest salvato resta
    // l'impronta vecchia, così verrà ritentato al prossimo controllo.
    if (toDownload.length) onDownloadStart?.();
    let downloaded = 0;
    for (const task of toDownload) {
      try {
        const maxChars = Math.min(MAX_CHARS[task.kind], budget);
        const chars = await downloadTo(task.local, task.file.file, VALIDATORS[task.kind], task.file.sha, maxChars);
        budget -= chars;
        task.apply({ file: task.file.file, sha: task.file.sha });
        downloaded += 1;
      } catch {
        task.fallback();
        failed += 1;
      }
    }

    if (failed) saved.incompleto = true;
    await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify(saved));
    await AsyncStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
    return {
      manifest: saved,
      downloaded,
      status: failed ? 'incomplete' : 'updated',
    };
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

/**
 * File di una specie salvato sul telefono, se ha la forma attesa (altrimenti null: si usano i
 * dati inclusi nell'app). Il controllo vale anche per i file salvati da versioni precedenti,
 * che non controllavano né il percorso né la forma.
 */
async function readCached(manifest, slug, kind) {
  const entry = manifest?.specie?.[slug]?.[kind];
  if (!entry || entry.file !== speciesPath(slug, kind)) return null;
  try {
    const file = cacheFile(entry.file);
    if (!file.exists) return null;
    const data = JSON.parse(await file.text());
    return VALIDATORS[kind](data) ? data : null;
  } catch {
    return null;
  }
}

/**
 * Il file dei punti ha la forma attesa, punto per punto? Un solo punto malformato (per esempio
 * null invece di [lon, lat, …], o una fonte senza nome) farebbe chiudere l'app ogni volta che
 * si apre quella specie, "Tutte le specie" o il rapporto per regione: in quel caso si usano i
 * punti inclusi nell'app. Il controllo di ~24.000 punti richiede pochi millisecondi.
 */
export function isValidPointsData(data) {
  if (!isPlainObject(data) || !Array.isArray(data.punti) || !isListOf(data.fonti, isValidSource)) return false;
  const sourceCount = data.fonti.length;
  return data.punti.every((p) => isValidPoint(p, sourceCount));
}

/** Punti di una specie: dati scaricati se più recenti, altrimenti quelli inclusi nell'app. */
export async function readSpeciesPoints(species, manifest) {
  if (remoteIsNewer(manifest)) {
    const cached = await readCached(manifest, species.slug, 'punti'); // già controllato (VALIDATORS)
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

// File comuni già letti, per impronta (sha): foto, specie simili ed EASIN servono a ogni
// apertura di una scheda specie, e rileggerli e decodificarli ogni volta era lavoro sprecato.
// Si conservano solo le letture riuscite; la cache si svuota con clearDownloadedData.
const globalCache = new Map();

async function readGlobal(manifest, key) {
  if (remoteIsNewer(manifest) && manifest[key]?.file === GLOBAL_FILES[key]) {
    const { file: name, sha } = manifest[key];
    const cacheKey = `${key}|${name}|${sha}`;
    const cached = globalCache.get(cacheKey);
    if (cached) return cached;
    try {
      const file = cacheFile(`root/${name}`); // nome non valido: errore, si usa il file incluso
      if (file.exists) {
        const data = JSON.parse(await file.text());
        // forma inattesa (es. salvato da una versione precedente): si usa il file incluso
        if (!VALIDATORS[key](data)) return null;
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
  const downloaded = await readGlobal(manifest, 'novita');
  return downloaded ? knownSpeciesOnly(downloaded) : require('../../assets/data/news.json');
}

/**
 * Novità limitate alle specie che l'app conosce. Il testo della notifica e il conteggio
 * dell'avviso sulla mappa userebbero altrimenti il nome della specie così come arriva nei dati
 * (testo arbitrario in una notifica di sistema); le specie aggiunte all'elenco dopo questa
 * versione dell'app non sarebbero comunque mostrabili.
 */
export function knownSpeciesOnly(news) {
  return {
    ...news,
    settimane: news.settimane.map((week) =>
      week.specie
        ? {
            ...week,
            specie: Object.fromEntries(Object.entries(week.specie).filter(([slug]) => KNOWN_SLUGS.has(slug))),
          }
        : week,
    ),
  };
}

/** Statistiche della specie (totale, anni, area) aggiornate con i dati scaricati. */
export function withRemoteStats(species, manifest) {
  if (!remoteIsNewer(manifest)) return species;
  const stats = manifest.specie?.[species.slug];
  if (!isPlainObject(stats)) return species;
  // campi mancanti o non validi: si tengono quelli inclusi nell'app
  const validYears = stats.anni === null || isValidYears(stats.anni);
  return {
    ...species,
    total: isCount(stats.totale) ? stats.totale : species.total,
    automatic: isCount(stats.identificazioni_automatiche) ? stats.identificazioni_automatiche : species.automatic,
    years: validYears ? stats.anni : species.years,
    bbox: isValidBbox(stats.bbox) ? stats.bbox : species.total ? species.bbox : null,
  };
}

/**
 * Riquadro [ovest, sud, est, nord] in gradi validi. La mappa vi si sposta (animateToRegion):
 * coordinate non numeriche o fuori scala darebbero una regione non valida, che Apple Maps
 * rifiuta con un'eccezione nativa (chiusura dell'app).
 */
function isValidBbox(b) {
  return (
    Array.isArray(b) &&
    b.length === 4 &&
    b.every(Number.isFinite) &&
    b[0] >= -180 &&
    b[2] <= 180 &&
    b[0] <= b[2] &&
    b[1] >= -90 &&
    b[3] <= 90 &&
    b[1] <= b[3]
  );
}

const isValidYears = (y) => isPlainObject(y) && Number.isFinite(y.min) && Number.isFinite(y.max);

/**
 * Statistiche di una specie dal manifest scaricato, solo se valide (le altre si prendono dai dati
 * inclusi nell'app, vedi withRemoteStats). I file della specie si aggiungono a parte.
 */
function speciesStats(entry) {
  const stats = {};
  if (isCount(entry.totale)) stats.totale = entry.totale;
  if (isCount(entry.identificazioni_automatiche)) stats.identificazioni_automatiche = entry.identificazioni_automatiche;
  if (entry.anni === null) stats.anni = null;
  else if (isValidYears(entry.anni)) stats.anni = { min: entry.anni.min, max: entry.anni.max };
  if (isValidBbox(entry.bbox)) stats.bbox = [...entry.bbox];
  return stats;
}

/** Data dei dati effettivamente in uso (ISO). */
export function dataDate(manifest) {
  return remoteIsNewer(manifest) ? manifest.dati_gbif_al : DATA_UPDATED_AT;
}
