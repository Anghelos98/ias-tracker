import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Spazio da lasciare sopra l'intestazione di una schermata aperta con
 * `<Modal presentationStyle="pageSheet">`.
 *
 * Su iOS la scheda parte già sotto la barra di stato: non serve spazio in più.
 * Su Android l'app disegna da bordo a bordo e la Modal occupa tutto lo schermo:
 * senza questo spazio l'intestazione finisce sotto la barra di stato.
 *
 * @returns {number} punti da aggiungere al margine superiore dell'intestazione
 */
export default function useSheetTopInset() {
  const insets = useSafeAreaInsets();
  return Platform.OS === 'android' ? insets.top : 0;
}
