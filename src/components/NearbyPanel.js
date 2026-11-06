import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { loadAllDatasets } from '../data/allSpecies';
import { formatDistance, speciesNearby } from '../data/nearby';
import { useColors, useThemedStyles } from '../theme';
import { readGpsPosition } from '../utils/location';

const RADII = [1000, 5000, 10000, 25000];

/**
 * "Vicino a me": specie invasive segnalate entro un raggio dalla posizione dell'utente,
 * ordinate per distanza della segnalazione più vicina. Rispetta i filtri attivi.
 */
export default function NearbyPanel({ visible, speciesList, manifest, filters, onSelect, onInfo, onClose }) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useThemedStyles(createStyles);
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
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Chiudi Vicino a me"
      />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.handle} />
        <Text style={styles.title} accessibilityRole="header">
          Vicino a me
        </Text>
        <Text style={styles.subtitle}>Specie invasive segnalate nel raggio di</Text>
        <View style={styles.chips}>
          {RADII.map((r) => (
            <Pressable
              key={r}
              onPress={() => setRadius(r)}
              style={[styles.chip, r === radius && styles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: r === radius }}
              accessibilityLabel={`Raggio ${r / 1000} chilometri`}
            >
              <Text style={[styles.chipText, r === radius && styles.chipTextActive]}>{r / 1000} km</Text>
            </Pressable>
          ))}
        </View>

        {state.status === 'loading' && (
          <View style={styles.center} accessible accessibilityLabel="Rilevo la posizione e cerco le segnalazioni">
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.muted}>Rilevo la posizione e cerco le segnalazioni…</Text>
          </View>
        )}

        {state.status === 'error' && (
          <View style={styles.center}>
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {state.message}
            </Text>
            <Pressable onPress={retry} style={styles.retry} accessibilityRole="button">
              <Text style={styles.retryText}>Riprova</Text>
            </Pressable>
          </View>
        )}

        {state.status === 'ready' && (
          <FlatList
            data={results}
            keyExtractor={(r) => r.species.slug}
            ListHeaderComponent={
              <Text style={styles.summary} accessibilityLiveRegion="polite">
                {results.length
                  ? `${results.length} specie entro ${radius / 1000} km`
                  : `Nessuna segnalazione entro ${radius / 1000} km con i filtri attivi.`}
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => onSelect(item, state.position, radius)}
                accessibilityRole="button"
                accessibilityLabel={`${item.species.commonName}: ${item.count} ${
                  item.count === 1 ? 'segnalazione' : 'segnalazioni'
                }, la più vicina a ${formatDistance(item.nearest)}`}
                accessibilityHint="Mostra le segnalazioni sulla mappa"
              >
                <View style={styles.rowText}>
                  <Text style={styles.common}>{item.species.commonName}</Text>
                  <Text style={styles.scientific}>{item.species.scientificName}</Text>
                  <Text style={styles.meta}>
                    {item.count} {item.count === 1 ? 'segnalazione' : 'segnalazioni'} · la più vicina a{' '}
                    {formatDistance(item.nearest)}
                  </Text>
                </View>
                <Pressable
                  onPress={() => onInfo(item.species)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Scheda di ${item.species.commonName}`}
                >
                  <Text style={styles.info} allowFontScaling={false}>
                    ⓘ
                  </Text>
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

const createStyles = (c) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: c.backdrop },
    sheet: {
      maxHeight: '75%',
      backgroundColor: c.surface,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.handle, marginBottom: 12 },
    title: { fontSize: 17, fontWeight: '600', color: c.text },
    subtitle: { fontSize: 13, color: c.textMuted, marginTop: 4, marginBottom: 8 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
    chip: { borderWidth: 1.5, borderColor: c.chipBorder, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
    chipActive: { backgroundColor: c.primaryFill, borderColor: c.primaryFill },
    chipText: { fontSize: 14, color: c.primary },
    chipTextActive: { color: c.onPrimary, fontWeight: '600' },
    center: { alignItems: 'center', paddingVertical: 28, gap: 10 },
    muted: { fontSize: 13, color: c.textMuted },
    error: { fontSize: 14, color: c.warning, textAlign: 'center' },
    retry: { borderWidth: 1.5, borderColor: c.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
    retryText: { color: c.primary, fontWeight: '600' },
    list: { marginTop: 4 },
    summary: { fontSize: 13, color: c.textSecondary, paddingVertical: 6 },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, borderRadius: 8 },
    rowPressed: { backgroundColor: c.surfaceAlt },
    rowText: { flex: 1, paddingRight: 8 },
    common: { fontSize: 15, fontWeight: '500', color: c.text },
    scientific: { fontSize: 13, fontStyle: 'italic', color: c.textSecondary, marginTop: 1 },
    meta: { fontSize: 12, color: c.primary, marginTop: 3, fontWeight: '600' },
    info: { fontSize: 22, color: c.link, paddingLeft: 8 },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: c.border },
  });
