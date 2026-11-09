// Rapporto per regione in formato HTML, da convertire in PDF con expo-print.
// Funzione pura, testata in __tests__/regionReportPdf.test.js: non usa immagini esterne
// (su iOS la stampa non carica file locali), il grafico è un SVG disegnato qui.

import { escapeMarkup as esc } from '../utils/markup';

/** Pagina A4 in punti tipografici (72 per pollice), usata da expo-print. */
export const A4 = { width: 595, height: 842 };

const num = (n) => n.toLocaleString('it-IT');
const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;

/** "2026-11-02T04:12:00+00:00" -> "2 novembre 2026" */
function dateIt(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso ?? '');
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' });
}

/** Grafico a barre delle segnalazioni per anno, come SVG. */
export function trendSvg(trend, { width = 520, height = 130 } = {}) {
  const max = Math.max(1, ...trend.map((t) => t.count));
  const top = 14;
  const bottom = 18;
  const chartH = height - top - bottom;
  const slot = width / trend.length;
  const barW = Math.max(2, slot * 0.7);
  const bars = trend
    .map((t, i) => {
      const h = t.count ? Math.max(1.5, (t.count / max) * chartH) : 1;
      const x = i * slot + (slot - barW) / 2;
      const y = top + chartH - h;
      const fill = t.count ? '#2e7d32' : '#d0d5d0';
      const label =
        t.count && trend.length <= 20
          ? `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 3).toFixed(1)}" font-size="7" text-anchor="middle" fill="#444">${num(t.count)}</text>`
          : '';
      const year =
        i % 2 === 0 || i === trend.length - 1
          ? `<text x="${(x + barW / 2).toFixed(1)}" y="${height - 4}" font-size="7.5" text-anchor="middle" fill="#666">${t.year}</text>`
          : '';
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}" rx="1.5"/>${label}${year}`;
    })
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 ${width} ${height}" role="img">` +
    `<line x1="0" y1="${top + chartH + 0.5}" x2="${width}" y2="${top + chartH + 0.5}" stroke="#999" stroke-width="0.5"/>` +
    `${bars}</svg>`
  );
}

/**
 * @param {object} report          risultato di regionReport()
 * @param {object} options
 * @param {string} options.regionName
 * @param {string} options.dataDate     data dei dati GBIF in uso (ISO)
 * @param {string|null} options.filtersText descrizione dei filtri attivi, se ce ne sono
 * @param {Date} [options.now]
 */
export function regionReportHtml(report, { regionName, dataDate, filtersText = null, now = new Date() }) {
  const first = report.trend[0]?.year;
  const last = report.trend[report.trend.length - 1]?.year;
  const rows = report.species
    .map((s) => {
      const years =
        s.firstYear == null ? 'n.d.' : s.firstYear === s.lastYear ? `${s.firstYear}` : `${s.firstYear}–${s.lastYear}`;
      return (
        `<tr><td>${esc(s.species.commonName)}<div class="sci">${esc(s.species.scientificName)}</div></td>` +
        `<td class="n">${num(s.count)}</td><td class="n">${esc(years)}</td></tr>`
      );
    })
    .join('');
  const notes = [
    report.earlier > 0 ? `Prima del ${first}: ${plural(report.earlier, 'segnalazione', 'segnalazioni')}.` : null,
    report.undated > 0 ? `Senza anno: ${plural(report.undated, 'segnalazione', 'segnalazioni')}.` : null,
    'L’aumento recente riflette anche la crescita di app come iNaturalist e Pl@ntNet, non solo la diffusione delle specie.',
  ].filter(Boolean);

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AlienHub – ${esc(regionName)}</title>
<style>
@page { margin: 36px 40px; }
body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1b1b1b; font-size: 11px; line-height: 1.45; margin: 0; }
h1 { font-size: 20px; margin: 0 0 2px; color: #1b5e20; }
h2 { font-size: 13px; margin: 18px 0 6px; color: #1b5e20; border-bottom: 1px solid #c8d6c8; padding-bottom: 2px; }
.sub { color: #555; margin: 0 0 12px; }
.kpi { display: flex; gap: 24px; margin: 10px 0 4px; }
.kpi div { font-size: 10px; color: #555; }
.kpi b { display: block; font-size: 20px; color: #1b1b1b; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-size: 10px; color: #555; border-bottom: 1px solid #999; padding: 4px 6px; }
td { border-bottom: 0.5px solid #ddd; padding: 4px 6px; vertical-align: top; }
tr { page-break-inside: avoid; }
.n { text-align: right; white-space: nowrap; }
th.n { text-align: right; }
.sci { font-style: italic; color: #555; font-size: 10px; }
.note { color: #555; font-size: 10px; }
.foot { margin-top: 18px; color: #555; font-size: 9.5px; }
</style>
</head>
<body>
<h1>Specie vegetali esotiche invasive – ${esc(regionName)}</h1>
<p class="sub">Rapporto generato con AlienHub il ${esc(dateIt(now.toISOString()))}. Dati GBIF aggiornati al ${esc(dateIt(dataDate))}.${
    filtersText ? ` Filtri applicati: ${esc(filtersText)}.` : ''
  }</p>
<div class="kpi">
<div><b>${num(report.total)}</b>segnalazioni</div>
<div><b>${num(report.species.length)}</b>specie di rilevanza unionale</div>
</div>
${
  report.total > 0
    ? `<h2>Andamento negli anni (${first}–${last})</h2>
${trendSvg(report.trend)}
<p class="note">${notes.map(esc).join(' ')}</p>`
    : ''
}
<h2>Specie segnalate</h2>
${
  report.species.length
    ? `<table><thead><tr><th>Specie</th><th class="n">Segnalazioni</th><th class="n">Anni</th></tr></thead><tbody>${rows}</tbody></table>`
    : '<p>Nessuna segnalazione con i filtri attivi.</p>'
}
<h2>Fonti e note</h2>
<p class="foot">Segnalazioni: GBIF.org, consultato tramite AlienHub. Ogni segnalazione mantiene la licenza del
dataset di origine (CC0, CC BY o CC BY-NC); citare GBIF.org e i dataset. Regione di ogni segnalazione calcolata
con i confini ISTAT (CC BY 4.0). Elenco delle specie: Regolamento (UE) 1143/2014 e regolamenti di esecuzione
successivi, fino al Reg. (UE) 2025/1422. Il numero di segnalazioni dipende da quanto una zona è stata esplorata
e non misura da solo la diffusione di una specie; l’assenza di segnalazioni non prova l’assenza della specie.</p>
<p class="foot">AlienHub è un’app gratuita e open source: https://github.com/Anghelos98/ias-tracker</p>
</body>
</html>
`;
}
