import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useColors, useThemedStyles } from '../theme';

/**
 * Avviso discreto di un'operazione in corso (aggiornamento dei dati, lettura della posizione):
 * piccola pillola con rotellina e testo. `floating` aggiunge l'ombra per stare sopra la mappa;
 * senza, si appoggia su un pannello.
 */
export default function StatusPill({ label, floating = false, style }) {
  const colors = useColors();
  const styles = useThemedStyles(createStyles);
  return (
    <View
      style={[styles.pill, floating ? styles.floating : styles.inline, style]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
    >
      <ActivityIndicator size="small" color={colors.primary} style={styles.spinner} />
      <Text style={styles.text} maxFontSizeMultiplier={1.6}>
        {label}
      </Text>
    </View>
  );
}

const createStyles = (c) =>
  StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    floating: {
      backgroundColor: c.surface,
      shadowColor: '#000',
      shadowOpacity: c.shadowOpacity,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4,
    },
    inline: { backgroundColor: c.surfaceAlt },
    spinner: { transform: [{ scale: 0.8 }], marginRight: 6 },
    text: { color: c.textSecondary, fontSize: 13, fontWeight: '600' },
  });
