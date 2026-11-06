import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APPROXIMATE_M, DEFAULT_FILTERS } from '../data/points';

const CURRENT_YEAR = new Date().getFullYear();

const PERIODS = [
  { label: 'Tutti', value: null },
  { label: 'Dal 2000', value: 2000 },
  { label: 'Dal 2015', value: 2015 },
  { label: 'Ultimi 5 anni', value: CURRENT_YEAR - 4 },
];

const PRECISIONS = [
  { label: 'Qualsiasi', value: null },
  { label: '≤ 10 km', value: 10000 },
  { label: '≤ 1 km', value: 1000 },
  { label: '≤ 100 m', value: 100 },
];

/** Breve descrizione dei filtri attivi, per il pulsante sulla mappa. */
export function describeFilters(filters) {
  const parts = [];
  const period = PERIODS.find((p) => p.value === filters.minYear);
  if (filters.minYear != null) parts.push(period?.label.toLowerCase() ?? `dal ${filters.minYear}`);
  const precision = PRECISIONS.find((p) => p.value === filters.maxUncertainty);
  if (filters.maxUncertainty != null) parts.push(precision?.label ?? `≤ ${filters.maxUncertainty} m`);
  if (filters.includeAutomatic) parts.push('con Pl@ntNet');
  return parts.join(' · ');
}

/** Pannello dal basso con i filtri della mappa. */
export default function FiltersPanel({ visible, filters, onChange, onClose, extra }) {
  const insets = useSafeAreaInsets();
  const set = (patch) => onChange({ ...filters, ...patch });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Chiudi filtri" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>Filtri</Text>
          <Pressable onPress={() => onChange(DEFAULT_FILTERS)} hitSlop={10}>
            <Text style={styles.reset}>Ripristina</Text>
          </Pressable>
        </View>

        <Text style={styles.label}>Periodo della segnalazione</Text>
        <Chips options={PERIODS} value={filters.minYear} onSelect={(minYear) => set({ minYear })} />
        {filters.minYear != null && <Text style={styles.note}>Escluse le segnalazioni senza anno.</Text>}

        <Text style={styles.label}>Precisione della posizione</Text>
        <Chips options={PRECISIONS} value={filters.maxUncertainty} onSelect={(maxUncertainty) => set({ maxUncertainty })} />
        {filters.maxUncertainty != null && (
          <Text style={styles.note}>Escluse le segnalazioni la cui fonte non indica la precisione.</Text>
        )}

        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <Text style={styles.switchLabel}>Identificazioni automatiche</Text>
            <Text style={styles.note}>Segnalazioni Pl@ntNet riconosciute solo dall’algoritmo, senza verifica.</Text>
          </View>
          <Switch value={filters.includeAutomatic} onValueChange={(includeAutomatic) => set({ includeAutomatic })} />
        </View>

        <Text style={styles.label}>Legenda</Text>
        <Legend />

        {extra}
      </View>
    </Modal>
  );
}

function Chips({ options, value, onSelect }) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.label}
            onPress={() => onSelect(o.value)}
            style={[styles.chip, active && styles.chipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Legend() {
  const km = APPROXIMATE_M / 1000;
  return (
    <View style={styles.legend}>
      <LegendItem dotStyle={styles.dotVerified} text="Segnalazione" />
      <LegendItem dotStyle={styles.dotAutomatic} text="Identificazione automatica" />
      <LegendItem dotStyle={styles.dotApprox} text={`Posizione approssimativa (oltre ${km} km)`} />
      <LegendItem dotStyle={styles.dotCluster} text="Gruppo di segnalazioni" />
    </View>
  );
}

function LegendItem({ dotStyle, text }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, dotStyle]} />
      <Text style={styles.legendText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#ccc', marginBottom: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '600' },
  reset: { fontSize: 15, color: '#2e7d32', fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginTop: 16, marginBottom: 8 },
  note: { fontSize: 12, color: '#777', marginTop: 4 },
  flex: { flex: 1, paddingRight: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderColor: '#c8d6c9', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipActive: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
  chipText: { fontSize: 14, color: '#2e7d32' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  switchLabel: { fontSize: 14, fontWeight: '600', color: '#333' },
  legend: { gap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, marginRight: 10 },
  dotVerified: { backgroundColor: '#2e7d32', borderColor: '#fff' },
  dotAutomatic: { backgroundColor: '#ef8a00', borderColor: '#fff' },
  dotApprox: { backgroundColor: '#fff', borderColor: '#2e7d32', borderWidth: 2.5 },
  dotCluster: { width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(46,125,50,0.85)', borderColor: '#fff' },
  legendText: { fontSize: 13, color: '#444' },
});
