import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

// Le segnalazioni restano solo sul telefono: elenco in AsyncStorage, foto copiate nella
// cartella documenti dell'app (non viene cancellata dal sistema).

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
 * @property {{channel: 'email'|'regione'|'condivisione', at: string}[]} sent
 */

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

/** Legge l'elenco salvato; lancia un errore se non è leggibile (per non sovrascriverlo). */
async function readReports() {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('Taccuino non leggibile');
  return parsed.filter(isValidReport).map(normalizeReport);
}

/** Voci del taccuino per l'interfaccia (elenco vuoto se non leggibili). */
export async function loadReports() {
  try {
    return await readReports();
  } catch {
    return [];
  }
}

async function writeReports(reports) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  return reports;
}

// Le modifiche (aggiunta, invio, eliminazione) leggono e riscrivono tutto l'elenco: vanno
// eseguite una alla volta, altrimenti due modifiche ravvicinate si cancellerebbero a vicenda.
// Se l'elenco salvato non si legge, la modifica fallisce invece di sovrascriverlo con uno vuoto.
let queue = Promise.resolve();
function updateReports(change) {
  const run = queue.then(async () => writeReports(await change(await readReports())));
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

export function addReport(report) {
  return updateReports((reports) => [report, ...reports]);
}

export function markSent(reportId, channel) {
  const at = new Date().toISOString();
  return updateReports((reports) =>
    reports.map((r) => (r.id === reportId ? { ...r, sent: [...r.sent, { channel, at }] } : r)),
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
