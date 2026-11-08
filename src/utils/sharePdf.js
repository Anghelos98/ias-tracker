import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { A4 } from '../reports/regionReportHtml';

/**
 * Converte una pagina HTML in PDF (formato A4) e apre il foglio di condivisione di sistema.
 * expo-print salva il PDF nella cache con un nome casuale: lo si copia con un nome leggibile.
 */
export async function sharePdf(fileName, html) {
  const { uri } = await Print.printToFileAsync({ html, width: A4.width, height: A4.height });
  let shareUri = uri;
  try {
    const named = new File(Paths.cache, fileName);
    if (named.exists) named.delete();
    new File(uri).copy(named);
    shareUri = named.uri;
    new File(uri).delete(); // la copia con il nome leggibile basta (la si elimina al prossimo avvio)
  } catch {
    // si condivide il file con il nome assegnato da expo-print
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('Condivisione non disponibile');
  await Sharing.shareAsync(shareUri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: fileName });
}
