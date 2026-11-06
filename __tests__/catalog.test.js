import { formatDateIt, POSSESSION_DEADLINES } from '../src/data/legal';
import { SPECIES } from '../src/data/species';
import reference from '../ias_reference.json';

describe('catalogo delle specie', () => {
  test('contiene tutte le specie di rilevanza unionale, una volta sola', () => {
    expect(SPECIES).toHaveLength(reference.rilevanza_unionale.length);
    expect(new Set(SPECIES.map((s) => s.slug)).size).toBe(SPECIES.length);
    expect(new Set(SPECIES.map((s) => s.scientificName))).toEqual(new Set(reference.rilevanza_unionale));
  });

  test('ogni specie ha nome comune, regolamento di inserimento e scheda', () => {
    for (const s of SPECIES) {
      expect(s.commonName).toBeTruthy();
      expect(s.listing.regulation).toMatch(/^20\d\d\/\d+$/);
      expect(s.listing.inForce).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof s.sheet).toBe('function');
    }
  });

  test('le specie con segnalazioni hanno dati e area', () => {
    for (const s of SPECIES.filter((x) => x.total > 0)) {
      expect(typeof s.load).toBe('function');
      expect(s.bbox).toHaveLength(4);
    }
  });
});

describe('normativa', () => {
  test('date in italiano', () => {
    expect(formatDateIt('2026-01-13')).toBe('13 gennaio 2026');
    expect(formatDateIt(POSSESSION_DEADLINES['2025/1422'])).toBe('13 gennaio 2026');
  });
});
