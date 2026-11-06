import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

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
