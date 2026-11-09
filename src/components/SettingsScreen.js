import { useEffect, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useSheetTopInset from '../hooks/useSheetTopInset';

import { DIAGNOSTICS_ENABLED, clearDiagnostics, diagnosticsCount, shareDiagnostics } from '../diagnostics/log';
import StatusPill from './StatusPill';
import { REPO_URL, PRIVACY_URL } from './WelcomeScreen';
import { SIGNATURE_MAX } from '../data/preferences';
import { lastCheckTime } from '../data/remote';
import { useColors, useThemedStyles } from '../theme';

const APP_VERSION = require('../../app.json').expo.version;

const THEME_OPTIONS = [
  { value: 'auto', label: 'Automatico' },
  { value: 'light', label: 'Chiaro' },
  { value: 'dark', label: 'Scuro' },
];
const MAP_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'satellite', label: 'Satellite' },
  { value: 'hybrid', label: 'Ibrida' },
];

/** Esito dell'aggiornamento manuale, in parole semplici. */
const UPDATE_MESSAGES = {
  updated: 'Dati aggiornati.',
  current: 'I dati sono già aggiornati.',
  incomplete: 'Aggiornamento parziale: i file mancanti verranno riscaricati al prossimo tentativo.',
  offline: 'Servizio non raggiungibile. Controlla la connessione e riprova.',
  unsupported: 'Sono disponibili dati in un formato nuovo: aggiorna l’app per riceverli.',
};

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatCheck(ms) {
  const date = new Date(ms);
  const time = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const today = new Date().toDateString() === date.toDateString();
  return today ? `oggi alle ${time}` : `${date.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} alle ${time}`;
}

/**
 * Impostazioni: dati (aggiornamento manuale, eliminazione dei dati scaricati), mappa,
 * aspetto, firma delle segnalazioni, avvisi delle novità e informazioni sull'app.
 * Lo stato vive in App.js: questa schermata mostra e modifica i valori.
 */
export default function SettingsScreen({
  visible,
  onClose,
  dataDate,
  updating,
  onUpdateNow,
  onClearData,
  mapType,
  onChangeMapType,
  showGrid,
  onToggleGrid,
  filtersSummary,
  onResetFilters,
  theme,
  onChangeTheme,
  signature,
  onChangeSignature,
  notify,
  canNotify,
  onToggleNotify,
  onOpenWelcome,
}) {
  const insets = useSafeAreaInsets();
  const topInset = useSheetTopInset();
  const colors = useColors();
  const styles = useThemedStyles(createStyles);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);
  const [lastCheck, setLastCheck] = useState(null);

  // Esito dell'ultimo aggiornamento manuale: vale solo finché la schermata resta aperta.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setResult(null);
  }

  useEffect(() => {
    if (!visible || checking) return undefined;
    let active = true;
    lastCheckTime().then((t) => {
      if (active) setLastCheck(t);
    });
    return () => {
      active = false;
    };
  }, [visible, checking, dataDate]);

  const busy = checking || updating;

  const updateNow = async () => {
    if (busy) return;
    setChecking(true);
    setResult(null);
    try {
      const { status } = await onUpdateNow();
      setResult(UPDATE_MESSAGES[status] ?? null);
    } catch {
      setResult(UPDATE_MESSAGES.offline);
    } finally {
      setChecking(false);
    }
  };

  const confirmClear = () =>
    Alert.alert(
      'Eliminare i dati scaricati?',
      'L’app userà i dati inclusi nell’installazione finché non li riscaricherà al prossimo aggiornamento. ' +
        'Il taccuino di campo e le impostazioni non vengono toccati.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            try {
              await onClearData();
              setResult('Dati scaricati eliminati.');
            } catch {
              Alert.alert('Operazione non riuscita', 'Non è stato possibile eliminare i dati scaricati.');
            }
          },
        },
      ],
    );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.headerBar, { paddingTop: 14 + topInset }]}>
        <Text style={styles.headerTitle} accessibilityRole="header">
          Impostazioni
        </Text>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
          <Text style={styles.headerAction}>Chiudi</Text>
        </Pressable>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Dati */}
        <Section title="Dati" styles={styles}>
          <Text style={styles.rowTitle}>Aggiornamento dei dati</Text>
          <Text style={styles.description}>
            I dati dell’app vengono aggiornati ogni 12 ore per impostazione predefinita.
          </Text>
          <Text style={styles.meta}>
            Segnalazioni GBIF aggiornate al {formatDate(dataDate)}
            {lastCheck ? ` · ultimo controllo ${formatCheck(lastCheck)}` : ''}
          </Text>
          {busy ? (
            <StatusPill label="Aggiornamento dei dati in corso…" style={styles.status} />
          ) : (
            <Pressable style={styles.button} onPress={updateNow} accessibilityRole="button">
              <Text style={styles.buttonText}>Aggiorna ora</Text>
            </Pressable>
          )}
          {result && !busy && (
            <Text style={styles.result} accessibilityLiveRegion="polite">
              {result}
            </Text>
          )}
          <Divider styles={styles} />
          <Pressable
            onPress={confirmClear}
            disabled={busy}
            style={busy && styles.disabled}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
          >
            <Text style={styles.destructive}>Elimina i dati scaricati</Text>
          </Pressable>
          <Text style={styles.description}>
            Torna ai dati inclusi nell’app. Utile se i dati sembrano incompleti o per liberare spazio.
          </Text>
        </Section>

        {/* Mappa */}
        <Section title="Mappa" styles={styles}>
          <Text style={styles.rowTitle}>Tipo di mappa</Text>
          <Choices options={MAP_OPTIONS} value={mapType} onChange={onChangeMapType} label="Tipo di mappa" styles={styles} />
          <Text style={styles.description}>
            La vista satellitare aiuta a riconoscere boschi, corsi d’acqua e campi durante i sopralluoghi.
          </Text>
          <Divider styles={styles} />
          <SwitchRow
            title="Griglia ufficiale ISPRA"
            description="Mostra le celle di 10×10 km in cui ISPRA registra la specie scelta."
            value={showGrid}
            onChange={onToggleGrid}
            styles={styles}
          />
          <Divider styles={styles} />
          <Text style={styles.rowTitle}>Filtri delle segnalazioni</Text>
          <Text style={styles.description}>
            {filtersSummary
              ? `Attivi: ${filtersSummary}. Si cambiano dal pulsante Filtri sulla mappa.`
              : 'Sono mostrate tutte le segnalazioni verificate. Si cambiano dal pulsante Filtri sulla mappa.'}
          </Text>
          {filtersSummary ? (
            <Pressable style={styles.button} onPress={onResetFilters} accessibilityRole="button">
              <Text style={styles.buttonText}>Ripristina i filtri predefiniti</Text>
            </Pressable>
          ) : null}
        </Section>

        {/* Aspetto */}
        <Section title="Aspetto" styles={styles}>
          <Text style={styles.rowTitle}>Tema</Text>
          <Choices options={THEME_OPTIONS} value={theme} onChange={onChangeTheme} label="Tema" styles={styles} />
          <Text style={styles.description}>Automatico segue l’impostazione chiara o scura del telefono.</Text>
        </Section>

        {/* Segnalazioni */}
        <Section title="Segnalazioni" styles={styles}>
          <Text style={styles.rowTitle}>Firma (facoltativa)</Text>
          <TextInput
            style={styles.input}
            value={signature}
            onChangeText={onChangeSignature}
            placeholder="Es. Mario Rossi, Comune di …"
            placeholderTextColor={colors.placeholder}
            maxLength={SIGNATURE_MAX}
            autoCorrect={false}
            returnKeyType="done"
            accessibilityLabel="Firma delle segnalazioni"
          />
          <Text style={styles.description}>
            Nome ed eventuale ente, aggiunti in fondo alle segnalazioni e nel taccuino: chi le riceve sa chi
            contattare. È salvata sul telefono e non viene inviata allo sviluppatore.
          </Text>
        </Section>

        {/* Notifiche */}
        <Section title="Notifiche" styles={styles}>
          <SwitchRow
            title="Avvisi delle novità"
            description={
              canNotify
                ? 'Un avviso quando l’aggiornamento settimanale porta novità sulle specie o regioni che segui.'
                : 'Segui almeno una specie (dalla sua scheda) o una regione (dal rapporto per regione) per attivarli.'
            }
            value={notify}
            onChange={onToggleNotify}
            disabled={!canNotify && !notify}
            styles={styles}
          />
        </Section>

        {/* Diagnostica: solo nelle build di prova (beta, RC) */}
        {DIAGNOSTICS_ENABLED && <DiagnosticsSection styles={styles} />}

        {/* Informazioni */}
        <Section title="Informazioni" styles={styles}>
          <LinkRow label="Presentazione dell’app" onPress={onOpenWelcome} styles={styles} />
          <LinkRow label="Informativa sulla privacy ↗" onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})} styles={styles} />
          <LinkRow label="Codice sorgente su GitHub ↗" onPress={() => Linking.openURL(REPO_URL).catch(() => {})} styles={styles} />
          <Text style={styles.meta}>IAS Tracker {APP_VERSION} · gratuita e open source (licenza MIT)</Text>
        </Section>
      </ScrollView>
    </Modal>
  );
}

/**
 * Registro di diagnostica (vedi src/diagnostics/log.js): presente solo nelle build di prova.
 * Il registro resta sul telefono finché l'utente non lo condivide.
 */
function DiagnosticsSection({ styles }) {
  // la Modal monta il contenuto a ogni apertura delle Impostazioni: il conteggio è sempre fresco
  const [count, setCount] = useState(diagnosticsCount);
  const [message, setMessage] = useState(null);

  const share = async () => {
    try {
      await shareDiagnostics();
    } catch {
      setMessage('Non è stato possibile condividere il registro.');
    }
  };
  const confirmClear = () =>
    Alert.alert('Cancellare il registro?', 'Gli eventi annotati finora vengono eliminati dal telefono.', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Cancella',
        style: 'destructive',
        onPress: () => {
          clearDiagnostics();
          setCount(diagnosticsCount());
          setMessage('Registro cancellato.');
        },
      },
    ]);

  return (
    <Section title="Diagnostica (versione di prova)" styles={styles}>
      <Text style={styles.rowTitle}>Registro degli eventi</Text>
      <Text style={styles.description}>
        Questa versione di prova annota errori, rallentamenti e le azioni principali (senza posizioni, note o
        foto). Il registro resta sul telefono: condividilo per segnalare un problema.
      </Text>
      <Text style={styles.meta}>{count === 1 ? '1 evento annotato' : `${count} eventi annotati`}</Text>
      <Pressable style={styles.button} onPress={share} accessibilityRole="button">
        <Text style={styles.buttonText}>Condividi registro</Text>
      </Pressable>
      {message && (
        <Text style={styles.result} accessibilityLiveRegion="polite">
          {message}
        </Text>
      )}
      <Divider styles={styles} />
      <Pressable onPress={confirmClear} accessibilityRole="button">
        <Text style={styles.destructive}>Cancella registro</Text>
      </Pressable>
    </Section>
  );
}

function Section({ title, children, styles }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Divider({ styles }) {
  return <View style={styles.divider} />;
}

function Choices({ options, value, onChange, label, styles }) {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            style={[styles.segment, active && styles.segmentActive]}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SwitchRow({ title, description, value, onChange, disabled = false, styles }) {
  return (
    <View style={styles.switchRow}>
      <View style={styles.flex}>
        <Text style={[styles.rowTitle, disabled && styles.disabled]}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} accessibilityLabel={title} />
    </View>
  );
}

function LinkRow({ label, onPress, styles }) {
  return (
    <Pressable onPress={onPress} style={styles.linkRow} accessibilityRole="button">
      <Text style={styles.link}>{label}</Text>
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
    scroll: { backgroundColor: c.background },
    content: { padding: 16 },
    flex: { flex: 1 },
    section: { marginBottom: 22 },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 6,
      marginLeft: 4,
    },
    card: {
      backgroundColor: c.surface,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      padding: 14,
    },
    rowTitle: { fontSize: 15, fontWeight: '600', color: c.text },
    description: { fontSize: 13, lineHeight: 18, color: c.textSecondary, marginTop: 4 },
    meta: { fontSize: 12, color: c.textMuted, marginTop: 6 },
    result: { fontSize: 13, color: c.primary, fontWeight: '600', marginTop: 8 },
    status: { marginTop: 10 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginVertical: 12 },
    button: {
      alignSelf: 'flex-start',
      marginTop: 10,
      borderWidth: 1.5,
      borderColor: c.primary,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    buttonText: { color: c.primary, fontWeight: '600', fontSize: 15 },
    destructive: { color: c.danger, fontWeight: '600', fontSize: 15 },
    disabled: { opacity: 0.4 },
    segmented: { flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: 10, padding: 3, marginTop: 8 },
    segment: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
    segmentActive: { backgroundColor: c.primaryFill },
    segmentText: { fontSize: 14, fontWeight: '600', color: c.primary },
    segmentTextActive: { color: c.onPrimary },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    input: {
      backgroundColor: c.surfaceAlt,
      color: c.text,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      marginTop: 8,
    },
    linkRow: { paddingVertical: 8 },
    link: { color: c.link, fontSize: 15, fontWeight: '500' },
  });
