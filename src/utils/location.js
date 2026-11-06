import * as Location from 'expo-location';

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
