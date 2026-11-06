import { distanceMeters, formatDistance, speciesNearby } from '../src/data/nearby';
import { DEFAULT_FILTERS } from '../src/data/points';

const ROMA = { latitude: 41.9028, longitude: 12.4964 };

test('distanza tra due punti noti', () => {
  // Roma - Milano circa 477 km in linea d'aria
  expect(distanceMeters(ROMA, { latitude: 45.4642, longitude: 9.19 }) / 1000).toBeCloseTo(477, -1);
  expect(distanceMeters(ROMA, ROMA)).toBe(0);
});

test('formato della distanza', () => {
  expect(formatDistance(4)).toBe('10 m');
  expect(formatDistance(347)).toBe('350 m');
  expect(formatDistance(2400)).toBe('2,4 km');
  expect(formatDistance(12345)).toBe('12 km');
});

describe('speciesNearby', () => {
  const fonti = [{ nome: 'x', licenza: null }];
  const datasets = [
    {
      species: { slug: 'a' },
      data: {
        fonti,
        punti: [
          [12.5064, 41.9028, 2020, 0, 0, 10], // ~830 m a est
          [12.4964, 41.9928, 2020, 0, 0, 10], // ~10 km a nord
        ],
      },
    },
    { species: { slug: 'b' }, data: { fonti, punti: [[12.4984, 41.9028, 2019, 0, 0, null]] } }, // ~170 m
    { species: { slug: 'c' }, data: { fonti, punti: [[12.4974, 41.9028, 2019, 0, 1, null]] } }, // automatica
  ];

  test('ordina per distanza e conta entro il raggio', () => {
    const result = speciesNearby(datasets, ROMA, 5000, DEFAULT_FILTERS);
    expect(result.map((r) => r.species.slug)).toEqual(['b', 'a']);
    expect(result[1].count).toBe(1);
    expect(result[1].nearest).toBeGreaterThan(800);
    expect(result[1].nearest).toBeLessThan(900);
  });

  test('raggio più ampio e filtri', () => {
    expect(speciesNearby(datasets, ROMA, 20000, DEFAULT_FILTERS)[1].count).toBe(2);
    const withAuto = speciesNearby(datasets, ROMA, 5000, { ...DEFAULT_FILTERS, includeAutomatic: true });
    expect(withAuto.map((r) => r.species.slug)).toEqual(['c', 'b', 'a']);
    expect(speciesNearby(datasets, ROMA, 5000, { ...DEFAULT_FILTERS, minYear: 2020 })).toHaveLength(1);
  });
});
