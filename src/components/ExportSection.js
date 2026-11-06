import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { EXPORT_FORMATS, exportFileName, exportRows, formatExport } from '../data/exportData';
import { regionToBBox } from '../utils/geo';
import { shareTextFile } from '../utils/shareFile';

/**
 * Esportazione delle segnalazioni mostrate sulla mappa (con i filtri attivi), dell'area
 * visibile o di tutta Italia, in CSV, GeoJSON o KML.
 */
export default function ExportSection({ datasets, filters, region, title, slug }) {
  const [format, setFormat] = useState('csv');
  const [onlyVisible, setOnlyVisible] = useState(true);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(
    () => (datasets?.length ? exportRows(datasets, filters, onlyVisible ? regionToBBox(region) : null) : []),
    [datasets, filters, onlyVisible, region],
  );

  if (!datasets?.length) {
    return (
      <View style={styles.section}>
        <Text style={styles.label}>Esporta i dati</Text>
        <Text style={styles.note}>Scegli una specie (o “Tutte le specie”) per esportarne le segnalazioni.</Text>
      </View>
    );
  }

  const exportNow = async () => {
    setBusy(true);
    try {
      const content = formatExport(format, rows, {
        title: `IAS Tracker – ${title}`,
        meta: { specie: title, filtri: filters, area: onlyVisible ? regionToBBox(region) : 'Italia' },
      });
      await shareTextFile(exportFileName(slug, format), content, EXPORT_FORMATS[format]);
    } catch {
      Alert.alert('Esportazione non riuscita', 'Non è stato possibile creare o condividere il file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.section}>
      <Text style={styles.label}>Esporta i dati mostrati</Text>
      <View style={styles.chips}>
        <Chip label="Area visibile" active={onlyVisible} onPress={() => setOnlyVisible(true)} />
        <Chip label="Tutta Italia" active={!onlyVisible} onPress={() => setOnlyVisible(false)} />
      </View>
      <View style={[styles.chips, styles.formats]}>
        {Object.entries(EXPORT_FORMATS).map(([key, f]) => (
          <Chip key={key} label={f.label} active={format === key} onPress={() => setFormat(key)} />
        ))}
      </View>
      <Pressable
        style={[styles.button, (busy || rows.length === 0) && styles.disabled]}
        onPress={exportNow}
        disabled={busy || rows.length === 0}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>
            Esporta {rows.length.toLocaleString('it-IT')} segnalazioni ({EXPORT_FORMATS[format].label})
          </Text>
        )}
      </Pressable>
      <Text style={styles.note}>
        Ogni riga riporta fonte e licenza (CC0, CC BY o CC BY-NC): citare GBIF.org e il dataset di origine.
      </Text>
    </View>
  );
}

function Chip({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]} accessibilityState={{ selected: active }}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 18, borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#e0e0e0', paddingTop: 14 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  note: { fontSize: 12, color: '#777', marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  formats: { marginTop: 8 },
  chip: { borderWidth: 1.5, borderColor: '#c8d6c9', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipActive: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
  chipText: { fontSize: 14, color: '#2e7d32' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  button: { marginTop: 12, backgroundColor: '#2e7d32', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.4 },
});
