// Testo da inserire in HTML (rapporto PDF, disegnato da expo-print con un motore web) o in XML
// (file KML). Unica funzione per tutti i formati: una copia dimenticata è un buco.

/**
 * Codifica i caratteri speciali di HTML e XML, apostrofo compreso: così il testo è sicuro sia
 * dentro un elemento sia dentro un attributo, con virgolette doppie o singole.
 */
export function escapeMarkup(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Testo semplice per l'elemento <description> di un file KML.
 *
 * Google Earth e Google My Maps leggono il contenuto della descrizione, dopo averlo decodificato
 * come XML, come HTML: con la sola codifica XML un testo come "<img src=…>" (per esempio nel nome
 * di un dataset GBIF, scelto da chi lo pubblica) tornerebbe un'immagine vera, che segnala a un
 * sito esterno l'apertura del file, o uno script nei riquadri di Google Earth Pro. Il testo viene
 * quindi codificato due volte: per l'HTML (con gli a capo come <br>) e poi per l'XML.
 */
export function kmlDescription(text) {
  return escapeMarkup(escapeMarkup(text).replace(/\r?\n/g, '<br>'));
}
