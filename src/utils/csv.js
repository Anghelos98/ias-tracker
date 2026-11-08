// Cella di un file CSV (esportazioni dei punti e del taccuino).

const NUMBER = /^[+-]?\d+(\.\d+)?$/;
// Inizi che Excel, LibreOffice e Fogli Google interpretano come formula.
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Valore pronto per una cella CSV, tra virgolette se contiene separatori o a capo.
 * CSV injection (OWASP): un testo che inizia con "=", "+", "-" o "@" (nome di una fonte GBIF,
 * nota del taccuino) verrebbe eseguito come formula da chi apre il file, per esempio un ufficio
 * regionale (=HYPERLINK verso un sito esterno, =WEBSERVICE che invia dati). Si antepone un
 * apostrofo, che i fogli di calcolo mostrano come testo. I numeri (es. longitudini negative)
 * restano numeri.
 */
export function csvCell(value) {
  if (value == null) return '';
  let text = String(value);
  if (typeof value !== 'number' && FORMULA_START.test(text) && !NUMBER.test(text)) text = `'${text}`;
  return /[",\r\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
