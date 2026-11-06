import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

// Le segnalazioni restano solo sul telefono: elenco in AsyncStorage, foto copiate nella
// cartella documenti dell'app (non viene cancellata dal sistema).

const STORAGE_KEY = 'ias-tracker/reports/v1';
const PHOTO_DIR_NAME = 'reports';

/**
 * @typedef {Object} Report
 * @property {string} id
 * @property {string} createdAt            data ISO
 * @property {string|null} speciesSlug     null = specie non indicata
 * @property {string} scientificName
 * @property {string} commonName
 * @property {number} latitude
 * @property {number} longitude
 * @property {number|null} accuracy        raggio di incertezza in metri
 * @property {'gps'|'foto'} locationSource
 * @property {string} note
 * @property {string[]} photos             URI dei file salvati
 * @property {{channel: 'email'|'condivisione', at: string}[]} sent
 */

export async function loadReports() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeReports(reports) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  return reports;
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

export async function addReport(report) {
  const reports = await loadReports();
  return writeReports([report, ...reports]);
}

export async function markSent(reportId, channel) {
  const reports = await loadReports();
  const at = new Date().toISOString();
  return writeReports(reports.map((r) => (r.id === reportId ? { ...r, sent: [...r.sent, { channel, at }] } : r)));
}

export async function deleteReport(reportId) {
  const reports = await loadReports();
  const report = reports.find((r) => r.id === reportId);
  for (const uri of report?.photos ?? []) {
    try {
      const f = new File(uri);
      if (f.exists) f.delete();
    } catch {
      // file già rimosso: niente da fare
    }
  }
  return writeReports(reports.filter((r) => r.id !== reportId));
}
