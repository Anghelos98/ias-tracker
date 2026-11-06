import { useMemo } from 'react';
import { useColorScheme } from 'react-native';

// Colori dell'app per il tema chiaro e quello scuro (segue l'aspetto scelto nel telefono).
// I colori del testo hanno un contrasto di almeno 4,5:1 con lo sfondo su cui compaiono
// (livello AA delle linee guida WCAG 2.1).

export const LIGHT = {
  scheme: 'light',
  background: '#ffffff',
  surface: '#ffffff', // barre e schede sopra la mappa
  surfaceAlt: '#f1f3f4', // campi di ricerca e di testo, righe premute
  text: '#1b1b1b',
  textSecondary: '#555555',
  textMuted: '#6b6b6b',
  border: '#e0e0e0',
  primary: '#2e7d32', // testo e bordi verdi
  primaryFill: '#2e7d32', // pulsanti pieni (testo bianco sopra)
  onPrimary: '#ffffff',
  onPrimarySoft: '#e6f4ea',
  selected: '#e6f4ea',
  chipBorder: '#c8d6c9',
  link: '#1565c0',
  warning: '#9a5b00',
  orange: '#c25400',
  danger: '#c62828',
  olive: '#6f6e17',
  neutral: '#616161',
  disclaimer: '#8d6e00',
  hintImportantBg: '#fff3e0',
  hintImportantText: '#7a4300',
  backdrop: 'rgba(0,0,0,0.3)',
  handle: '#cccccc',
  placeholderBg: '#eeeeee',
  placeholder: '#6b6b6b',
  mapBackground: '#f2efe9',
  shadowOpacity: 0.15,
};

export const DARK = {
  scheme: 'dark',
  background: '#121212',
  surface: '#1e1e1e',
  surfaceAlt: '#2a2a2a',
  text: '#e8e8e8',
  textSecondary: '#b0b0b0',
  textMuted: '#9a9a9a',
  border: '#333333',
  primary: '#81c784',
  primaryFill: '#2e7d32',
  onPrimary: '#ffffff',
  onPrimarySoft: '#d7eedb',
  selected: '#1f3324',
  chipBorder: '#3d5240',
  link: '#64b5f6',
  warning: '#ffb74d',
  orange: '#ffa726',
  danger: '#e57373',
  olive: '#d4e157',
  neutral: '#bdbdbd',
  disclaimer: '#ffd54f',
  hintImportantBg: '#3a2a12',
  hintImportantText: '#ffcc80',
  backdrop: 'rgba(0,0,0,0.6)',
  handle: '#555555',
  placeholderBg: '#2a2a2a',
  placeholder: '#9a9a9a',
  mapBackground: '#1d1f21',
  shadowOpacity: 0.4,
};

/** Colori del tema in uso. */
export function useColors() {
  return useColorScheme() === 'dark' ? DARK : LIGHT;
}

/**
 * Stili calcolati dai colori del tema. `factory` deve essere definita fuori dal componente
 * (funzione stabile): gli stili vengono ricreati solo quando cambia il tema.
 */
export function useThemedStyles(factory) {
  const colors = useColors();
  return useMemo(() => factory(colors), [factory, colors]);
}
