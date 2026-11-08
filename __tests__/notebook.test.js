import { reportBody, reportSubject } from '../src/reports/format';
import {
  entryKind,
  entryTitle,
  filterEntries,
  formatNotebook,
  notebookFileName,
  notebookRows,
  sendStatus,
} from '../src/reports/notebook';

const base = {
  id: 'a',
  createdAt: '2026-11-06T10:00:00.000Z',
  speciesSlug: 'ailanthus-altissima',
  scientificName: 'Ailanthus altissima',
  commonName: 'Ailanto',
  latitude: 41.9,
  longitude: 12.5,
  accuracy: 8.4,
  locationSource: 'gps',
  note: ' vicino al fosso, "lato nord" ',
  photos: ['file:///a.jpg'],
  sent: [{ channel: 'email', at: '2026-11-06T10:01:00.000Z' }],
};
const old = { ...base, id: 'old' }; // voce salvata prima del taccuino: senza `kind`
const cut = { ...base, id: 'b', kind: 'intervento', intervention: 'taglio', sent: [], photos: [] };

test('le voci senza tipo sono presenze', () => {
  expect(entryKind(old)).toBe('presenza');
  expect(entryKind(cut)).toBe('intervento');
  expect(entryTitle(old)).toBe('Presenza');
  expect(entryTitle(cut)).toBe('Intervento: Taglio');
});

test('filtro per tipo', () => {
  expect(filterEntries([old, cut], 'tutte')).toHaveLength(2);
  expect(filterEntries([old, cut], 'presenza').map((e) => e.id)).toEqual(['old']);
  expect(filterEntries([old, cut], 'intervento').map((e) => e.id)).toEqual(['b']);
});

test('righe di esportazione', () => {
  const [p, i] = notebookRows([old, cut]);
  // invio annotato da una versione precedente (senza `confirmed`): non confermato
  expect(p).toMatchObject({
    tipo: 'presenza',
    intervento: '',
    precisione_m: 8,
    foto: 1,
    inviata: '',
    invio_non_confermato: 'email',
  });
  expect(i).toMatchObject({ tipo: 'intervento', intervento: 'Taglio', foto: 0, inviata: '', invio_non_confermato: '' });
});

test('invii confermati e non confermati', () => {
  const at = '2026-11-08T10:00:00.000Z';
  const entry = {
    ...base,
    sent: [
      { channel: 'regione', at, confirmed: false }, // app di posta aperta (Android, mailto)
      { channel: 'email', at, confirmed: false },
      { channel: 'email', at, confirmed: true }, // poi confermata da Mail (iOS)
      { channel: 'condivisione', at }, // versione precedente
    ],
  };
  expect(sendStatus(entry)).toEqual({ confirmed: ['email'], unconfirmed: ['regione', 'condivisione'] });
  expect(notebookRows([entry])[0]).toMatchObject({ inviata: 'email', invio_non_confermato: 'regione condivisione' });
  expect(sendStatus({ ...base, sent: undefined })).toEqual({ confirmed: [], unconfirmed: [] });
});

test('CSV con virgolette e campi vuoti', () => {
  const lines = formatNotebook('csv', [old]).split('\n');
  expect(lines[0]).toBe(
    'data,tipo,intervento,specie,nome_comune,latitudine,longitudine,precisione_m,origine_posizione,note,rilevatore,foto,inviata,invio_non_confermato',
  );
  expect(lines[1]).toBe(
    '2026-11-06T10:00:00.000Z,presenza,,Ailanthus altissima,Ailanto,41.9,12.5,8,gps,"vicino al fosso, ""lato nord""",,1,,email',
  );
});

test('GeoJSON e KML', () => {
  const geo = JSON.parse(formatNotebook('geojson', [cut]));
  expect(geo.features[0].geometry.coordinates).toEqual([12.5, 41.9]);
  expect(geo.features[0].properties.intervento).toBe('Taglio');
  const kml = formatNotebook('kml', [cut]);
  expect(kml).toContain('<coordinates>12.5,41.9,0</coordinates>');
  expect(kml).toContain('&amp;quot;lato nord&amp;quot;'); // descrizione KML: codificata per HTML e per XML
});

test('nome del file', () => {
  expect(notebookFileName('kml', new Date('2026-11-06T12:00:00Z'))).toBe('ias-tracker_taccuino_2026-11-06.kml');
});

test('testo condiviso di un intervento', () => {
  expect(reportSubject(cut)).toBe('Intervento su specie esotica invasiva (taglio): Ailanthus altissima');
  const body = reportBody(cut);
  expect(body).toMatch(/^Intervento di gestione/);
  expect(body).toContain('Intervento: Taglio');
  expect(reportSubject(old)).toBe('Segnalazione specie esotica invasiva: Ailanthus altissima');
});
