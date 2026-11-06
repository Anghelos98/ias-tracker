import { formatDateIt, POSSESSION_DEADLINES } from '../src/data/legal';
import { SPECIES } from '../src/data/species';
import reference from '../ias_reference.json';
import photos from '../assets/data/photos.json';
import lookalikes from '../assets/data/lookalikes.json';
import easin from '../assets/data/easin.json';

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

  test('ogni specie ha foto con autore e licenza libera', () => {
    for (const s of SPECIES) {
      for (const p of photos.specie[s.slug] ?? []) {
        expect(p.autore).toBeTruthy();
        expect(['CC0', 'CC BY']).toContain(p.licenza);
        expect(p.url).toMatch(/^https:\/\//);
      }
    }
  });

  test('specie simili: citazioni ISPRA e collegamenti a specie esistenti', () => {
    const slugs = new Set(SPECIES.map((s) => s.slug));
    for (const [slug, entry] of Object.entries(lookalikes.specie)) {
      expect(slugs.has(slug)).toBe(true);
      for (const v of entry.voci ?? []) {
        expect(v.simili.length).toBeGreaterThan(0);
        expect(v.citazione.length).toBeGreaterThan(10);
      }
      for (const other of entry.correlate ?? []) expect(slugs.has(other)).toBe(true);
    }
  });

  test('dati europei EASIN per ogni specie', () => {
    for (const s of SPECIES) {
      const e = easin.specie[s.slug];
      expect(e).toBeDefined();
      expect(e.easin_id).toMatch(/^R\d+$/);
      for (const i of e.impatti) expect(['alto', 'medio', 'basso']).toContain(i.livello);
    }
  });

  test('griglie ISPRA: poligoni validi per le specie che le hanno', () => {
    const withGrid = SPECIES.filter((s) => s.grid);
    expect(withGrid.length).toBeGreaterThan(15);
    for (const s of withGrid) {
      const g = s.grid();
      expect(g.celle).toBeGreaterThan(0);
      for (const poly of g.poligoni) {
        expect(poly.esterno.length).toBeGreaterThanOrEqual(4);
        for (const [lon, lat] of poly.esterno) {
          expect(lon).toBeGreaterThan(5);
          expect(lat).toBeGreaterThan(34);
        }
      }
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
