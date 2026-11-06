// A chi segnalare, regione per regione.
//
// Fonte principale: nota del Ministero dell'Ambiente e della Sicurezza Energetica, Direzione
// generale Tutela della biodiversità e del mare, prot. 0149728 del 9 agosto 2024, "Uffici
// responsabili per le specie esotiche invasive – Regioni e Province Autonome" (pubblicata da
// ISPRA). Gli indirizzi sono riportati come nel documento: sono caselle PEC.
// Dove la Regione pubblica un recapito o una pagina dedicata, verificati sul sito ufficiale il
// 6 novembre 2026, sono indicati a parte. Nessun recapito è scritto a memoria.

export const CONTACTS_SOURCE = {
  label: 'Ministero dell’Ambiente, nota prot. 0149728 del 9 agosto 2024',
  url: 'https://specieinvasive.isprambiente.it/images/rendicontazione_2025/MASEREGISTRO_UFFICIALE20240149728.pdf',
  checkedOn: '2026-11-06',
};

export const PEC_NOTE =
  'È una casella di posta certificata (PEC): alcune accettano solo messaggi inviati da un’altra PEC. ' +
  'Se l’email torna indietro, usa la pagina della Regione o scrivi al Ministero.';

/**
 * Uffici per codice ISTAT della regione. Il Trentino-Alto Adige ha due uffici, uno per
 * Provincia autonoma.
 * @type {Object<number, {name: string, pec: string, email?: string, emailLabel?: string, page?: {label: string, url: string}}[]>}
 */
export const REGIONAL_OFFICES = {
  1: [
    {
      name: 'Regione Piemonte',
      pec: 'territorio-ambiente@cert.regione.piemonte.it',
      email: 'specie.invasive@regione.piemonte.it',
      emailLabel: 'Settore Biodiversità e aree naturali',
      page: {
        label: 'Specie vegetali esotiche invasive',
        url: 'https://www.regione.piemonte.it/web/temi/ambiente-territorio/biodiversita-aree-naturali/salvaguardia-ambientale/specie-vegetali-esotiche-invasive',
      },
    },
  ],
  2: [{ name: 'Regione Valle d’Aosta', pec: 'territorio_ambiente@pec.regione.vda.it' }],
  3: [
    {
      name: 'Regione Lombardia',
      pec: 'ambiente_clima@pec.regione.lombardia.it',
      page: {
        label: 'Specie aliene invasive (IAS)',
        url: 'https://www.regione.lombardia.it/ambiente-e-territorio/biodiversita/quadro-normativo-delle-specie-aliene-invasive-ias',
      },
    },
  ],
  4: [
    { name: 'Provincia autonoma di Trento', pec: 'serv.aappss@pec.provincia.tn.it' },
    { name: 'Provincia autonoma di Bolzano', pec: 'naturraum.naturaterritorio@pec.prov.bz.it' },
  ],
  5: [
    {
      name: 'Regione Veneto',
      pec: 'turismo@pec.regione.veneto.it',
      page: {
        label: 'Segnalazioni e riferimenti',
        url: 'https://www.regione.veneto.it/web/agricoltura-e-foreste/segnalazioni-e-riferimenti',
      },
    },
  ],
  6: [
    {
      name: 'Regione Friuli-Venezia Giulia',
      pec: 'biodiversita@certregione.fvg.it',
      page: {
        label: 'Specie esotiche invasive',
        url: 'https://www.regione.fvg.it/rafvg/cms/RAFVG/ambiente-territorio/tutela-ambiente-gestione-risorse-naturali/FOGLIA01/',
      },
    },
  ],
  7: [{ name: 'Regione Liguria', pec: 'protocollo@pec.regione.liguria.it' }],
  8: [{ name: 'Regione Emilia-Romagna', pec: 'segrprn@postacert.regione.emilia-romagna.it' }],
  9: [{ name: 'Regione Toscana', pec: 'regionetoscana@postacert.toscana.it' }],
  10: [{ name: 'Regione Umbria', pec: 'direzioneagricoltura.regione@postacert.umbria.it' }],
  11: [{ name: 'Regione Marche', pec: 'regione.marche.biodiversita@emarche.it' }],
  12: [
    {
      name: 'Regione Lazio',
      pec: 'direzioneambiente@regione.lazio.legalmail.it',
      page: {
        label: 'Specie esotiche invasive',
        url: 'https://regione.lazio.it/cittadini/tutela-ambientale-difesa-suolo/parchi-rete-natura-2000/specie-esotiche-invasive',
      },
    },
  ],
  13: [{ name: 'Regione Abruzzo', pec: 'dpd021@pec.regione.abruzzo.it' }],
  14: [{ name: 'Regione Molise', pec: 'regionemolise@cert.regione.molise.it' }],
  15: [{ name: 'Regione Campania', pec: 'uod.500607@pec.regione.campania.it' }],
  16: [{ name: 'Regione Puglia', pec: 'ufficioparchi.regione@pec.rupar.puglia.it' }],
  17: [{ name: 'Regione Basilicata', pec: 'ufficio.tutela.natura@cert.regione.basilicata.it' }],
  18: [{ name: 'Regione Calabria', pec: 'parchi.ambienteterritorio@pec.regione.calabria.it' }],
  19: [{ name: 'Regione Siciliana', pec: 'dipartimento.ambiente@certmail.regione.sicilia.it' }],
  20: [{ name: 'Regione Sardegna', pec: 'difesa.ambiente@pec.regione.sardegna.it' }],
};

/** Indirizzo a cui scrivere: la casella dedicata se c'è, altrimenti la PEC indicata dal Ministero. */
export function officeAddress(office) {
  return office.email ?? office.pec;
}

/** Il punto [lon, lat] è dentro l'anello? (ray casting) */
function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Codice ISTAT della regione che contiene il punto, o null (mare, estero).
 * @param {{regioni: {codice: number, poligoni: number[][][]}[]}} shapes  assets/data/region_shapes.json
 * @param {{code: number, bbox: number[]}[]} regions  riquadri per scartare subito le regioni lontane
 */
export function locateRegion(latitude, longitude, shapes, regions) {
  const bboxes = new Map(regions.map((r) => [r.code, r.bbox]));
  for (const r of shapes.regioni) {
    const b = bboxes.get(r.codice);
    if (b && (longitude < b[0] || longitude > b[2] || latitude < b[1] || latitude > b[3])) continue;
    if (r.poligoni.some((ring) => inRing(longitude, latitude, ring))) return r.codice;
  }
  return null;
}
