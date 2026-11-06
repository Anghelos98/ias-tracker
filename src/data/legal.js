// Sintesi della normativa italiana sulle specie esotiche invasive di rilevanza unionale.
// Fonte: D.Lgs. 15 dicembre 2017, n. 230 (testo vigente su Normattiva, consultato il
// 6 novembre 2026) e pagina del Ministero dell'Ambiente (MASE) aggiornata al 22.06.2026.
// È una sintesi divulgativa: fa fede il testo di legge.

export const LEGAL_SOURCES = [
  {
    label: 'D.Lgs. 230/2017 (Normattiva)',
    url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2017-12-15;230',
  },
  {
    label: 'Ministero dell’Ambiente – Specie esotiche invasive',
    url: 'https://www.mase.gov.it/portale/specie-esotiche-invasive',
  },
];

export const REPORT_EMAIL = 'esoticheinvasive@mase.gov.it';

// Art. 6, comma 1: gli esemplari non possono essere…
export const PROHIBITIONS = [
  'introdotti o fatti transitare nel territorio nazionale',
  'detenuti, anche in confinamento',
  'allevati o coltivati, anche in confinamento',
  'trasportati o fatti trasportare',
  'venduti o immessi sul mercato',
  'utilizzati, ceduti gratuitamente o scambiati',
  'messi in condizione di riprodursi o crescere spontaneamente',
  'rilasciati nell’ambiente',
];
export const PROHIBITIONS_NOTE =
  'Sono esclusi i casi autorizzati e la detenzione o il trasporto nell’ambito delle misure ' +
  'di gestione o eradicazione previste dal decreto (art. 6).';

// Art. 25
export const PENALTIES = [
  {
    what: 'Coltivare, vendere o rilasciare nell’ambiente',
    penalty: 'arresto fino a 3 anni o ammenda da 10.000 a 150.000 €',
    ref: 'art. 25, c. 1, lett. a',
  },
  {
    what: 'Introdurre, detenere, trasportare, utilizzare, cedere o scambiare, lasciar riprodurre',
    penalty: 'sanzione amministrativa da 1.000 a 50.000 €',
    ref: 'art. 25, c. 4, lett. a',
  },
  {
    what: 'Non denunciare il possesso di esemplari',
    penalty: 'sanzione amministrativa da 150 a 20.000 €',
    ref: 'art. 25, c. 4, lett. d',
  },
];
export const CONFISCATION_NOTE = 'È sempre disposta la confisca degli esemplari (art. 25, c. 6).';

// Art. 26: chi detiene esemplari deve farne denuncia al Ministero entro 180 giorni dalla
// pubblicazione dell'aggiornamento dell'elenco. Termini come indicati dal MASE: per le specie
// del Reg. 2025/1422 il 13 gennaio 2026; per gli elenchi precedenti "già scaduti".
export const POSSESSION_DEADLINES = { '2025/1422': '2026-01-13' };

export const WHAT_TO_DO = [
  'Non raccogliere, trapiantare o spostare la pianta: anche il trasporto è vietato, e frammenti di radici, fusti o semi possono originare nuove piante.',
  'Annota il luogo (o usa la posizione del telefono) e scatta qualche foto della pianta e dei suoi dettagli.',
  `Segnala il ritrovamento al Ministero dell’Ambiente (${REPORT_EMAIL}) o alla tua Regione, oppure registralo su iNaturalist: le osservazioni verificate confluiscono in GBIF e quindi anche in IAS Tracker.`,
  'Se hai la pianta in giardino, in vaso o in acquario, informati presso il Ministero o la Regione su come comportarti: detenerla e coltivarla è vietato.',
];

/** "2026-01-13" -> "13 gennaio 2026" */
export function formatDateIt(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
