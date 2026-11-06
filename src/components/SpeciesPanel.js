import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SPECIES } from '../data/species';

/** Pannello a scomparsa dal basso con l'elenco ricercabile delle 49 specie. */
export default function SpeciesPanel({ visible, selectedSlug, onSelect, onClose }) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SPECIES;
    return SPECIES.filter(
      (s) => s.commonName.toLowerCase().includes(q) || s.scientificName.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Chiudi elenco" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>Specie di rilevanza unionale ({SPECIES.length})</Text>
        <TextInput
          style={styles.search}
          placeholder="Cerca per nome comune o scientifico"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        <FlatList
          data={filtered}
          keyExtractor={(s) => s.slug}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const selected = item.slug === selectedSlug;
            const empty = item.total === 0;
            return (
              <Pressable
                onPress={() => onSelect(item)}
                style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.rowPressed]}
              >
                <View style={styles.rowText}>
                  <Text style={[styles.common, empty && styles.muted]}>{item.commonName}</Text>
                  <Text style={[styles.scientific, empty && styles.muted]}>{item.scientificName}</Text>
                </View>
                <Text style={[styles.count, empty && styles.muted]}>
                  {empty ? 'nessuna\nsegnalazione' : item.total.toLocaleString('it-IT')}
                </Text>
              </Pressable>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={<Text style={styles.empty}>Nessuna specie trovata</Text>}
        />
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
  title: { fontSize: 17, fontWeight: '600', marginBottom: 10 },
  search: {
    backgroundColor: '#f1f3f4',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 6, borderRadius: 8 },
  rowSelected: { backgroundColor: '#e6f4ea' },
  rowPressed: { backgroundColor: '#f1f3f4' },
  rowText: { flex: 1, paddingRight: 8 },
  common: { fontSize: 15, fontWeight: '500', color: '#1b1b1b' },
  scientific: { fontSize: 13, fontStyle: 'italic', color: '#555', marginTop: 2 },
  count: { fontSize: 13, color: '#2e7d32', fontWeight: '600', textAlign: 'right' },
  muted: { color: '#9e9e9e', fontWeight: '400' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#e0e0e0' },
  empty: { textAlign: 'center', color: '#777', padding: 20 },
});
