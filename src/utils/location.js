import * as Location from 'expo-location';
import { PermissionsAndroid, Platform } from 'react-native';

/**
 * Android 10 e successivi: senza il permesso ACCESS_MEDIA_LOCATION il sistema toglie la posizione
 * dalle foto scelte dalla galleria, e la segnalazione non può proporre quella della foto.
 * Va chiesto prima di aprire la galleria. Se l'utente rifiuta, la foto si allega lo stesso.
 * Le foto scattate dall'app con la fotocamera non ne hanno bisogno.
 * @returns {Promise<string>} esito per il registro di diagnostica
 */
export async function allowPhotoLocation() {
  if (Platform.OS !== 'android' || Platform.Version < 29) return 'non necessario';
  try {
    return await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_MEDIA_LOCATION);
  } catch {
    return 'errore';
  }
}

/** Legge la posizione GPS. Restituisce { position } oppure { error } (messaggio per l'utente). */
export async function readGpsPosition() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return { error: 'Serve il permesso di accesso alla posizione: attivalo nelle impostazioni.' };
    }
    const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return {
      position: { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy, source: 'gps' },
    };
  } catch {
    return { error: 'Posizione non disponibile. Controlla che il GPS sia attivo e riprova.' };
  }
}
