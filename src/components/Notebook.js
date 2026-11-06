import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  NOTEBOOK_FORMATS,
  entryKind,
  entryTitle,
  filterEntries,
  formatNotebook,
  notebookFileName,
} from '../reports/notebook';
import { sendByEmail, shareReport } from '../reports/send';
import { deleteReport, loadReports } from '../reports/storage';
import { useColors, useThemedStyles } from '../theme';
import { shareTextFile } from '../utils/shareFile';

const CHANNEL_LABEL = { email: 'email al Ministero', regione: 'email alla Regione', condivisione: 'condivisa' };
const KIND_FILTERS = [
  { value: 'tutte', label: 'Tutte' },
  { value: 'presenza', label: 'Presenze' },
  { value: 'intervento', label: 'Interventi' },
];

/**
 * Taccuino di campo: presenze e interventi salvati sul telefono, con reinvio, eliminazione
 * ed esportazione in CSV, GeoJSON o KML.
 */
export default function Notebook({ visible, onClose, onShowOnMap, onNewEntry }) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useThemedStyles(createStyles);
  const [entries, setEntries] = useState([]);
  const [kind, setKind] = useState('tutte');
  const [format, setFormat] = useState('csv');
  const [exporting, setExporting] = useState(false);

  const reload = useCallback(async () => setEntries(await loadReports()), []);

  useEffect(() => {
    if (!visible) return undefined;
    let active = true;
    loadReports().then((r) => {
      if (active) setEntries(r);
    });
    return () => {
      active = false;
    };
  }, [visible]);

  const shown = useMemo(() => filterEntries(entries, kind), [entries, kind]);

  const confirmDelete = (entry) =>
    Alert.alert('Eliminare la voce?', 'Verranno cancellate anche le foto salvate nell’app.', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina',
        style: 'destructive',
        onPress: async () => setEntries(await deleteReport(entry.id)),
      },
    ]);

  const exportNow = async () => {
    setExporting(true);
    try {
      await shareTextFile(notebookFileName(format), formatNotebook(format, shown), NOTEBOOK_FORMATS[format]);
    } catch {
      Alert.alert('Esportazione non riuscita', 'Non è stato possibile creare o condividere il file.');
    } finally {
      setExporting(false);
    }
  };

  const header = (
    <View>
      <View style={styles.chips}>
        {KIND_FILTERS.map((k) => (
          <Chip
            key={k.value}
            label={k.label}
            active={k.value === kind}
            onPress={() => setKind(k.value)}
            styles={styles}
          />
        ))}
      </View>
      <View style={styles.newRow}>
        <Pressable style={styles.newButton} onPress={() => onNewEntry('presenza')} accessibilityRole="button">
          <Text style={styles.newButtonText}>＋ Presenza</Text>
        </Pressable>
        <Pressable style={styles.newButton} onPress={() => onNewEntry('intervento')} accessibilityRole="button">
          <Text style={styles.newButtonText}>＋ Intervento</Text>
        </Pressable>
      </View>
      {shown.length > 0 && (
        <View style={styles.exportBox}>
          <Text style={styles.exportLabel}>Esporta {describeCount(shown.length, kind)}</Text>
          <View style={styles.exportRow}>
            {Object.entries(NOTEBOOK_FORMATS).map(([key, f]) => (
              <Chip key={key} label={f.label} active={format === key} onPress={() => setFormat(key)} styles={styles} />
            ))}
            <Pressable
              style={[styles.exportButton, exporting && styles.disabled]}
              onPress={exportNow}
              disabled={exporting}
              accessibilityRole="button"
              accessibilityLabel={`Esporta in ${NOTEBOOK_FORMATS[format].label}`}
            >
              {exporting ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={styles.exportButtonText}>Esporta</Text>
              )}
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle} accessibilityRole="header">
          Taccuino di campo
        </Text>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
          <Text style={styles.headerAction}>Chiudi</Text>
        </Pressable>
      </View>
      <FlatList
        style={styles.listBg}
        data={shown}
        keyExtractor={(r) => r.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {kind === 'intervento'
              ? 'Nessun intervento registrato. Usa “＋ Intervento” per annotare tagli, eradicazioni e controlli.'
              : 'Nessuna voce. Usa il pulsante “Segnala” sulla mappa quando trovi una specie invasiva.'}
          </Text>
        }
        renderItem={({ item }) => {
          const isIntervention = entryKind(item) === 'intervento';
          const date = new Date(item.createdAt).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' });
          return (
            <View style={styles.card}>
              <View
                style={styles.cardRow}
                accessible
                accessibilityLabel={`${entryTitle(item)}, ${item.commonName}, ${date}${
                  item.sent?.length ? ', inviata' : ''
                }`}
              >
                {item.photos[0] ? (
                  <Image source={{ uri: item.photos[0] }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.noThumb]}>
                    <Text style={styles.noThumbText}>senza foto</Text>
                  </View>
                )}
                <View style={styles.cardText}>
                  <Text style={[styles.kind, isIntervention && styles.kindIntervention]}>{entryTitle(item)}</Text>
                  <Text style={styles.title}>{item.commonName}</Text>
                  <Text style={styles.scientific}>{item.scientificName}</Text>
                  <Text style={styles.meta}>{date}</Text>
                  <Text style={styles.meta}>
                    {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
                    {item.accuracy != null ? ` · ± ${Math.round(item.accuracy)} m` : ''}
                  </Text>
                  {item.note?.trim() ? (
                    <Text style={styles.note} numberOfLines={3}>
                      {item.note.trim()}
                    </Text>
                  ) : null}
                  {item.sent?.length ? (
                    <Text style={styles.sent}>
                      Inviata: {[...new Set(item.sent.map((s) => CHANNEL_LABEL[s.channel]))].join(', ')}
                    </Text>
                  ) : (
                    !isIntervention && <Text style={styles.notSent}>Non ancora inviata</Text>
                  )}
                </View>
              </View>
              <View style={styles.actions}>
                {!isIntervention && (
                  <Action
                    label="Email"
                    a11y="Invia per email al Ministero"
                    onPress={async () => (await sendByEmail(item)) && reload()}
                    styles={styles}
                  />
                )}
                <Action label="Condividi" onPress={async () => (await shareReport(item)) && reload()} styles={styles} />
                <Action label="Mappa" a11y="Mostra sulla mappa" onPress={() => onShowOnMap(item)} styles={styles} />
                <Action label="Elimina" destructive onPress={() => confirmDelete(item)} styles={styles} />
              </View>
            </View>
          );
        }}
      />
    </Modal>
  );
}

function describeCount(n, kind) {
  if (kind === 'presenza') return n === 1 ? '1 presenza' : `${n} presenze`;
  if (kind === 'intervento') return n === 1 ? '1 intervento' : `${n} interventi`;
  return n === 1 ? '1 voce' : `${n} voci`;
}

function Chip({ label, active, onPress, styles }) {
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

function Action({ label, a11y, onPress, destructive, styles }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={styles.action} accessibilityRole="button" accessibilityLabel={a11y}>
      <Text style={[styles.actionText, destructive && styles.destructive]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (c) =>
  StyleSheet.create({
    headerBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      backgroundColor: c.background,
    },
    headerTitle: { fontSize: 17, fontWeight: '700', color: c.text },
    headerAction: { fontSize: 16, color: c.primary, fontWeight: '600' },
    listBg: { backgroundColor: c.background },
    list: { padding: 16, flexGrow: 1 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { borderWidth: 1.5, borderColor: c.chipBorder, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
    chipActive: { backgroundColor: c.primaryFill, borderColor: c.primaryFill },
    chipText: { fontSize: 14, color: c.primary },
    chipTextActive: { color: c.onPrimary, fontWeight: '600' },
    newRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    newButton: {
      flex: 1,
      borderWidth: 1.5,
      borderColor: c.primary,
      borderRadius: 12,
      paddingVertical: 10,
      alignItems: 'center',
    },
    newButtonText: { color: c.primary, fontWeight: '700', fontSize: 15 },
    exportBox: {
      marginTop: 12,
      marginBottom: 4,
      padding: 12,
      borderRadius: 12,
      backgroundColor: c.surfaceAlt,
    },
    exportLabel: { fontSize: 14, fontWeight: '600', color: c.text, marginBottom: 8 },
    exportRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
    exportButton: {
      marginLeft: 'auto',
      backgroundColor: c.primaryFill,
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    exportButtonText: { color: c.onPrimary, fontWeight: '700' },
    disabled: { opacity: 0.4 },
    empty: { textAlign: 'center', color: c.textMuted, marginTop: 40, lineHeight: 20 },
    card: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 12,
      marginTop: 12,
    },
    cardRow: { flexDirection: 'row' },
    thumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: c.placeholderBg },
    noThumb: { alignItems: 'center', justifyContent: 'center' },
    noThumbText: { fontSize: 11, color: c.placeholder },
    cardText: { flex: 1, marginLeft: 12 },
    kind: { fontSize: 12, fontWeight: '700', color: c.primary, textTransform: 'uppercase', letterSpacing: 0.3 },
    kindIntervention: { color: c.link },
    title: { fontSize: 15, fontWeight: '600', color: c.text, marginTop: 2 },
    scientific: { fontSize: 13, fontStyle: 'italic', color: c.textSecondary },
    meta: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    note: { fontSize: 13, color: c.textSecondary, marginTop: 4 },
    sent: { fontSize: 12, color: c.primary, marginTop: 4, fontWeight: '600' },
    notSent: { fontSize: 12, color: c.warning, marginTop: 4, fontWeight: '600' },
    actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
    action: { paddingVertical: 6, paddingHorizontal: 6 },
    actionText: { color: c.link, fontWeight: '600' },
    destructive: { color: c.danger },
  });
