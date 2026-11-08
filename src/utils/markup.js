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
