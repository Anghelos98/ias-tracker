import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { filterFollowed, hasFollows, latestWeeks, summarize, weeksSince } from '../data/news';
import { REGIONS } from '../data/regions';
import { useColors, useThemedStyles } from '../theme';

const REGION_BY_CODE = new Map(REGIONS.map((r) => [r.code, r]));
const regionName = (code) => REGION_BY_CODE.get(Number(code))?.name ?? 'Fuori dai confini regionali';

function plural(n, one, many) {
  return `${n.toLocaleString('it-IT')} ${n === 1 ? one : many}`;
}

function dateIt(iso) {
  return iso ? new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }) : '';
}

/**
 * Novità della settimana (segnalazioni comparse su GBIF dall'aggiornamento precedente) e
 * specie / regioni seguite dall'utente, con l'avviso facoltativo.
 */
export default function NewsScreen({
  visible,
  news,
  follows,
  seenAtOpen,
  speciesList,
  notify,
  onToggleNotify,
  onToggleFollow,
  onShowSpecies,
  onInfo,
  onShow,
  onClose,
}) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  const [tab, setTab] = useState('tutte'); // tutte | seguite
  const [editing, setEditing] = useState(false);
  const speciesBySlug = useMemo(() => new Map(speciesList.map((s) => [s.slug, s])), [speciesList]);

  const week = useMemo(() => summarize(latestWeeks(news)), [news]);
  // senza una visita precedente si mostra l'ultima settimana, non tutto lo storico
  const unseen = useMemo(() => (seenAtOpen ? weeksSince(news, seenAtOpen) : []), [news, seenAtOpen]);
  const followed = useMemo(() => {
    // per le seguite: le novità non ancora viste, altrimenti quelle dell'ultima settimana
    const source = unseen.length ? summarize(unseen) : week;
    return { ...filterFollowed(source, follows), unseen: unseen.length > 0 };
  }, [unseen, week, follows]);
  const empty = !(news?.settimane?.length > 0);

  const close = () => {
    setEditing(false);
    onClose();
  };

  let body;
  if (editing) {
    body = (
      <FollowEditor
        follows={follows}
        speciesList={speciesList}
        onToggleFollow={onToggleFollow}
        styles={styles}
      />
    );
  } else if (tab === 'tutte') {
    const firsts = week.species.flatMap((s) => s.firstRegions.map((code) => ({ s, code })));
    body = empty ? (
      <Text style={styles.empty}>
        Le novità compaiono dopo il prossimo aggiornamento settimanale dei dati (ogni lunedì): l’app confronta i dati
        nuovi con quelli della settimana precedente.
      </Text>
    ) : (
      <>
        <Text style={styles.summary}>
          {week.total
            ? `${plural(week.total, 'segnalazione nuova', 'segnalazioni nuove')} di ${plural(week.species.length, 'specie', 'specie')}`
            : 'Nessuna segnalazione nuova'}
        </Text>
        <Text style={styles.period}>
          Aggiornamento del {dateIt(week.to)}
          {week.from ? `, rispetto al ${dateIt(week.from)}` : ''}
        </Text>
        {firsts.length > 0 && (
          <>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              Prime segnalazioni in una regione
            </Text>
            {firsts.map(({ s, code }) => (
              <SpeciesRow
                key={`${s.slug}-${code}`}
                species={speciesBySlug.get(s.slug)}
                detail={`Prima segnalazione in ${regionName(code)}`}
                count={s.regions[String(code)]}
                highlight
                onPress={() => onShowSpecies(speciesBySlug.get(s.slug), REGION_BY_CODE.get(code))}
                onInfo={onInfo}
                styles={styles}
              />
            ))}
          </>
        )}
        {week.species.length > 0 && (
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Tutte le specie con novità
          </Text>
        )}
        {week.species.map((s) => (
          <SpeciesRow
            key={s.slug}
            species={speciesBySlug.get(s.slug)}
            detail={regionsText(s)}
            count={s.count}
            onPress={() => onShowSpecies(speciesBySlug.get(s.slug), null)}
            onInfo={onInfo}
            styles={styles}
          />
        ))}
      </>
    );
  } else if (!hasFollows(follows)) {
    body = (
      <>
        <Text style={styles.empty}>
          Segui le specie o le regioni che ti interessano: qui troverai le loro novità a ogni aggiornamento dei dati.
        </Text>
        <Pressable style={styles.primaryButton} onPress={() => setEditing(true)} accessibilityRole="button">
          <Text style={styles.primaryButtonText}>Scegli specie e regioni</Text>
        </Pressable>
      </>
    );
  } else {
    body = (
      <>
        <Text style={styles.summary}>
          {followed.total
            ? `${plural(followed.total, 'segnalazione nuova', 'segnalazioni nuove')}${
                followed.unseen ? ' dalla tua ultima visita' : ' nell’ultima settimana'
              }`
            : empty
              ? 'Ancora nessun aggiornamento da confrontare'
              : 'Nessuna novità per specie e regioni che segui'}
        </Text>
        {followed.species.map((s) => (
          <SpeciesRow
            key={s.slug}
            species={speciesBySlug.get(s.slug)}
            detail={[
              s.firstInItaly ? 'Prima segnalazione in Italia' : null,
              s.firstRegions.length ? `Prima segnalazione in ${s.firstRegions.map(regionName).join(', ')}` : null,
              regionsText(s),
            ]
              .filter(Boolean)
              .join(' · ')}
            count={s.count}
            highlight={s.firstRegions.length > 0 || s.firstInItaly}
            onPress={() => {
              const codes = Object.keys(s.regions).filter((c) => c !== '0');
              const region = s.followed === 'region' && codes.length === 1 ? REGION_BY_CODE.get(Number(codes[0])) : null;
              onShowSpecies(speciesBySlug.get(s.slug), region);
            }}
            onInfo={onInfo}
            styles={styles}
          />
        ))}
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Specie e regioni seguite
        </Text>
        <Text style={styles.chips}>
          {[
            ...follows.species.map((slug) => speciesBySlug.get(slug)?.commonName ?? slug),
            ...follows.regions.map(regionName),
          ].join(' · ')}
        </Text>
        <Pressable style={styles.secondaryButton} onPress={() => setEditing(true)} accessibilityRole="button">
          <Text style={styles.secondaryButtonText}>Modifica</Text>
        </Pressable>
        <View style={styles.notifyRow}>
          <View style={styles.notifyText}>
            <Text style={styles.notifyTitle}>Avvisami delle novità</Text>
            <Text style={styles.note}>
              Una notifica quando l’aggiornamento settimanale porta novità su ciò che segui. Non usa la posizione: il
              telefono controlla i dati di tanto in tanto, quando lo ritiene opportuno.
            </Text>
          </View>
          <Switch value={notify} onValueChange={onToggleNotify} accessibilityLabel="Avvisami delle novità" />
        </View>
      </>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onShow={onShow}
      onRequestClose={close}
    >
      <View style={styles.header}>
        {editing ? (
          <Pressable onPress={() => setEditing(false)} hitSlop={12} accessibilityRole="button">
            <Text style={styles.headerAction}>‹ Novità</Text>
          </Pressable>
        ) : (
          <View style={styles.headerSpacer} />
        )}
        <Text style={styles.headerTitle} accessibilityRole="header" numberOfLines={1}>
          {editing ? 'Specie e regioni seguite' : 'Novità'}
        </Text>
        <Pressable onPress={close} hitSlop={12} accessibilityRole="button">
          <Text style={styles.headerAction}>Chiudi</Text>
        </Pressable>
      </View>
      {!editing && (
        <View style={styles.tabs} accessibilityRole="tablist">
          {[
            ['tutte', 'Tutta Italia'],
            ['seguite', 'Seguite'],
          ].map(([key, label]) => (
            <Pressable
              key={key}
              style={[styles.tab, tab === key && styles.tabOn]}
              onPress={() => setTab(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === key }}
            >
              <Text style={[styles.tabText, tab === key && styles.tabTextOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        {body}
        {!editing && (
          <Text style={styles.footnote}>
            Le novità sono le segnalazioni comparse su GBIF dall’aggiornamento precedente: possono riguardare anche
            avvistamenti di anni prima, pubblicati solo ora. Non sono contate le identificazioni solo automatiche.
          </Text>
        )}
      </ScrollView>
    </Modal>
  );
}

function regionsText(s) {
  const entries = Object.entries(s.regions)
    .filter(([code]) => code !== '0')
    .sort((a, b) => b[1] - a[1]);
  if (!entries.length) return 'fuori dai confini regionali';
  const shown = entries.slice(0, 3).map(([code, n]) => `${regionName(code)} ${n}`);
  return entries.length > 3 ? `${shown.join(', ')} e altre ${entries.length - 3}` : shown.join(', ');
}

function SpeciesRow({ species, detail, count, highlight, onPress, onInfo, styles }) {
  if (!species) return null;
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${species.commonName}: ${plural(count, 'nuova', 'nuove')}. ${detail}`}
      accessibilityHint="Mostra la specie sulla mappa"
    >
      <View style={styles.rowText}>
        <Text style={styles.common}>{species.commonName}</Text>
        <Text style={styles.scientific}>{species.scientificName}</Text>
        <Text style={[styles.meta, highlight && styles.metaHighlight]}>{detail}</Text>
      </View>
      <Text style={styles.count}>+{count.toLocaleString('it-IT')}</Text>
      <Pressable
        onPress={() => onInfo(species)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`Scheda di ${species.commonName}`}
      >
        <Text style={styles.info} allowFontScaling={false}>
          ⓘ
        </Text>
      </Pressable>
    </Pressable>
  );
}

function FollowEditor({ follows, speciesList, onToggleFollow, styles }) {
  const colors = useColors();
  const regions = [...REGIONS].sort((a, b) => a.name.localeCompare(b.name, 'it'));
  const row = (key, label, sub, on, toggle) => (
    <View key={key} style={styles.switchRow}>
      <View style={styles.rowText}>
        <Text style={styles.common}>{label}</Text>
        {sub ? <Text style={styles.scientific}>{sub}</Text> : null}
      </View>
      <Switch
        value={on}
        onValueChange={toggle}
        accessibilityLabel={`Segui ${label}`}
        trackColor={{ true: colors.primaryFill }}
      />
    </View>
  );
  return (
    <>
      <Text style={styles.intro}>
        Le novità di una specie seguita compaiono da tutta Italia; per una regione seguita compaiono tutte le specie
        segnalate lì.
      </Text>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        Regioni
      </Text>
      {regions.map((r) =>
        row(`r${r.code}`, r.name, null, follows.regions.includes(r.code), () => onToggleFollow('regions', r.code)),
      )}
      <Text style={styles.sectionTitle} accessibilityRole="header">
        Specie
      </Text>
      {speciesList.map((s) =>
        row(s.slug, s.commonName, s.scientificName, follows.species.includes(s.slug), () =>
          onToggleFollow('species', s.slug),
        ),
      )}
    </>
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
    tabs: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: c.background },
    tab: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: c.chipBorder,
    },
    tabOn: { backgroundColor: c.primaryFill, borderColor: c.primaryFill },
    tabText: { fontSize: 14, fontWeight: '600', color: c.text },
    tabTextOn: { color: c.onPrimary },
    scroll: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: 16 },
    summary: { fontSize: 16, fontWeight: '700', color: c.text, marginTop: 6 },
    period: { fontSize: 13, color: c.textSecondary, marginTop: 2 },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: c.primary, marginTop: 20, marginBottom: 4 },
    intro: { fontSize: 13, color: c.textSecondary, marginTop: 12, lineHeight: 18 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 4,
      borderRadius: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    rowPressed: { backgroundColor: c.surfaceAlt },
    rowText: { flex: 1, paddingRight: 8 },
    common: { fontSize: 15, fontWeight: '500', color: c.text },
    scientific: { fontSize: 13, fontStyle: 'italic', color: c.textSecondary, marginTop: 1 },
    meta: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    metaHighlight: { color: c.warning, fontWeight: '600' },
    count: { fontSize: 15, fontWeight: '700', color: c.primary },
    info: { fontSize: 22, color: c.link, paddingLeft: 12 },
    empty: { fontSize: 15, color: c.textSecondary, marginTop: 16, lineHeight: 21 },
    chips: { fontSize: 14, color: c.text, lineHeight: 20 },
    primaryButton: {
      alignSelf: 'flex-start',
      backgroundColor: c.primaryFill,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginTop: 16,
    },
    primaryButtonText: { color: c.onPrimary, fontWeight: '700' },
    secondaryButton: {
      alignSelf: 'flex-start',
      borderWidth: 1.5,
      borderColor: c.primary,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 7,
      marginTop: 10,
    },
    secondaryButtonText: { color: c.primary, fontWeight: '600' },
    notifyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 22 },
    notifyText: { flex: 1 },
    notifyTitle: { fontSize: 15, fontWeight: '600', color: c.text },
    note: { fontSize: 12, color: c.textMuted, marginTop: 3, lineHeight: 17 },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    footnote: { fontSize: 12, color: c.textMuted, marginTop: 24, lineHeight: 17 },
  });
