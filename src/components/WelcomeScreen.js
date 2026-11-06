import { useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemedStyles } from '../theme';

const REPO_URL = 'https://github.com/Anghelos98/ias-tracker';
export const PRIVACY_URL = 'https://anghelos98.github.io/ias-tracker/privacy.html';

const PAGES = [
  {
    title: 'Benvenuto in IAS Tracker',
    paragraphs: [
      'IAS Tracker mostra dove sono state segnalate in Italia le 49 piante esotiche invasive di rilevanza unionale: specie arrivate da altri continenti che si diffondono a danno degli ambienti naturali, dell’agricoltura e talvolta della salute.',
      'Per queste specie il Regolamento UE 1143/2014 e il D.Lgs. 230/2017 vietano di coltivarle, venderle, trasportarle e rilasciarle nell’ambiente.',
      'L’app è gratuita, senza pubblicità e open source.',
    ],
  },
  {
    title: 'Da dove vengono i dati',
    paragraphs: [
      'Le segnalazioni arrivano da GBIF, che riunisce i dati di iNaturalist, Pl@ntNet, erbari, università e banche dati regionali. Vengono aggiornate ogni settimana.',
      'Le schede delle specie sono di ISPRA, i confini delle regioni di ISTAT. Ogni segnalazione indica fonte, anno, precisione della posizione e licenza.',
      'Le identificazioni fatte solo da un algoritmo (Pl@ntNet) sono nascoste: puoi mostrarle dai Filtri.',
    ],
  },
  {
    title: 'Come si usa',
    items: [
      ['☰', 'Scegli una specie, oppure “Tutte le specie”, per vederne le segnalazioni sulla mappa.'],
      ['📍', '“Vicino a me” elenca le specie segnalate attorno a te.'],
      ['ⓘ', 'La scheda della specie spiega come riconoscerla e cosa dice la legge.'],
      ['▤', 'Il pulsante “Filtri” sceglie periodo e precisione delle segnalazioni ed esporta i dati.'],
      ['＋', 'Con “Segnala” invii posizione GPS e foto di una pianta al Ministero dell’Ambiente o a chi vuoi.'],
      [
        '▦',
        'Dall’elenco delle specie apri il rapporto per regione e il taccuino di campo, dove annoti presenze e interventi.',
      ],
    ],
  },
];

/** Presentazione in tre pagine, mostrata al primo avvio e riapribile da "Informazioni". */
export default function WelcomeScreen({ visible, onDone }) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  const [page, setPage] = useState(0);
  const last = page === PAGES.length - 1;
  const { title, paragraphs, items } = PAGES[page];

  const finish = () => {
    setPage(0);
    onDone();
  };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={finish}>
      <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.topRow}>
          <Text style={styles.brand}>IAS Tracker</Text>
          {!last && (
            <Pressable
              onPress={finish}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Salta la presentazione"
            >
              <Text style={styles.skip}>Salta</Text>
            </Pressable>
          )}
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          {paragraphs?.map((p) => (
            <Text key={p} style={styles.paragraph}>
              {p}
            </Text>
          ))}
          {items?.map(([icon, text]) => (
            <View key={text} style={styles.item} accessible accessibilityLabel={text}>
              <Text style={styles.itemIcon} allowFontScaling={false}>
                {icon}
              </Text>
              <Text style={styles.itemText}>{text}</Text>
            </View>
          ))}
          {page === 0 && (
            <>
              <Pressable onPress={() => Linking.openURL(REPO_URL).catch(() => {})} accessibilityRole="link">
                <Text style={styles.link}>Codice sorgente su GitHub ↗</Text>
              </Pressable>
              <Pressable onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})} accessibilityRole="link">
                <Text style={styles.link}>Informativa sulla privacy ↗</Text>
              </Pressable>
            </>
          )}
        </ScrollView>

        <View style={styles.dots} accessible accessibilityLabel={`Pagina ${page + 1} di ${PAGES.length}`}>
          {PAGES.map((p, i) => (
            <View key={p.title} style={[styles.dot, i === page && styles.dotActive]} />
          ))}
        </View>
        <View style={styles.buttons}>
          {page > 0 && (
            <Pressable style={styles.secondary} onPress={() => setPage(page - 1)} accessibilityRole="button">
              <Text style={styles.secondaryText}>Indietro</Text>
            </Pressable>
          )}
          <Pressable
            style={styles.primary}
            onPress={last ? finish : () => setPage(page + 1)}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>{last ? 'Inizia' : 'Avanti'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (c) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background, paddingHorizontal: 24 },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    brand: { fontSize: 13, fontWeight: '800', color: c.primary, letterSpacing: 1, textTransform: 'uppercase' },
    skip: { fontSize: 15, color: c.textMuted },
    body: { flex: 1, marginTop: 24 },
    bodyContent: { paddingBottom: 16 },
    title: { fontSize: 26, fontWeight: '800', color: c.text, marginBottom: 18 },
    paragraph: { fontSize: 16, lineHeight: 24, color: c.text, marginBottom: 14 },
    item: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
    itemIcon: { fontSize: 20, width: 36, color: c.primary, textAlign: 'center' },
    itemText: { flex: 1, fontSize: 16, lineHeight: 23, color: c.text },
    link: { fontSize: 15, color: c.link, marginTop: 4, paddingVertical: 6 },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginVertical: 14 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.chipBorder },
    dotActive: { backgroundColor: c.primaryFill, width: 20 },
    buttons: { flexDirection: 'row', gap: 10 },
    primary: { flex: 1, backgroundColor: c.primaryFill, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
    primaryText: { color: c.onPrimary, fontSize: 16, fontWeight: '700' },
    secondary: {
      flex: 1,
      borderWidth: 1.5,
      borderColor: c.primary,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    },
    secondaryText: { color: c.primary, fontSize: 16, fontWeight: '700' },
  });
