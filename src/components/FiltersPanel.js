import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BottomSheet, { SheetScrollView } from './BottomSheet';
import { MARKER_COLORS } from './markerColors';
import { APPROXIMATE_M, DEFAULT_FILTERS, formatDay, lastYearsStartDay, todayDay } from '../data/points';
import { useThemedStyles } from '../theme';

// Periodo: scelte relative a oggi (prima riga) e anni di partenza (seconda riga).
// "Ultimo mese" e "Ultimo anno" usano la data completa dell'osservazione, le altre l'anno.
// "Ultimi 5 anni" parte dalla data di oggi di 5 anni fa (lastYears, relativo: salvato oggi resta
// "ultimi 5 anni" anche l'anno prossimo); "Dall'anno" parte dal 1° gennaio dell'anno scelto.
const RECENT_PERIODS = [
  { label: 'Tutti', minYear: null, maxAgeDays: null, lastYears: null },
  { label: 'Ultimo mese', minYear: null, maxAgeDays: 30, lastYears: null },
  { label: 'Ultimo anno', minYear: null, maxAgeDays: 365, lastYears: null },
  { label: 'Ultimi 5 anni', minYear: null, maxAgeDays: null, lastYears: 5 },
];

/** Il periodo scelto corrisponde a questa voce della prima riga? */
function isPeriod(p, filters) {
  return (
    p.minYear === (filters.minYear ?? null) &&
    p.maxAgeDays === (filters.maxAgeDays ?? null) &&
    p.lastYears === (filters.lastYears ?? null)
  );
}
const FROM_YEARS = [2000, 2005, 2010, 2015, 2020];

const PRECISIONS = [
  { label: 'Qualsiasi', value: null },
  { label: '≤ 10 km', value: 10000 },
  { label: '≤ 1 km', value: 1000 },
  { label: '≤ 100 m', value: 100 },
];

/** Breve descrizione dei filtri attivi, per il pulsante sulla mappa. */
export function describeFilters(filters) {
  const parts = [];
  const recent = RECENT_PERIODS.find((p) => isPeriod(p, filters));
  if (filters.maxAgeDays != null || filters.minYear != null || filters.lastYears != null) {
    parts.push(recent ? recent.label.toLowerCase() : `dal ${filters.minYear}`);
  }
  const precision = PRECISIONS.find((p) => p.value === filters.maxUncertainty);
  if (filters.maxUncertainty != null) parts.push(precision?.label ?? `≤ ${filters.maxUncertainty} m`);
  if (filters.includeAutomatic) parts.push('con Pl@ntNet');
  return parts.join(' · ');
}

/** Pannello dal basso con i filtri della mappa. */
export default function FiltersPanel({ visible, filters, onChange, showGrid, onToggleGrid, gridNote, onClose, extra }) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  const set = (patch) => onChange({ ...filters, ...patch });

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      closeLabel="Chiudi filtri"
      maxHeight="85%"
      paddingBottom={insets.bottom + 12}
      header={
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            Filtri
          </Text>
          <Pressable
            onPress={() => onChange(DEFAULT_FILTERS)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Ripristina i filtri"
          >
            <Text style={styles.reset}>Ripristina</Text>
          </Pressable>
        </View>
      }
    >
      <SheetScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.label} accessibilityRole="header">
          Periodo della segnalazione
        </Text>
        <View style={styles.chips}>
          {RECENT_PERIODS.map((p) => (
            <Chip
              key={p.label}
              label={p.label}
              active={isPeriod(p, filters)}
              onPress={() => set({ minYear: p.minYear, maxAgeDays: p.maxAgeDays, lastYears: p.lastYears })}
            />
          ))}
        </View>
        <View style={styles.fromYears}>
          <Text style={styles.fromLabel}>Dall’anno</Text>
          <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel="Dall'anno">
            {FROM_YEARS.map((year) => {
              const active = filters.minYear === year && filters.maxAgeDays == null && filters.lastYears == null;
              return (
                <Pressable
                  key={year}
                  style={[styles.segment, active && styles.segmentActive]}
                  onPress={() => set({ minYear: year, maxAgeDays: null, lastYears: null })}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  accessibilityLabel={`Dal ${year}`}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{year}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        {filters.maxAgeDays != null && (
          <Text style={styles.note}>
            {filters.maxAgeDays <= 31 ? 'Ultimi 30 giorni' : 'Ultimi 12 mesi'} in base alla data dell’osservazione:
            escluse le segnalazioni senza data completa.
          </Text>
        )}
        {filters.lastYears != null && filters.maxAgeDays == null && (
          <Text style={styles.note}>
            Dal {formatDay(lastYearsStartDay(todayDay(), filters.lastYears))} a oggi, in base alla data
            dell’osservazione. Le segnalazioni con il solo anno contano se l’anno è tutto nel periodo.
          </Text>
        )}
        {filters.minYear != null && filters.maxAgeDays == null && filters.lastYears == null && (
          <Text style={styles.note}>
            Dal 1° gennaio {filters.minYear}, in base all’anno dell’osservazione. Escluse le segnalazioni senza anno.
          </Text>
        )}

        <Text style={styles.label} accessibilityRole="header">
          Precisione della posizione
        </Text>
        <Chips
          options={PRECISIONS}
          value={filters.maxUncertainty}
          onSelect={(maxUncertainty) => set({ maxUncertainty })}
        />
        {filters.maxUncertainty != null && (
          <Text style={styles.note}>Escluse le segnalazioni la cui fonte non indica la precisione.</Text>
        )}

        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <Text style={styles.switchLabel}>Identificazioni automatiche</Text>
            <Text style={styles.note}>Segnalazioni Pl@ntNet riconosciute solo dall’algoritmo, senza verifica.</Text>
          </View>
          <Switch
            value={filters.includeAutomatic}
            onValueChange={(includeAutomatic) => set({ includeAutomatic })}
            accessibilityLabel="Identificazioni automatiche"
          />
        </View>

        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <Text style={styles.switchLabel}>Griglia ufficiale ISPRA (10×10 km)</Text>
            <Text style={styles.note}>
              Celle in cui ISPRA registra la specie (rendicontazione UE, giugno 2025). {gridNote}
            </Text>
          </View>
          <Switch value={showGrid} onValueChange={onToggleGrid} accessibilityLabel="Griglia ufficiale ISPRA" />
        </View>

        <Text style={styles.label} accessibilityRole="header">
          Legenda
        </Text>
        <Legend />

        {extra}
      </SheetScrollView>
    </BottomSheet>
  );
}

function Chips({ options, value, onSelect }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.chips}>
      {options.map((o) => (
        <Chip key={o.label} label={o.label} active={o.value === value} onPress={() => onSelect(o.value)} />
      ))}
    </View>
  );
}

function Chip({ label, active, onPress }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Legend() {
  const styles = useThemedStyles(createStyles);
  const km = APPROXIMATE_M / 1000;
  return (
    <View style={styles.legend}>
      <LegendItem dotStyle={styles.dotVerified} text="Segnalazione" />
      <LegendItem dotStyle={styles.dotAutomatic} text="Identificazione automatica" />
      <LegendItem dotStyle={styles.dotApprox} text={`Posizione approssimativa (oltre ${km} km)`} />
      <LegendItem dotStyle={styles.dotCluster} text="Gruppo di segnalazioni" />
      <LegendItem dotStyle={styles.gridSwatch} text="Cella ISPRA con presenza della specie" />
    </View>
  );
}

function LegendItem({ dotStyle, text }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.legendItem} accessible accessibilityLabel={text}>
      <View style={[styles.legendDot, dotStyle]} />
      <Text style={styles.legendText}>{text}</Text>
    </View>
  );
}

const createStyles = (c) =>
  StyleSheet.create({
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontSize: 17, fontWeight: '600', color: c.text },
    reset: { fontSize: 15, color: c.primary, fontWeight: '600' },
    label: { fontSize: 14, fontWeight: '600', color: c.text, marginTop: 16, marginBottom: 8 },
    note: { fontSize: 12, color: c.textMuted, marginTop: 4 },
    flex: { flex: 1, paddingRight: 12 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { borderWidth: 1.5, borderColor: c.chipBorder, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
    chipActive: { backgroundColor: c.primaryFill, borderColor: c.primaryFill },
    chipText: { fontSize: 14, color: c.primary },
    chipTextActive: { color: c.onPrimary, fontWeight: '600' },
    fromYears: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10 },
    fromLabel: { fontSize: 13, color: c.textSecondary },
    segmented: { flex: 1, flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: 10, padding: 3 },
    segment: { flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center' },
    segmentActive: { backgroundColor: c.primaryFill },
    segmentText: { fontSize: 14, fontWeight: '600', color: c.primary },
    segmentTextActive: { color: c.onPrimary },
    switchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
    switchLabel: { fontSize: 14, fontWeight: '600', color: c.text },
    legend: { gap: 6 },
    legendItem: { flexDirection: 'row', alignItems: 'center' },
    legendDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, marginRight: 10 },
    dotVerified: { backgroundColor: MARKER_COLORS.verified, borderColor: '#fff' },
    dotAutomatic: { backgroundColor: MARKER_COLORS.automatic, borderColor: '#fff' },
    dotApprox: { backgroundColor: MARKER_COLORS.approximate, borderColor: MARKER_COLORS.verified, borderWidth: 2.5 },
    dotCluster: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: MARKER_COLORS.cluster,
      borderColor: '#fff',
    },
    gridSwatch: {
      borderRadius: 2,
      backgroundColor: 'rgba(21,101,192,0.18)',
      borderColor: 'rgba(21,101,192,0.7)',
      borderWidth: 1,
    },
    legendText: { fontSize: 13, color: c.textSecondary },
  });
