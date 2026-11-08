// Indirizzi presi dai dati (scaricati dal sito del progetto o pubblicati su GBIF da chiunque):
// prima di aprirli o caricarli si controlla che siano davvero quello che l'app si aspetta.

// Indirizzo web semplice: http(s), nome di sito con almeno un punto, niente spazi (né a capo),
// niente credenziali ("utente@sito"); i caratteri di controllo sono esclusi a parte.
const WEB_URL = /^https?:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+(:\d{1,5})?(\/\S*)?$/i;

function hasControlChars(text) {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Indirizzo esterno sicuro da aprire, oppure null. Linking.openURL aprirebbe qualunque schema
 * (tel:, sms:, intent:, collegamenti ad altre app), non solo pagine web.
 */
export function safeWebUrl(url) {
  if (typeof url !== 'string' || url.length > 2048 || !WEB_URL.test(url) || hasControlChars(url)) return null;
  return url;
}

// Siti da cui l'app carica immagini, gli stessi elencati nell'informativa sulla privacy
// (site/privacy.html, "Servizi esterni usati dall'app"): chi li gestisce riceve l'indirizzo IP
// del telefono. Un'immagine da un altro sito non viene caricata, anche se i dati scaricati
// la indicano.
const IMAGE_HOSTS = new Set([
  'inaturalist-open-data.s3.amazonaws.com', // foto delle specie (iNaturalist, CC0 / CC BY)
  'www.specieinvasive.isprambiente.it', // mappe di distribuzione delle schede ISPRA
  'specieinvasive.isprambiente.it',
]);

/** Indirizzo di un'immagine da caricare (solo https e solo dai siti noti), oppure null. */
export function safeImageUrl(url) {
  const safe = safeWebUrl(url);
  const host = safe && /^https:\/\/([^/:]+)(?::443)?(?:\/|$)/i.exec(safe)?.[1]?.toLowerCase();
  return host && IMAGE_HOSTS.has(host) ? safe : null;
}
