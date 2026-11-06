import { DARK, LIGHT } from '../src/theme';

// Contrasto WCAG 2.1 tra due colori esadecimali.
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT = [
  'text',
  'textSecondary',
  'textMuted',
  'primary',
  'link',
  'warning',
  'orange',
  'danger',
  'olive',
  'neutral',
  'disclaimer',
];

describe.each([
  ['chiaro', LIGHT],
  ['scuro', DARK],
])('tema %s', (_, c) => {
  test.each(TEXT)('%s leggibile su sfondo e superfici (AA, 4,5:1)', (key) => {
    for (const bg of [c.background, c.surface]) expect(contrast(c[key], bg)).toBeGreaterThanOrEqual(4.5);
  });

  test('testo sui pulsanti verdi e sugli avvisi', () => {
    expect(contrast(c.onPrimary, c.primaryFill)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.hintImportantText, c.hintImportantBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.text, c.surfaceAlt)).toBeGreaterThanOrEqual(4.5);
  });

  test('stesse chiavi nei due temi', () => {
    expect(Object.keys(c).sort()).toEqual(Object.keys(LIGHT).sort());
  });
});
