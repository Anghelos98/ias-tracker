import { gpsFromExif, reportBody, reportSubject } from '../src/reports/format';

describe('gpsFromExif', () => {
  test('formato iOS', () => {
    expect(gpsFromExif({ '{GPS}': { Latitude: 41.89, LatitudeRef: 'N', Longitude: 12.49, LongitudeRef: 'E' } })).toEqual({
      latitude: 41.89,
      longitude: 12.49,
    });
  });

  test('formato Android con gradi, minuti e secondi', () => {
    const gps = gpsFromExif({
      GPSLatitude: '41/1,53/1,2472/100',
      GPSLatitudeRef: 'N',
      GPSLongitude: '12/1,29/1,3192/100',
      GPSLongitudeRef: 'E',
    });
    expect(gps.latitude).toBeCloseTo(41.8902, 4);
    expect(gps.longitude).toBeCloseTo(12.4922, 4);
  });

  test('emisferi sud e ovest', () => {
    expect(gpsFromExif({ '{GPS}': { Latitude: 33, LatitudeRef: 'S', Longitude: 70, LongitudeRef: 'W' } })).toEqual({
      latitude: -33,
      longitude: -70,
    });
  });

  test('nessuna posizione', () => {
    expect(gpsFromExif(null)).toBeNull();
    expect(gpsFromExif({})).toBeNull();
    expect(gpsFromExif({ '{GPS}': { Latitude: 0, Longitude: 0 } })).toBeNull();
  });
});

describe('testo della segnalazione', () => {
  const report = {
    createdAt: '2026-11-06T09:30:00.000Z',
    commonName: 'Ailanto',
    scientificName: 'Ailanthus altissima',
    latitude: 41.890123,
    longitude: 12.492345,
    accuracy: 8.4,
    locationSource: 'gps',
    note: '  una decina di piante  ',
    photos: ['file:///a.jpg', 'file:///b.jpg'],
  };

  test('oggetto con il nome scientifico', () => {
    expect(reportSubject(report)).toBe('Segnalazione specie esotica invasiva: Ailanthus altissima');
  });

  test('contiene specie, coordinate, precisione, mappa, note e foto', () => {
    const body = reportBody(report);
    expect(body).toContain('Specie: Ailanto (Ailanthus altissima)');
    expect(body).toContain('41.890123, 12.492345 (precisione ± 8 m) – posizione GPS');
    expect(body).toContain('https://www.openstreetmap.org/?mlat=41.890123&mlon=12.492345');
    expect(body).toContain('Note: una decina di piante');
    expect(body).toContain('Foto: 2 allegate');
  });

  test('senza note né foto', () => {
    const body = reportBody({ ...report, note: '', photos: [], accuracy: null, locationSource: 'foto' });
    expect(body).not.toContain('Note:');
    expect(body).toContain('Foto: nessuna');
    expect(body).toContain('posizione ricavata dalla foto');
  });
});
