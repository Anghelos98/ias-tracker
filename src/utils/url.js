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
 * Da usare così com'è solo per gli indirizzi scritti nel codice dell'app; per quelli presi dai
 * dati c'è safeLinkUrl, che controlla anche il sito.
 */
export function safeWebUrl(url) {
  if (typeof url !== 'string' || url.length > 2048 || !WEB_URL.test(url) || hasControlChars(url)) return null;
  return url;
}

/** Nome del sito (in minuscolo) di un indirizzo già controllato con safeWebUrl. */
function hostOf(url) {
  return /^https?:\/\/([^/:?#]+)/i.exec(url)?.[1]?.toLowerCase() ?? null;
}

/** Il sito è uno di quelli indicati o un loro sottodominio ("www.gbif.org" per "gbif.org")? */
function isHostIn(host, sites) {
  return Boolean(host) && sites.some((site) => host === site || host.endsWith(`.${site}`));
}

/**
 * Siti a cui possono portare i link presi dai dati, per tipo di link. Un link con un'etichetta
 * come "Scheda completa (PDF)" o "Vedi su iNaturalist" deve portare davvero lì: i dati arrivano
 * da siti di terzi (ISPRA, EASIN, iNaturalist, editori GBIF) attraverso la pipeline, e un
 * indirizzo diverso non viene mostrato.
 */
export const LINK_SITES = {
  ispra: ['isprambiente.it', 'isprambiente.gov.it'],
  easin: ['easin.jrc.ec.europa.eu'],
  inaturalist: ['inaturalist.org'],
  gbif: ['gbif.org'],
  // Banche dati di origine delle segnalazioni ("Vedi su …"). Una fonte nuova non in elenco resta
  // raggiungibile dalla pagina del record su GBIF.
  origin: ['inaturalist.org', 'plantnet.org', 'observation.org', 'enjoynature.net', 'gbif.org'],
};

/**
 * Link preso dai dati: pagina web cifrata (https) di uno dei siti indicati, oppure null.
 * @param {unknown} url
 * @param {string[]} sites  uno degli elenchi di LINK_SITES
 */
export function safeLinkUrl(url, sites) {
  const safe = safeWebUrl(url);
  if (!safe || !/^https:\/\//i.test(safe)) return null;
  return isHostIn(hostOf(safe), sites) ? safe : null;
}

/** Nome leggibile di una banca dati di origine nota, oppure il nome del sito. */
const ORIGIN_NAMES = [
  ['inaturalist.org', 'iNaturalist'],
  ['plantnet.org', 'Pl@ntNet'],
  ['observation.org', 'Observation.org'],
  ['enjoynature.net', 'EnjoyNature'],
  ['gbif.org', 'GBIF'],
];

/**
 * Nome da mostrare per il sito di un indirizzo ("Vedi su iNaturalist"). Il confronto è sul nome
 * esatto del sito: "fakeinaturalist.org" non diventa "iNaturalist".
 */
export function siteName(url) {
  const host = typeof url === 'string' ? hostOf(url) : null;
  if (!host) return null;
  const known = ORIGIN_NAMES.find(([site]) => isHostIn(host, [site]));
  return known ? known[1] : host.replace(/^www\./, '');
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
