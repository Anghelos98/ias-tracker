// Difese su dati di terzi: indirizzi aperti o caricati dall'app, celle dei file CSV esportati,
// testo inserito in HTML (rapporto PDF) e XML (KML).
import { gbifUrl, originalUrl } from '../src/data/points';
import { regionReportCSV } from '../src/data/regionReport';
import { csvCell } from '../src/utils/csv';
import { safeImageUrl, safeWebUrl } from '../src/utils/url';

// remote.js (isValidNews) usa AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

test('si aprono solo pagine web: niente altri schemi, credenziali o caratteri di controllo', () => {
  expect(safeWebUrl('https://www.inaturalist.org/observations/333966041')).toBe(
    'https://www.inaturalist.org/observations/333966041',
  );
  expect(safeWebUrl('http://example.org/a?b=1#c')).toBe('http://example.org/a?b=1#c');
  for (const bad of [
    'javascript:alert(1)',
    'tel:+39000000',
    'sms:123',
    'intent://x#Intent;scheme=http;end',
    'file:///etc/passwd',
    'https://utente:password@sito.it/',
    'https://localhost/',
    'https://sito.it/a b',
    'https://sito.it/a\u0000b',
    `https://sito.it/${'a'.repeat(3000)}`,
    null,
    42,
  ]) {
    expect(safeWebUrl(bad)).toBeNull();
  }
  expect(originalUrl({ link: 'tel:' }, '123')).toBeNull();
  expect(originalUrl({ link: 'https://www.inaturalist.org/observations/' }, 5)).toBe(
    'https://www.inaturalist.org/observations/5',
  );
  expect(gbifUrl('1/../../altro')).toBeNull();
  expect(gbifUrl(42)).toBe('https://www.gbif.org/occurrence/42');
});

test('CSV: i testi che sembrano formule restano testo, i numeri restano numeri', () => {
  expect(csvCell('=HYPERLINK("https://x.y","clicca")')).toBe('"\'=HYPERLINK(""https://x.y"",""clicca"")"');
  expect(csvCell('+39 nota')).toBe("'+39 nota");
  expect(csvCell('-cmd')).toBe("'-cmd");
  expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  expect(csvCell('\t=1+1')).toBe("'\t=1+1");
  expect(csvCell(-3.5)).toBe('-3.5');
  expect(csvCell('-3.5')).toBe('-3.5');
  expect(csvCell('Ailanto, giardino')).toBe('"Ailanto, giardino"');
  expect(csvCell(null)).toBe('');
});

test('CSV del rapporto per regione: stessa protezione dalle formule delle altre esportazioni', () => {
  const report = {
    species: [
      {
        species: { scientificName: '=HYPERLINK("https://x.y")', commonName: '@nome' },
        count: 2,
        firstYear: '=1+1',
        lastYear: 2025,
      },
    ],
  };
  expect(regionReportCSV(report, 'Lazio').split('\n')[1]).toBe(
    'Lazio,"\'=HYPERLINK(""https://x.y"")",\'@nome,2,\'=1+1,2025',
  );
});

test("immagini: solo https e solo dai siti indicati nell'informativa sulla privacy", () => {
  for (const ok of [
    'https://inaturalist-open-data.s3.amazonaws.com/photos/1/medium.jpg',
    'https://www.specieinvasive.isprambiente.it/images/mappa.png',
    'https://specieinvasive.isprambiente.it/images/mappa.png',
  ]) {
    expect(safeImageUrl(ok)).toBe(ok);
  }
  for (const bad of [
    'http://inaturalist-open-data.s3.amazonaws.com/photos/1/medium.jpg', // non cifrato
    'https://altro-bucket.s3.amazonaws.com/x.jpg', // un altro archivio su Amazon
    'https://inaturalist-open-data.s3.amazonaws.com.sito.it/x.jpg',
    'https://sito.it/inaturalist-open-data.s3.amazonaws.com/x.jpg',
    'https://utente@inaturalist-open-data.s3.amazonaws.com/x.jpg',
    'file:///var/mobile/foto.jpg',
    'data:image/png;base64,AAAA',
    undefined,
  ]) {
    expect(safeImageUrl(bad)).toBeNull();
  }
});

test('HTML e XML: caratteri speciali codificati, apostrofo compreso', () => {
  const { escapeMarkup } = require('../src/utils/markup');
  expect(escapeMarkup(`<img src=x onerror='alert(1)'> & "ciao"`)).toBe(
    '&lt;img src=x onerror=&#39;alert(1)&#39;&gt; &amp; &quot;ciao&quot;',
  );
  expect(escapeMarkup(null)).toBe('');
  expect(escapeMarkup(42)).toBe('42');
  // stessa funzione nei file KML del taccuino: una nota non può aprire o chiudere elementi
  const { formatNotebook } = require('../src/reports/notebook');
  const kml = formatNotebook('kml', [
    {
      id: 'a',
      createdAt: '2026-11-08T10:00:00.000Z',
      scientificName: 'Ailanthus altissima',
      commonName: 'Ailanto',
      latitude: 41.9,
      longitude: 12.5,
      note: "dell'argine</description><name>falso</name>",
      photos: [],
      sent: [],
    },
  ]);
  expect(kml).toContain(
    'Note: dell&amp;#39;argine&amp;lt;/description&amp;gt;&amp;lt;name&amp;gt;falso&amp;lt;/name&amp;gt;',
  );
  expect(kml.match(/<name>/g)).toHaveLength(2); // documento e segnaposto, nient'altro
});

/** Testo di un elemento XML come lo legge un programma (entità decodificate una volta). */
const xmlText = (xml, tag) =>
  [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) =>
    m[1]
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&'),
  );

test('KML: la descrizione, che Google Earth legge come HTML, non contiene HTML preso dai dati', () => {
  const { toKML } = require('../src/data/exportData');
  const kml = toKML([
    {
      specie: 'Ailanthus altissima',
      nome_comune: 'Ailanto',
      latitudine: 41.9,
      longitudine: 12.5,
      anno: 2024,
      data: null,
      incertezza_m: null,
      // nome del dataset e link scelti da chi pubblica su GBIF
      fonte: '<img src="https://traccia.example/x.gif">Dataset',
      licenza: 'CC0',
      identificazione_automatica: false,
      dato_originale: null,
      gbif: 'https://www.gbif.org/occurrence/1',
    },
  ]);
  const html = xmlText(kml, 'description');
  expect(html).toHaveLength(2); // documento e segnaposto
  for (const text of html) {
    // dopo la decodifica XML resta solo HTML innocuo: a capo e testo codificato
    expect(text.replace(/<br>/g, '')).not.toMatch(/</);
  }
  expect(html[1]).toContain('&lt;img src=&quot;https://traccia.example/x.gif&quot;&gt;Dataset');
  expect(html[1]).toContain('Anno: 2024<br>Fonte:');
});

test('link presi dai dati: solo https e solo verso il sito atteso', () => {
  const { LINK_SITES, safeLinkUrl, siteName } = require('../src/utils/url');
  const pdf = 'https://www.specieinvasive.isprambiente.it/images/schede-specie/Ailanthus.pdf';
  expect(safeLinkUrl(pdf, LINK_SITES.ispra)).toBe(pdf);
  for (const bad of [
    'https://sito-falso.it/images/schede-specie/Ailanthus.pdf', // stesso percorso, altro sito
    'https://www.specieinvasive.isprambiente.it.sito-falso.it/x.pdf',
    'https://falsoisprambiente.it/x.pdf',
    'http://www.specieinvasive.isprambiente.it/x.pdf', // non cifrato
    'javascript:alert(1)',
    null,
  ]) {
    expect(safeLinkUrl(bad, LINK_SITES.ispra)).toBeNull();
  }
  expect(
    safeLinkUrl('https://easin.jrc.ec.europa.eu/spexplorer/species/factsheet/R1', LINK_SITES.easin),
  ).not.toBeNull();
  expect(safeLinkUrl('https://www.inaturalist.org/photos/1', LINK_SITES.easin)).toBeNull();
  expect(safeLinkUrl('https://www.inaturalist.org/photos/1', LINK_SITES.inaturalist)).not.toBeNull();
  expect(safeLinkUrl('https://fakeinaturalist.org/photos/1', LINK_SITES.inaturalist)).toBeNull();

  // "Vedi su …": il nome mostrato è quello vero del sito
  expect(siteName('https://www.inaturalist.org/observations/1')).toBe('iNaturalist');
  expect(siteName('https://fakeinaturalist.org/observations/1')).toBe('fakeinaturalist.org');
  expect(siteName('https://identify.plantnet.org/k-world/observations/7')).toBe('Pl@ntNet');

  // pagina del dato originale: prima parte dai dati GBIF (campo "references" dell'editore)
  expect(originalUrl({ link: 'https://sito-falso.it/osservazioni/' }, 5)).toBeNull();
  expect(originalUrl({ link: 'http://www.inaturalist.org/observations/' }, 5)).toBeNull();
  expect(originalUrl({ link: 'https://www.inaturalist.org/observations/' }, '5/../../x')).toBeNull();
  expect(originalUrl({ link: 'https://identify.plantnet.org/k-world/observations/' }, 7)).toBe(
    'https://identify.plantnet.org/k-world/observations/7',
  );
});

test('date dei dati: valide e non nel futuro', () => {
  const { isPlausibleIsoDate } = require('../src/data/news');
  const now = Date.parse('2026-11-08T12:00:00Z');
  expect(isPlausibleIsoDate('2026-11-02T04:12:00+00:00', now)).toBe(true);
  expect(isPlausibleIsoDate('2026-11-09T04:00:00Z', now)).toBe(true); // orologio un po' indietro
  for (const bad of [
    '9999-12-31T00:00:00Z',
    '2027-01-01T00:00:00Z',
    '2026-11-02',
    'ieri',
    `2026-11-02T${'0'.repeat(50)}`,
    42,
  ]) {
    expect(isPlausibleIsoDate(bad, now)).toBe(false);
  }
  const { isValidNews } = require('../src/data/remote');
  expect(isValidNews({ settimane: [{ dati_al: '9999-12-31T00:00:00Z', specie: {} }] })).toBe(false);
  expect(isValidNews({ settimane: [{ dati_al: '2026-11-02T04:00:00Z', specie: { a: { nuove: -3 } } }] })).toBe(false);
  expect(
    isValidNews({
      settimane: [
        { dati_al: '2026-11-02T04:00:00Z', specie: { a: { nuove: 3, regioni: { 9: 3 }, prime_regioni: [9] } } },
      ],
    }),
  ).toBe(true);
});
