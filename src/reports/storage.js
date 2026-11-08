import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

// Le segnalazioni restano sul telefono (l'app non le invia a nessun server): elenco in
// AsyncStorage, foto copiate nella cartella documenti dell'app (non viene cancellata dal sistema).
// Backup del telefono: su iOS AsyncStorage è escluso dal backup e le foto no; su Android tutto può
// finire nel backup Google (descritto in site/privacy.html, "Backup del telefono").

const STORAGE_KEY = 'ias-tracker/reports/v1';
const PHOTO_DIR_NAME = 'reports';

/**
 * @typedef {Object} Report
 * @property {string} id
 * @property {'presenza'|'intervento'} [kind]   tipo di voce del taccuino (assente = presenza)
 * @property {string|null} [intervention] tipo di intervento (vedi INTERVENTIONS in notebook.js)
 * @property {string} createdAt            data ISO
 * @property {string|null} speciesSlug     null = specie non indicata
 * @property {string} scientificName
 * @property {string} commonName
 * @property {number} latitude
 * @property {number} longitude
 * @property {number|null} accuracy        raggio di incertezza in metri
 * @property {'gps'|'foto'} locationSource
 * @property {string} note
 * @property {string|null} [signature]   firma facoltativa (nome, ente) dalle Impostazioni
 * @property {string[]} photos             URI dei file salvati
 * @property {{channel: 'email'|'regione'|'condivisione', at: string, confirmed?: boolean}[]} sent
 *   invii: `confirmed` è vero solo se il sistema ha confermato l'invio (vedi reports/send.js);
 *   le voci salvate dalle versioni precedenti non hanno il campo (invio non confermato)
 */

/**
 * Spazio massimo del taccuino su Android (byte del testo salvato).
 *
 * Su Android AsyncStorage è un database SQLite (limite predefinito della libreria: 6 MB in
 * tutto) e il taccuino è un solo valore: oltre circa 2 MB il valore si scrive ancora ma non si
 * legge più (limite della finestra di lettura di Android, CursorWindow), e il taccuino
 * risulterebbe vuoto. Superata questa soglia, con un margine, non si aggiungono voci nuove e
 * l'utente viene avvisato prima (NOTEBOOK_WARN). Su iOS i valori grandi sono file separati,
 * senza questo limite.
 */
export const NOTEBOOK_MAX_BYTES = 1500 * 1024;
/** Frazione dello spazio oltre la quale il taccuino mostra l'avviso "quasi pieno". */
export const NOTEBOOK_WARN = 0.8;
const hasSizeLimit = () => Platform.OS === 'android';

/** Byte del testo in UTF-8 (la codifica con cui SQLite lo conserva). */
export function utf8Length(text) {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      bytes += 4; // coppia surrogata (emoji e simili): un solo carattere di 4 byte
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

/**
 * Errore del taccuino riconoscibile dall'interfaccia (`code`):
 * - 'unreadable': l'elenco salvato non si legge (non viene mai sovrascritto);
 * - 'full': spazio esaurito su Android, la voce nuova non è stata aggiunta.
 */
function notebookError(code, cause) {
  const error = new Error(code === 'full' ? 'Taccuino pieno' : 'Taccuino non leggibile');
  error.code = code;
  error.cause = cause;
  return error;
}

/**
 * Su iOS il percorso della cartella dell'app cambia a ogni aggiornamento (o reinstallazione
 * da backup): gli URI assoluti salvati in passato non sarebbero più validi. Le foto stanno
 * tutte in `reports/`, quindi si ricostruisce l'URI dal nome del file.
 */
function currentPhotoUri(uri) {
  const name = typeof uri === 'string' ? uri.split('/').pop() : null;
  if (!name) return uri;
  try {
    return new File(Paths.document, PHOTO_DIR_NAME, name).uri;
  } catch {
    return uri;
  }
}

/** Voce letta dal telefono, con i campi essenziali sempre presenti. */
function normalizeReport(r) {
  return {
    ...r,
    note: typeof r.note === 'string' ? r.note : '',
    photos: Array.isArray(r.photos) ? r.photos.map(currentPhotoUri) : [],
    sent: Array.isArray(r.sent) ? r.sent : [],
  };
}

function isValidReport(r) {
  return Boolean(r && typeof r.id === 'string' && Number.isFinite(r.latitude) && Number.isFinite(r.longitude));
}

/**
 * Legge l'elenco salvato e lo spazio che occupa; se non è leggibile lancia un errore 'unreadable'
 * (per non sovrascriverlo con un elenco vuoto).
 */
async function readStored() {
  let raw;
  let parsed;
  try {
    raw = await AsyncStorage.getItem(STORAGE_KEY);
    parsed = raw ? JSON.parse(raw) : [];
  } catch (error) {
    throw notebookError('unreadable', error); // lettura non riuscita o testo rovinato
  }
  if (!Array.isArray(parsed)) throw notebookError('unreadable');
  return { reports: parsed.filter(isValidReport).map(normalizeReport), bytes: raw ? utf8Length(raw) : 0 };
}

async function readReports() {
  return (await readStored()).reports;
}

/** Voci del taccuino per l'interfaccia (elenco vuoto se non leggibili). */
export async function loadReports() {
  try {
    return await readReports();
  } catch {
    return [];
  }
}

/**
 * Voci del taccuino con lo stato del salvataggio, per la schermata del taccuino:
 * `problem` 'unreadable' se l'elenco salvato non si legge (le voci non sono cancellate, ma non
 * se ne possono aggiungere); `fill` frazione dello spazio usato (0 dove non c'è limite).
 * @returns {Promise<{entries: Report[], problem: null|'unreadable', fill: number}>}
 */
export async function loadNotebook() {
  try {
    const { reports, bytes } = await readStored();
    return { entries: reports, problem: null, fill: hasSizeLimit() ? bytes / NOTEBOOK_MAX_BYTES : 0 };
  } catch {
    return { entries: [], problem: 'unreadable', fill: 0 };
  }
}

async function writeReports(reports, { limit = false } = {}) {
  const text = JSON.stringify(reports);
  if (limit && hasSizeLimit() && utf8Length(text) > NOTEBOOK_MAX_BYTES) throw notebookError('full');
  await AsyncStorage.setItem(STORAGE_KEY, text);
  return reports;
}

// Le modifiche (aggiunta, invio, eliminazione) leggono e riscrivono tutto l'elenco: vanno
// eseguite una alla volta, altrimenti due modifiche ravvicinate si cancellerebbero a vicenda.
// Se l'elenco salvato non si legge, la modifica fallisce invece di sovrascriverlo con uno vuoto.
// Il limite di spazio vale solo per le voci nuove: eliminare e annotare un invio restano
// sempre possibili (un invio aggiunge poche decine di byte, coperte dal margine).
let queue = Promise.resolve();
function updateReports(change, options) {
  const run = queue.then(async () => writeReports(await change(await readReports()), options));
  queue = run.catch(() => {});
  return run;
}

export function newReportId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function photoDir() {
  const dir = new Directory(Paths.document, PHOTO_DIR_NAME);
  if (!dir.exists) dir.create({ idempotent: true });
  return dir;
}

/** Copia le foto scattate o scelte (file temporanei) nella cartella dell'app. */
export async function persistPhotos(reportId, uris) {
  const dir = photoDir();
  const saved = [];
  for (let i = 0; i < uris.length; i += 1) {
    const dest = new File(dir, `${reportId}-${i + 1}.jpg`);
    if (dest.exists) dest.delete();
    await new File(uris[i]).copy(dest);
    saved.push(dest.uri);
  }
  return saved;
}

/** Aggiunge una voce; errore con code 'full' o 'unreadable' se non si può salvare. */
export function addReport(report) {
  return updateReports((reports) => [report, ...reports], { limit: true });
}

/**
 * Annota un invio. `confirmed`: il sistema ha confermato che l'email è partita (o che la
 * condivisione è stata completata); altrimenti si sa solo che l'app di posta o il foglio di
 * condivisione sono stati aperti.
 */
export function markSent(reportId, channel, confirmed = false) {
  const at = new Date().toISOString();
  return updateReports((reports) =>
    reports.map((r) => (r.id === reportId ? { ...r, sent: [...r.sent, { channel, at, confirmed }] } : r)),
  );
}

export function deleteReport(reportId) {
  return updateReports((reports) => {
    const report = reports.find((r) => r.id === reportId);
    for (const uri of report?.photos ?? []) {
      try {
        const f = new File(uri);
        if (f.exists) f.delete();
      } catch {
        // file già rimosso: niente da fare
      }
    }
    return reports.filter((r) => r.id !== reportId);
  });
}
