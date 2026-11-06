import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { loadAllDatasets } from '../data/allSpecies';
import { formatDistance, speciesNearby } from '../data/nearby';
import { readGpsPosition } from '../utils/location';

const RADII = [1000, 5000, 10000, 25000];

/**
 * "Vicino a me": specie invasive segnalate entro un raggio dalla posizione dell'utente,
 * ordinate per distanza della segnalazione più vicina. Rispetta i filtri attivi.
 */
export default function NearbyPanel({ visible, speciesList, manifest, filters, onSelect, onInfo, onClose }) {
  const insets = useSafeAreaInsets();
  const [radius, setRadius] = useState(5000);
  const [state, setState] = useState({ status: 'loading' }); // loading | ready | error
  const [attempt, setAttempt] = useState(0);

  // Posizione e dati di tutte le specie, letti all'apertura (o su "Riprova").
  useEffect(() => {
    if (!visible) return undefined;
    let active = true;
    Promise.all([readGpsPosition(), loadAllDatasets(speciesList, manifest)])
      .then(([reading, datasets]) => {
        if (!active) return;
        if (reading.error) setState({ status: 'error', message: reading.error });
        else setState({ status: 'ready', position: reading.position, datasets });
      })
      .catch(() => {
        if (active) setState({ status: 'error', message: 'Non è stato possibile caricare i dati.' });
      });
    return () => {
      active = false;
    };
  }, [visible, speciesList, manifest, attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((a) => a + 1);
  }, []);

  const results = useMemo(
    () => (state.status === 'ready' ? speciesNearby(state.datasets, state.position, radius, filters) : []),
    [state, radius, filters],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Chiudi" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>Vicino a me</Text>
        <Text style={styles.subtitle}>Specie invasive segnalate nel raggio di</Text>
        <View style={styles.chips}>
          {RADII.map((r) => (
            <Pressable
              key={r}
              onPress={() => setRadius(r)}
              style={[styles.chip, r === radius && styles.chipActive]}
              accessibilityState={{ selected: r === radius }}
            >
              <Text style={[styles.chipText, r === radius && styles.chipTextActive]}>{r / 1000} km</Text>
            </Pressable>
          ))}
        </View>

        {state.status === 'loading' && (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text style={styles.muted}>Rilevo la posizione e cerco le segnalazioni…</Text>
          </View>
        )}

        {state.status === 'error' && (
          <View style={styles.center}>
            <Text style={styles.error}>{state.message}</Text>
            <Pressable onPress={retry} style={styles.retry}>
              <Text style={styles.retryText}>Riprova</Text>
            </Pressable>
          </View>
        )}

        {state.status === 'ready' && (
          <FlatList
            data={results}
            keyExtractor={(r) => r.species.slug}
            ListHeaderComponent={
              <Text style={styles.summary}>
                {results.length
                  ? `${results.length} specie entro ${radius / 1000} km`
                  : `Nessuna segnalazione entro ${radius / 1000} km con i filtri attivi.`}
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => onSelect(item, state.position, radius)}
              >
                <View style={styles.rowText}>
                  <Text style={styles.common}>{item.species.commonName}</Text>
                  <Text style={styles.scientific}>{item.species.scientificName}</Text>
                  <Text style={styles.meta}>
                    {item.count} {item.count === 1 ? 'segnalazione' : 'segnalazioni'} · la più vicina a{' '}
                    {formatDistance(item.nearest)}
                  </Text>
                </View>
                <Pressable onPress={() => onInfo(item.species)} hitSlop={10} accessibilityLabel="Scheda della specie">
                  <Text style={styles.info}>ⓘ</Text>
                </Pressable>
              </Pressable>
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            style={styles.list}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    maxHeight: '75%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#ccc', marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '600' },
  subtitle: { fontSize: 13, color: '#666', marginTop: 4, marginBottom: 8 },
  chips: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  chip: { borderWidth: 1.5, borderColor: '#c8d6c9', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipActive: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
  chipText: { fontSize: 14, color: '#2e7d32' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  center: { alignItems: 'center', paddingVertical: 28, gap: 10 },
  muted: { fontSize: 13, color: '#666' },
  error: { fontSize: 14, color: '#b26a00', textAlign: 'center' },
  retry: { borderWidth: 1.5, borderColor: '#2e7d32', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  retryText: { color: '#2e7d32', fontWeight: '600' },
  list: { marginTop: 4 },
  summary: { fontSize: 13, color: '#555', paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, borderRadius: 8 },
  rowPressed: { backgroundColor: '#f1f3f4' },
  rowText: { flex: 1, paddingRight: 8 },
  common: { fontSize: 15, fontWeight: '500', color: '#1b1b1b' },
  scientific: { fontSize: 13, fontStyle: 'italic', color: '#555', marginTop: 1 },
  meta: { fontSize: 12, color: '#2e7d32', marginTop: 3, fontWeight: '600' },
  info: { fontSize: 22, color: '#1565c0', paddingLeft: 8 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#e0e0e0' },
});
