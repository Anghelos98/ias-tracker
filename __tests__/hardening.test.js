// Difese su dati di terzi: indirizzi aperti o caricati dall'app.
import { gbifUrl, originalUrl } from '../src/data/points';
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
