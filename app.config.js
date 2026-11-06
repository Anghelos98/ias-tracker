// Configurazione dinamica: aggiunge ad app.json la chiave Google Maps per Android, letta da
// una variabile d'ambiente perché non deve stare nel repository pubblico.
//
// - In locale: GOOGLE_MAPS_ANDROID_API_KEY=... npx expo run:android
// - Con EAS: variabile d'ambiente del progetto su expo.dev, visibilità "Sensitive", ambienti
//   "preview" e "production" (selezionati da "environment" in eas.json).
// La chiave finisce comunque dentro l'app installata: va protetta limitandola, nella console
// Google Cloud, al pacchetto io.github.anghelos98.iastracker e all'impronta SHA-1 del certificato.
// Senza chiave l'app funziona su iOS (Apple Maps) e in Expo Go; nelle build Android la mappa
// resterebbe grigia, per questo il comando di build avvisa.

const KEY = process.env.GOOGLE_MAPS_ANDROID_API_KEY;

module.exports = ({ config }) => {
  if (!KEY) {
    if (process.env.EAS_BUILD_PLATFORM === 'android') {
      console.warn('Attenzione: GOOGLE_MAPS_ANDROID_API_KEY non impostata, la mappa Android non funzionerà.');
    }
    return config;
  }
  return {
    ...config,
    plugins: [...(config.plugins ?? []), ['react-native-maps', { androidGoogleMapsApiKey: KEY }]],
  };
};
