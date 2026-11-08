// Difese su dati di terzi: indirizzi aperti o caricati dall'app, celle dei file CSV esportati,
// testo inserito in HTML (rapporto PDF) e XML (KML).
import { gbifUrl, originalUrl } from '../src/data/points';
import { regionReportCSV } from '../src/data/regionReport';
import { csvCell } from '../src/utils/csv';
import { safeImageUrl, safeWebUrl } from '../src/utils/url';

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
  expect(kml).toContain('Note: dell&#39;argine&lt;/description&gt;&lt;name&gt;falso&lt;/name&gt;');
  expect(kml.match(/<name>/g)).toHaveLength(2); // documento e segnaposto, nient'altro
});
