import { REGIONAL_OFFICES, locateRegion, officeAddress } from '../src/data/contacts';
import { REGIONS } from '../src/data/regions';

const SHAPES = require('../assets/data/region_shapes.json');

test('ogni regione ha almeno un ufficio con un indirizzo valido', () => {
  for (const r of REGIONS) {
    const offices = REGIONAL_OFFICES[r.code];
    expect(offices?.length).toBeGreaterThan(0);
    for (const o of offices) {
      expect(o.pec).toMatch(/^[\w.-]+@[\w.-]+\.it$/);
      expect(officeAddress(o)).toMatch(/@/);
    }
  }
  expect(REGIONAL_OFFICES[4].map((o) => o.name)).toEqual([
    'Provincia autonoma di Trento',
    'Provincia autonoma di Bolzano',
  ]);
  expect(officeAddress(REGIONAL_OFFICES[1][0])).toBe('specie.invasive@regione.piemonte.it');
});

test('regione dalla posizione', () => {
  const at = (lat, lon) => locateRegion(lat, lon, SHAPES, REGIONS);
  expect(at(41.9028, 12.4964)).toBe(12); // Roma
  expect(at(45.4642, 9.19)).toBe(3); // Milano
  expect(at(46.0748, 11.1217)).toBe(4); // Trento
  expect(at(38.1157, 13.3615)).toBe(19); // Palermo
  expect(at(39.2238, 9.1217)).toBe(20); // Cagliari
  expect(at(45.0703, 7.6869)).toBe(1); // Torino
  expect(at(40.8518, 14.2681)).toBe(15); // Napoli
  expect(at(43.7696, 11.2558)).toBe(9); // Firenze
  expect(at(42.0, 10.0)).toBeNull(); // mar Tirreno
  expect(at(48.8566, 2.3522)).toBeNull(); // Parigi
});
