// Novità della settimana e specie/aree seguite. Funzioni pure, testate in __tests__/news.test.js.
//
// Le novità sono calcolate dalla pipeline dati (scripts/build_news.py) confrontando ogni
// aggiornamento con il precedente: per ogni specie, quante segnalazioni sono comparse su GBIF,
// in quali regioni, e se è la prima segnalazione della specie in una regione.

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Data dei dati plausibile: ISO ("AAAA-MM-GGT…"), valida e non nel futuro (tolleranza di due
 * giorni per gli orologi sbagliati). Le date arrivano dai dati scaricati e vengono salvate sul
 * telefono ("novità già viste/annunciate"): una data come "9999-…" farebbe sembrare vecchie, e
 * quindi già viste, tutte le novità successive, per sempre.
 */
export function isPlausibleIsoDate(value, now = Date.now()) {
  if (typeof value !== 'string' || value.length > 40 || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= now + 2 * DAY_MS;
}

/** Aggiornamenti dell'ultima settimana (più di uno se i dati sono stati rigenerati a mano). */
export function latestWeeks(news, days = 7) {
  const weeks = news?.settimane ?? [];
  if (!weeks.length) return [];
  const newest = Date.parse(weeks[0].dati_al);
  return weeks.filter((w) => newest - Date.parse(w.dati_al) < days * DAY_MS);
}

/** Aggiornamenti successivi a una data (ISO); tutti se la data manca. */
export function weeksSince(news, sinceIso) {
  const weeks = news?.settimane ?? [];
  if (!sinceIso) return weeks;
  const since = Date.parse(sinceIso);
  return weeks.filter((w) => Date.parse(w.dati_al) > since);
}

/** Data dell'aggiornamento più recente descritto nelle novità (ISO) o null. */
export function newestDate(news) {
  return news?.settimane?.[0]?.dati_al ?? null;
}

/**
 * Somma più aggiornamenti.
 * @returns {{from: string|null, to: string|null, total: number,
 *   species: {slug: string, count: number, regions: Object<string, number>, firstRegions: number[], firstInItaly: boolean}[]}}
 */
export function summarize(weeks) {
  const bySlug = new Map();
  let total = 0;
  for (const week of weeks) {
    for (const [slug, s] of Object.entries(week.specie ?? {})) {
      let item = bySlug.get(slug);
      if (!item) {
        item = { slug, count: 0, regions: {}, firstRegions: [], firstInItaly: false };
        bySlug.set(slug, item);
      }
      item.count += s.nuove;
      total += s.nuove;
      for (const [code, n] of Object.entries(s.regioni ?? {})) item.regions[code] = (item.regions[code] ?? 0) + n;
      for (const code of s.prime_regioni ?? []) if (!item.firstRegions.includes(code)) item.firstRegions.push(code);
      item.firstInItaly ||= Boolean(s.prima_in_italia);
    }
  }
  const dates = weeks.map((w) => w.dati_al).sort();
  const previous = weeks.map((w) => w.precedenti_al).filter(Boolean).sort();
  return {
    from: previous[0] ?? null,
    to: dates[dates.length - 1] ?? null,
    total,
    species: [...bySlug.values()]
      .map((s) => ({ ...s, firstRegions: s.firstRegions.sort((a, b) => a - b) }))
      .sort((a, b) => b.firstRegions.length - a.firstRegions.length || b.count - a.count),
  };
}

export const NO_FOLLOWS = { species: [], regions: [] };

export function hasFollows(follows) {
  return Boolean(follows && (follows.species.length || follows.regions.length));
}

/**
 * Solo le novità che riguardano specie o regioni seguite. Una specie seguita compare con tutte
 * le sue novità; per le altre specie si contano solo le regioni seguite.
 */
export function filterFollowed(summary, follows) {
  if (!hasFollows(follows)) return { ...summary, total: 0, species: [] };
  const regions = new Set(follows.regions.map(String));
  const species = [];
  for (const s of summary.species) {
    if (follows.species.includes(s.slug)) {
      species.push({ ...s, followed: 'species' });
      continue;
    }
    const kept = Object.entries(s.regions).filter(([code]) => regions.has(code));
    if (!kept.length) continue;
    species.push({
      ...s,
      count: kept.reduce((sum, [, n]) => sum + n, 0),
      regions: Object.fromEntries(kept),
      firstRegions: s.firstRegions.filter((code) => regions.has(String(code))),
      firstInItaly: false,
      followed: 'region',
    });
  }
  return { ...summary, total: species.reduce((sum, s) => sum + s.count, 0), species };
}

/** Aggiunge o toglie un elemento da un elenco (per seguire / smettere di seguire). */
export function toggleFollow(follows, kind, value) {
  const list = follows[kind];
  return { ...follows, [kind]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] };
}

/**
 * Testo breve per la notifica: "Ailanto: prima segnalazione in Umbria · Kudzu: 3 nuove".
 * @param {object[]} items  specie filtrate (filterFollowed)
 * @param {Map<string, string>} speciesNames  slug -> nome comune
 * @param {Map<number, string>} regionNames   codice -> nome della regione
 */
export function notificationText(items, speciesNames, regionNames, max = 3) {
  const parts = items.slice(0, max).map((s) => {
    const name = speciesNames.get(s.slug) ?? s.slug;
    if (s.firstRegions.length) {
      const where = s.firstRegions.map((c) => regionNames.get(c) ?? c).join(', ');
      return `${name}: prima segnalazione in ${where}`;
    }
    return `${name}: ${s.count} ${s.count === 1 ? 'nuova segnalazione' : 'nuove segnalazioni'}`;
  });
  const others = items.length - max;
  if (others === 1) parts.push('e un’altra specie');
  else if (others > 1) parts.push(`e altre ${others} specie`);
  return parts.join(' · ');
}
