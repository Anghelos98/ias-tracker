// Configurazione dinamica: aggiunge ad app.json i dati che non devono stare nel repository
// pubblico, letti da variabili d'ambiente.
//
// Account Expo e progetto EAS: EXPO_OWNER ed EAS_PROJECT_ID nel file .env.local (escluso da git
// con .gitignore, ma incluso negli invii a EAS grazie a .easignore). Senza questi valori l'app
// funziona lo stesso in Expo Go; servono solo per le build EAS.
//
// Chiave Google Maps per Android: GOOGLE_MAPS_ANDROID_API_KEY.
// - In locale: GOOGLE_MAPS_ANDROID_API_KEY=... npx expo run:android
// - Con EAS: variabile d'ambiente del progetto su expo.dev, visibilità "Sensitive", ambienti
//   "preview" e "production" (selezionati da "environment" in eas.json).
// La chiave finisce comunque dentro l'app installata: va protetta limitandola, nella console
// Google Cloud, al pacchetto io.github.anghelos98.iastracker e all'impronta SHA-1 del certificato.
// Senza chiave l'app funziona su iOS (Apple Maps) e in Expo Go; nelle build Android si chiude
// appena apre la mappa ("API key not found"), per questo il comando di build avvisa.

const KEY = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
const OWNER = process.env.EXPO_OWNER;
const PROJECT_ID = process.env.EAS_PROJECT_ID;

module.exports = ({ config }) => {
  const result = { ...config };
  if (OWNER) result.owner = OWNER;
  if (PROJECT_ID) result.extra = { ...config.extra, eas: { ...config.extra?.eas, projectId: PROJECT_ID } };
  if (KEY) {
    result.plugins = [...(config.plugins ?? []), ['react-native-maps', { androidGoogleMapsApiKey: KEY }]];
  } else if (process.env.EAS_BUILD_PLATFORM === 'android') {
    console.warn("Attenzione: GOOGLE_MAPS_ANDROID_API_KEY non impostata, l'app Android si chiuderà all'apertura della mappa.");
  }
  return result;
};
