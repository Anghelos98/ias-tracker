import { Component, Fragment, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { clearDownloadedData } from '../data/remote';
import { diagError } from '../diagnostics/log';
import { useThemedStyles } from '../theme';

/**
 * Rete di sicurezza per gli errori durante il disegno delle schermate. Senza, in una build di
 * produzione un errore imprevisto chiude l'app; così l'utente vede un messaggio e può
 * riprovare. Se l'errore si ripete perché dipende dai dati scaricati (rovinati, o con una
 * forma che questa versione non si aspetta), può eliminarli e tornare a quelli inclusi
 * nell'app, come dalle Impostazioni. Taccuino e preferenze non vengono toccati.
 *
 * Non intercetta gli errori nelle funzioni dei pulsanti e nelle operazioni asincrone: quelli
 * vanno gestiti dove avvengono (try/catch, .catch).
 */
export default class ErrorBoundary extends Component {
  state = { error: null, attempt: 0 };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // registro di diagnostica (solo build di prova): errore e punto della schermata
    const where = (info?.componentStack ?? '').trim().split('\n').slice(0, 6).join('\n');
    diagError('schermata', `${error?.name ?? 'Errore'}: ${error?.message ?? error}${where ? `\n${where}` : ''}`);
  }

  retry = () => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));

  clearDataAndRetry = async () => {
    try {
      await clearDownloadedData();
    } catch {
      // si riprova comunque: al peggio ricompare questa schermata
    }
    this.retry();
  };

  render() {
    if (this.state.error) return <ErrorScreen onRetry={this.retry} onClearData={this.clearDataAndRetry} />;
    // Chiave nuova a ogni tentativo: l'app riparte da capo, senza lo stato che ha causato l'errore.
    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
  }
}

function ErrorScreen({ onRetry, onClearData }) {
  const styles = useThemedStyles(createStyles);
  const [clearing, setClearing] = useState(false);
  const clear = () => {
    setClearing(true);
    onClearData();
  };
  return (
    <View style={styles.screen}>
      <Text style={styles.title} accessibilityRole="header">
        Qualcosa non ha funzionato
      </Text>
      <Text style={styles.text}>
        Si è verificato un errore imprevisto. Le voci del taccuino e le impostazioni restano salvate sul telefono.
      </Text>
      <Pressable
        style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
        onPress={onRetry}
        disabled={clearing}
        accessibilityRole="button"
      >
        <Text style={styles.primaryText}>Riprova</Text>
      </Pressable>
      <Text style={styles.hint}>
        Se l’errore si ripete, elimina i dati delle segnalazioni scaricati: l’app userà quelli inclusi
        nell’installazione e li scaricherà di nuovo al prossimo aggiornamento.
      </Text>
      <Pressable
        style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
        onPress={clear}
        disabled={clearing}
        accessibilityRole="button"
        accessibilityState={{ busy: clearing, disabled: clearing }}
      >
        {clearing ? (
          <ActivityIndicator />
        ) : (
          <Text style={styles.secondaryText}>Elimina i dati scaricati e riprova</Text>
        )}
      </Pressable>
    </View>
  );
}

const createStyles = (c) =>
  StyleSheet.create({
    screen: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: c.background },
    title: { fontSize: 22, fontWeight: '700', color: c.text, marginBottom: 12 },
    text: { fontSize: 16, lineHeight: 22, color: c.textSecondary, marginBottom: 24 },
    primary: { backgroundColor: c.primaryFill, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
    primaryText: { color: c.onPrimary, fontSize: 16, fontWeight: '600' },
    hint: { fontSize: 14, lineHeight: 20, color: c.textMuted, marginTop: 28, marginBottom: 12 },
    secondary: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      minHeight: 50,
      justifyContent: 'center',
    },
    secondaryText: { color: c.primary, fontSize: 16, fontWeight: '600' },
    pressed: { opacity: 0.7 },
  });
