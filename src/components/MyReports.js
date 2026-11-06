import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sendByEmail, shareReport } from '../reports/send';
import { deleteReport, loadReports } from '../reports/storage';

const CHANNEL_LABEL = { email: 'email al Ministero', condivisione: 'condivisa' };

/** Elenco delle segnalazioni salvate sul telefono, con reinvio ed eliminazione. */
export default function MyReports({ visible, onClose, onShowOnMap }) {
  const insets = useSafeAreaInsets();
  const [reports, setReports] = useState([]);

  const reload = useCallback(async () => setReports(await loadReports()), []);

  useEffect(() => {
    if (!visible) return undefined;
    let active = true;
    loadReports().then((r) => {
      if (active) setReports(r);
    });
    return () => {
      active = false;
    };
  }, [visible]);

  const confirmDelete = (report) =>
    Alert.alert('Eliminare la segnalazione?', 'Verranno cancellate anche le foto salvate nell’app.', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina',
        style: 'destructive',
        onPress: async () => setReports(await deleteReport(report.id)),
      },
    ]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Le mie segnalazioni</Text>
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={styles.headerAction}>Chiudi</Text>
        </Pressable>
      </View>
      <FlatList
        data={reports}
        keyExtractor={(r) => r.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Nessuna segnalazione. Usa il pulsante “Segnala” sulla mappa quando trovi una specie invasiva.
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardRow}>
              {item.photos[0] ? (
                <Image source={{ uri: item.photos[0] }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.noThumb]}>
                  <Text style={styles.noThumbText}>senza foto</Text>
                </View>
              )}
              <View style={styles.cardText}>
                <Text style={styles.title}>{item.commonName}</Text>
                <Text style={styles.scientific}>{item.scientificName}</Text>
                <Text style={styles.meta}>
                  {new Date(item.createdAt).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' })}
                </Text>
                <Text style={styles.meta}>
                  {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
                  {item.accuracy != null ? ` · ± ${Math.round(item.accuracy)} m` : ''}
                </Text>
                <Text style={item.sent.length ? styles.sent : styles.notSent}>
                  {item.sent.length
                    ? `Inviata: ${[...new Set(item.sent.map((s) => CHANNEL_LABEL[s.channel]))].join(', ')}`
                    : 'Non ancora inviata'}
                </Text>
              </View>
            </View>
            <View style={styles.actions}>
              <Action label="Email" onPress={async () => (await sendByEmail(item)) && reload()} />
              <Action label="Condividi" onPress={async () => (await shareReport(item)) && reload()} />
              <Action label="Mappa" onPress={() => onShowOnMap(item)} />
              <Action label="Elimina" destructive onPress={() => confirmDelete(item)} />
            </View>
          </View>
        )}
      />
    </Modal>
  );
}

function Action({ label, onPress, destructive }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={styles.action}>
      <Text style={[styles.actionText, destructive && styles.destructive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  headerAction: { fontSize: 16, color: '#2e7d32', fontWeight: '600' },
  list: { padding: 16, backgroundColor: '#fff', flexGrow: 1 },
  empty: { textAlign: 'center', color: '#777', marginTop: 40, lineHeight: 20 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#ddd', borderRadius: 12, padding: 12, marginBottom: 12 },
  cardRow: { flexDirection: 'row' },
  thumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#eee' },
  noThumb: { alignItems: 'center', justifyContent: 'center' },
  noThumbText: { fontSize: 11, color: '#999' },
  cardText: { flex: 1, marginLeft: 12 },
  title: { fontSize: 15, fontWeight: '600' },
  scientific: { fontSize: 13, fontStyle: 'italic', color: '#555' },
  meta: { fontSize: 12, color: '#666', marginTop: 2 },
  sent: { fontSize: 12, color: '#2e7d32', marginTop: 4, fontWeight: '600' },
  notSent: { fontSize: 12, color: '#b26a00', marginTop: 4, fontWeight: '600' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  action: { paddingVertical: 4, paddingHorizontal: 6 },
  actionText: { color: '#1565c0', fontWeight: '600' },
  destructive: { color: '#c62828' },
});
