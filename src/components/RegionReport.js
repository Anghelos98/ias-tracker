import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { describeFilters } from './FiltersPanel';
import { loadAllDatasets } from '../data/allSpecies';
import { regionReport, regionReportCSV, regionSummaries } from '../data/regionReport';
import { useColors, useThemedStyles } from '../theme';
import { shareTextFile } from '../utils/shareFile';

const CSV = { mimeType: 'text/csv', uti: 'public.comma-separated-values-text' };

function plural(n, one, many) {
  return `${n.toLocaleString('it-IT')} ${n === 1 ? one : many}`;
}

/**
 * Rapporto per regione: elenco delle regioni con numero di segnalazioni e di specie; per la
 * regione scelta, andamento negli anni e specie presenti. Rispetta i filtri attivi.
 */
export default function RegionReport({ visible, speciesList, manifest, filters, onShowSpecies, onInfo, onClose }) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useThemedStyles(createStyles);
  const [datasets, setDatasets] = useState(null);
  const [failed, setFailed] = useState(false);
  const [region, setRegion] = useState(null);

  useEffect(() => {
    if (!visible) return undefined;
    let active = true;
    loadAllDatasets(speciesList, manifest)
      .then((d) => {
        if (active) setDatasets(d);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [visible, speciesList, manifest]);

  const summaries = useMemo(() => (datasets ? regionSummaries(datasets, filters) : []), [datasets, filters]);
  const report = useMemo(
    () => (datasets && region ? regionReport(datasets, filters, region.code) : null),
    [datasets, filters, region],
  );
  const filtersText = describeFilters(filters);

  const share = useCallback(async () => {
    if (!report || !region) return;
    try {
      const date = new Date().toISOString().slice(0, 10);
      const slug = region.name.toLowerCase().replace(/[^a-z]+/g, '-');
      await shareTextFile(`ias-tracker_${slug}_${date}.csv`, regionReportCSV(report, region.name), CSV);
    } catch {
      Alert.alert('Esportazione non riuscita', 'Non è stato possibile creare o condividere il file.');
    }
  }, [report, region]);

  const close = () => {
    setRegion(null);
    onClose();
  };

  let body;
  if (failed) {
    body = <Text style={styles.empty}>Non è stato possibile caricare i dati.</Text>;
  } else if (!datasets) {
    body = (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  } else if (!region) {
    body = (
      <FlatList
        style={styles.listBg}
        data={summaries}
        keyExtractor={(s) => String(s.region.code)}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          <Text style={styles.intro}>
            Segnalazioni GBIF per regione{filtersText ? ` (filtri: ${filtersText})` : ''}. Tocca una regione per vedere
            specie e andamento.
          </Text>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => setRegion(item.region)}
            accessibilityRole="button"
            accessibilityLabel={`${item.region.name}: ${plural(item.total, 'segnalazione', 'segnalazioni')}, ${plural(
              item.species,
              'specie',
              'specie',
            )}`}
          >
            <Text style={styles.regionName}>{item.region.name}</Text>
            <View style={styles.rowRight}>
              <Text style={[styles.count, item.total === 0 && styles.zero]}>{item.total.toLocaleString('it-IT')}</Text>
              <Text style={styles.countSub}>{plural(item.species, 'specie', 'specie')}</Text>
            </View>
          </Pressable>
        )}
      />
    );
  } else {
    body = (
      <FlatList
        style={styles.listBg}
        data={report.species}
        keyExtractor={(s) => s.species.slug}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          <View>
            <Text style={styles.summary}>
              {plural(report.total, 'segnalazione', 'segnalazioni')} di{' '}
              {plural(report.species.length, 'specie', 'specie')}
              {filtersText ? ` (filtri: ${filtersText})` : ''}
            </Text>
            {report.total > 0 && <Trend report={report} styles={styles} />}
            {report.total > 0 && (
              <Pressable onPress={share} style={styles.shareButton} accessibilityRole="button">
                <Text style={styles.shareText}>Esporta la tabella (CSV)</Text>
              </Pressable>
            )}
            <Text style={styles.sectionTitle} accessibilityRole="header">
              Specie segnalate
            </Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>Nessuna segnalazione con i filtri attivi.</Text>}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => {
          const years =
            item.firstYear == null
              ? 'anno non indicato'
              : item.firstYear === item.lastYear
                ? `nel ${item.firstYear}`
                : `dal ${item.firstYear} al ${item.lastYear}`;
          return (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => {
                setRegion(null);
                onShowSpecies(item.species, region);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${item.species.commonName}: ${plural(item.count, 'segnalazione', 'segnalazioni')}, ${years}`}
              accessibilityHint="Mostra sulla mappa le segnalazioni della specie in questa regione"
            >
              <View style={styles.rowText}>
                <Text style={styles.common}>{item.species.commonName}</Text>
                <Text style={styles.scientific}>{item.species.scientificName}</Text>
                <Text style={styles.meta}>{years}</Text>
              </View>
              <Text style={styles.count}>{item.count.toLocaleString('it-IT')}</Text>
              <Pressable
                onPress={() => {
                  setRegion(null);
                  onInfo(item.species);
                }}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`Scheda di ${item.species.commonName}`}
              >
                <Text style={styles.info} allowFontScaling={false}>
                  ⓘ
                </Text>
              </Pressable>
            </Pressable>
          );
        }}
      />
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={styles.header}>
        {region ? (
          <Pressable
            onPress={() => setRegion(null)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Tutte le regioni"
          >
            <Text style={styles.headerAction}>‹ Regioni</Text>
          </Pressable>
        ) : (
          <View style={styles.headerSpacer} />
        )}
        <Text style={styles.headerTitle} accessibilityRole="header" numberOfLines={1}>
          {region ? region.name : 'Rapporto per regione'}
        </Text>
        <Pressable onPress={close} hitSlop={12} accessibilityRole="button">
          <Text style={styles.headerAction}>Chiudi</Text>
        </Pressable>
      </View>
      {body}
    </Modal>
  );
}

/** Grafico a barre delle segnalazioni per anno (ultimi anni). */
function Trend({ report, styles }) {
  const max = Math.max(1, ...report.trend.map((t) => t.count));
  const first = report.trend[0].year;
  const last = report.trend[report.trend.length - 1].year;
  const peak = report.trend.reduce((a, b) => (b.count > a.count ? b : a), report.trend[0]);
  const description =
    `Segnalazioni per anno dal ${first} al ${last}: ` +
    report.trend.map((t) => `${t.year}, ${t.count}`).join('; ') +
    `. Anno con più segnalazioni: ${peak.year}.`;
  return (
    <View style={styles.trend}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        Andamento negli anni
      </Text>
      <View style={styles.chart} accessible accessibilityRole="image" accessibilityLabel={description}>
        {report.trend.map((t) => (
          <View key={t.year} style={styles.barSlot}>
            <View style={[styles.bar, { height: `${(t.count / max) * 100}%` }, t.count === 0 && styles.barEmpty]} />
          </View>
        ))}
      </View>
      <View style={styles.axis} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Text style={styles.axisText}>{first}</Text>
        <Text style={styles.axisText}>max {max.toLocaleString('it-IT')}</Text>
        <Text style={styles.axisText}>{last}</Text>
      </View>
      <Text style={styles.note}>
        {report.earlier > 0 ? `Prima del ${first}: ${plural(report.earlier, 'segnalazione', 'segnalazioni')}. ` : ''}
        {report.undated > 0 ? `Senza anno: ${report.undated.toLocaleString('it-IT')}. ` : ''}
        L’aumento recente riflette anche la crescita di app come iNaturalist e Pl@ntNet, non solo la diffusione delle
        specie.
      </Text>
    </View>
  );
}

const createStyles = (c) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      backgroundColor: c.background,
      gap: 12,
    },
    headerSpacer: { width: 60 },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: c.text },
    headerAction: { fontSize: 16, color: c.primary, fontWeight: '600' },
    listBg: { flex: 1, backgroundColor: c.background, paddingHorizontal: 16 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.background },
    intro: { fontSize: 13, color: c.textSecondary, marginTop: 12, marginBottom: 6, lineHeight: 18 },
    summary: { fontSize: 15, color: c.text, marginTop: 14, fontWeight: '600' },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: c.primary, marginTop: 18, marginBottom: 6 },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 4, borderRadius: 8 },
    rowPressed: { backgroundColor: c.surfaceAlt },
    rowRight: { marginLeft: 'auto', alignItems: 'flex-end' },
    rowText: { flex: 1, paddingRight: 8 },
    regionName: { fontSize: 15, fontWeight: '500', color: c.text },
    count: { fontSize: 15, fontWeight: '700', color: c.primary, textAlign: 'right' },
    zero: { color: c.textMuted, fontWeight: '400' },
    countSub: { fontSize: 12, color: c.textMuted },
    common: { fontSize: 15, fontWeight: '500', color: c.text },
    scientific: { fontSize: 13, fontStyle: 'italic', color: c.textSecondary, marginTop: 1 },
    meta: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    info: { fontSize: 22, color: c.link, paddingLeft: 12 },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: c.border },
    empty: { textAlign: 'center', color: c.textMuted, padding: 24, backgroundColor: c.background },
    trend: { marginTop: 4 },
    chart: { flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 3 },
    barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
    bar: { backgroundColor: c.primaryFill, borderTopLeftRadius: 3, borderTopRightRadius: 3, minHeight: 2 },
    barEmpty: { backgroundColor: c.border },
    axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
    axisText: { fontSize: 11, color: c.textMuted },
    note: { fontSize: 12, color: c.textMuted, marginTop: 8, lineHeight: 17 },
    shareButton: {
      alignSelf: 'flex-start',
      marginTop: 12,
      borderWidth: 1.5,
      borderColor: c.primary,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    shareText: { color: c.primary, fontWeight: '600' },
  });
