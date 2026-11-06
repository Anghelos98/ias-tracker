import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


/** Pannello a scomparsa dal basso con l'elenco ricercabile delle 49 specie. */
export default function SpeciesPanel({
  species,
  allItem,
  dataUpdatedAt,
  visible,
  selectedSlug,
  onSelect,
  onInfo,
  onAbout,
  onClose,
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return species;
    return species.filter(
      (s) => s.commonName.toLowerCase().includes(q) || s.scientificName.toLowerCase().includes(q),
    );
  }, [query, species]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Chiudi elenco" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.handle} />
        <View style={styles.titleRow}>
          <Text style={styles.title}>Specie di rilevanza unionale ({species.length})</Text>
          <Pressable onPress={onAbout} hitSlop={10} accessibilityRole="button">
            <Text style={styles.about}>Informazioni</Text>
          </Pressable>
        </View>
        <Text style={styles.updated}>
          Dati GBIF aggiornati al{' '}
          {new Date(dataUpdatedAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
        </Text>
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
                <Pressable
                  onPress={() => onInfo(item)}
                  hitSlop={10}
                  style={styles.infoButton}
                  accessibilityLabel={`Scheda di ${item.commonName}`}
                >
                  <Text style={styles.infoText}>ⓘ</Text>
                </Pressable>
              </Pressable>
            );
          }}
          ListHeaderComponent={
            query.trim() ? null : (
              <Pressable
                onPress={() => onSelect(allItem)}
                style={({ pressed }) => [
                  styles.row,
                  styles.allRow,
                  allItem.slug === selectedSlug && styles.rowSelected,
                  pressed && styles.rowPressed,
                ]}
              >
                <View style={styles.rowText}>
                  <Text style={styles.common}>{allItem.commonName}</Text>
                  <Text style={styles.allSubtitle}>{allItem.scientificName}</Text>
                </View>
                <Text style={styles.count}>{allItem.total.toLocaleString('it-IT')}</Text>
              </Pressable>
            )
          }
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
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '600', flexShrink: 1 },
  about: { fontSize: 14, color: '#2e7d32', fontWeight: '600', paddingLeft: 8 },
  updated: { fontSize: 12, color: '#777', marginTop: 2, marginBottom: 10 },
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
  allRow: { borderBottomWidth: 1, borderColor: '#c8d6c9', marginBottom: 4 },
  allSubtitle: { fontSize: 13, color: '#555', marginTop: 2 },
  rowPressed: { backgroundColor: '#f1f3f4' },
  rowText: { flex: 1, paddingRight: 8 },
  common: { fontSize: 15, fontWeight: '500', color: '#1b1b1b' },
  scientific: { fontSize: 13, fontStyle: 'italic', color: '#555', marginTop: 2 },
  count: { fontSize: 13, color: '#2e7d32', fontWeight: '600', textAlign: 'right' },
  muted: { color: '#9e9e9e', fontWeight: '400' },
  infoButton: { paddingLeft: 12, paddingVertical: 4 },
  infoText: { fontSize: 22, color: '#1565c0' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#e0e0e0' },
  empty: { textAlign: 'center', color: '#777', padding: 20 },
});
