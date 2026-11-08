import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

// Foto delle segnalazioni senza metadati.
//
// Le foto scattate o scelte dalla galleria contengono metadati EXIF: posizione, data, marca e
// modello del telefono, a volte un numero che identifica la foto o il nome del proprietario.
// expo-image-picker li copia nel file che restituisce (su Android sempre, anche comprimendo), e
// le foto vanno poi allegate alle email per il Ministero o la Regione e condivise con altre app.
// La posizione della foto si legge prima (gpsFromExif, dai dati restituiti dal selettore); poi la
// foto viene ridisegnata e salvata come JPEG nuovo, che contiene solo i pixel.

/** Lato massimo in pixel (16 megapixel in 4:3): basta per riconoscere una pianta, e una foto da
 * 50-200 megapixel decodificata per intero esaurirebbe la memoria dei telefoni meno potenti. */
const MAX_SIDE = 4096;
const JPEG_QUALITY = 0.7;

/**
 * Copia della foto senza metadati, in JPEG, nella cache dell'app. La copia temporanea restituita
 * dal selettore (con i metadati) viene eliminata.
 * @param {string} uri  file restituito da expo-image-picker
 * @returns {Promise<string>} URI della copia pulita
 */
export async function photoWithoutMetadata(uri) {
  const image = await ImageManipulator.manipulate(uri, { maxWidth: MAX_SIDE, maxHeight: MAX_SIDE }).renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
  // Solo copie temporanee nella cache dell'app: mai file di altre cartelle.
  if (typeof uri === 'string' && uri.startsWith(Paths.cache.uri)) {
    try {
      const original = new File(uri);
      if (original.exists) original.delete();
    } catch {
      // la cache viene comunque svuotata dal sistema
    }
  }
  return result.uri;
}
