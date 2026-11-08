import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** Inizio del nome di ogni file esportato dall'app (CSV, GeoJSON, KML, PDF). */
const EXPORT_PREFIX = 'ias-tracker_';

/**
 * Scrive un file di testo nella cache dell'app e apre il foglio di condivisione di sistema
 * (salva in File, invia per email, apri in un'altra app…).
 */
export async function shareTextFile(fileName, content, { mimeType, uti }) {
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  await file.write(content);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Condivisione non disponibile');
  await Sharing.shareAsync(file.uri, { mimeType, UTI: uti, dialogTitle: fileName });
}

/**
 * Elimina dalla cache i file esportati in precedenza. Il taccuino esportato contiene coordinate,
 * note e firma: dopo la condivisione la copia nella cache non serve più, ma non si può cancellare
 * subito (su Android l'app che la riceve può leggerla anche dopo). Si cancella al successivo avvio
 * dell'app, quando la condivisione è certamente conclusa.
 */
export function clearOldExports() {
  try {
    for (const entry of new Directory(Paths.cache).list()) {
      if (entry instanceof File && entry.name.startsWith(EXPORT_PREFIX)) entry.delete();
    }
  } catch {
    // cartella non leggibile: il sistema svuota comunque la cache quando serve spazio
  }
}
