import {
  filterFollowed,
  hasFollows,
  latestWeeks,
  newestDate,
  notificationText,
  summarize,
  toggleFollow,
  weeksSince,
} from '../src/data/news';

const NEWS = {
  settimane: [
    {
      dati_al: '2026-11-16T04:10:00+00:00',
      precedenti_al: '2026-11-09T04:10:00+00:00',
      nuove: 5,
      specie: {
        ailanto: { nuove: 4, regioni: { 9: 3, 10: 1 }, prime_regioni: [10], prima_in_italia: false },
        kudzu: { nuove: 1, regioni: { 3: 1 }, prime_regioni: [], prima_in_italia: false },
      },
    },
    {
      dati_al: '2026-11-09T04:10:00+00:00',
      precedenti_al: '2026-11-02T04:10:00+00:00',
      nuove: 3,
      specie: {
        ailanto: { nuove: 2, regioni: { 9: 2 }, prime_regioni: [], prima_in_italia: false },
        pistia: { nuove: 1, regioni: { 12: 1 }, prime_regioni: [12], prima_in_italia: true },
      },
    },
  ],
};

test('ultima settimana e aggiornamenti successivi a una data', () => {
  expect(latestWeeks(NEWS)).toHaveLength(1);
  expect(latestWeeks({ settimane: [] })).toEqual([]);
  expect(weeksSince(NEWS, null)).toHaveLength(2);
  expect(weeksSince(NEWS, '2026-11-09T04:10:00+00:00')).toHaveLength(1);
  expect(weeksSince(NEWS, '2026-11-16T04:10:00+00:00')).toHaveLength(0);
  expect(newestDate(NEWS)).toBe('2026-11-16T04:10:00+00:00');
  expect(newestDate(null)).toBeNull();
});

test('somma più aggiornamenti; prima le specie con prime segnalazioni', () => {
  const s = summarize(NEWS.settimane);
  expect(s.total).toBe(8);
  expect(s.from).toBe('2026-11-02T04:10:00+00:00');
  expect(s.to).toBe('2026-11-16T04:10:00+00:00');
  const ailanto = s.species.find((x) => x.slug === 'ailanto');
  expect(ailanto).toMatchObject({ count: 6, regions: { 9: 5, 10: 1 }, firstRegions: [10] });
  expect(s.species.map((x) => x.slug)).toEqual(['ailanto', 'pistia', 'kudzu']);
  expect(s.species.find((x) => x.slug === 'pistia').firstInItaly).toBe(true);
});

test('solo specie e regioni seguite', () => {
  const s = summarize(NEWS.settimane);
  expect(filterFollowed(s, { species: [], regions: [] }).species).toEqual([]);
  // specie seguita: tutte le sue novità
  const bySpecies = filterFollowed(s, { species: ['kudzu'], regions: [] });
  expect(bySpecies.species.map((x) => x.slug)).toEqual(['kudzu']);
  expect(bySpecies.total).toBe(1);
  // regione seguita (Umbria, 10): solo le segnalazioni lì
  const byRegion = filterFollowed(s, { species: [], regions: [10] });
  expect(byRegion.species).toHaveLength(1);
  expect(byRegion.species[0]).toMatchObject({ slug: 'ailanto', count: 1, firstRegions: [10], followed: 'region' });
  expect(byRegion.total).toBe(1);
});

test('seguire e smettere di seguire', () => {
  const f = toggleFollow({ species: [], regions: [] }, 'regions', 9);
  expect(f.regions).toEqual([9]);
  expect(hasFollows(f)).toBe(true);
  expect(toggleFollow(f, 'regions', 9).regions).toEqual([]);
  expect(hasFollows({ species: [], regions: [] })).toBe(false);
});

test('testo della notifica', () => {
  const items = filterFollowed(summarize(NEWS.settimane), { species: ['ailanto', 'kudzu', 'pistia'], regions: [] }).species;
  const species = new Map([
    ['ailanto', 'Ailanto'],
    ['kudzu', 'Kudzu'],
    ['pistia', 'Lattuga d’acqua'],
  ]);
  const regions = new Map([
    [10, 'Umbria'],
    [12, 'Lazio'],
  ]);
  expect(notificationText(items, species, regions, 2)).toBe(
    'Ailanto: prima segnalazione in Umbria · Lattuga d’acqua: prima segnalazione in Lazio · e un’altra specie',
  );
  expect(notificationText(items.slice(2), species, regions)).toBe('Kudzu: 1 nuova segnalazione');
});
