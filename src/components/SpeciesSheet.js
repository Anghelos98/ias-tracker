import { useEffect, useState } from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CONFISCATION_NOTE,
  LEGAL_SOURCES,
  PENALTIES,
  POSSESSION_DEADLINES,
  PROHIBITIONS,
  PROHIBITIONS_NOTE,
  WHAT_TO_DO,
  formatDateIt,
} from '../data/legal';
import { readLookalikes, readPhotos, readSpeciesSheet } from '../data/remote';
import { SPECIES } from '../data/species';

const PRESENCE_COLORS = {
  diffusa: '#c62828',
  localizzata: '#ef6c00',
  assente: '#2e7d32',
};

function presenceColor(text) {
  const key = Object.keys(PRESENCE_COLORS).find((k) => text?.toLowerCase().startsWith(k));
  return key ? PRESENCE_COLORS[key] : '#616161';
}

function openUrl(url) {
  if (url) Linking.openURL(url).catch(() => {});
}

/** Scheda completa di una specie: riconoscimento, legge, cosa fare, schede ISPRA. */
export default function SpeciesSheet({ species, manifest, visible, onClose, onOpenSpecies }) {
  const insets = useSafeAreaInsets();
  // La scheda ISPRA viene caricata solo quando si apre la schermata (scaricata o inclusa nell'app).
  const [loaded, setLoaded] = useState({ slug: null, sheet: null, photos: [], lookalikes: null });
  useEffect(() => {
    if (!visible || !species) return undefined;
    let active = true;
    Promise.all([
      readSpeciesSheet(species, manifest).catch(() => null),
      readPhotos(manifest).catch(() => null),
      readLookalikes(manifest).catch(() => null),
    ]).then(([s, photos, lookalikes]) => {
      if (!active) return;
      setLoaded({
        slug: species.slug,
        sheet: s,
        photos: photos?.specie?.[species.slug] ?? [],
        lookalikes: lookalikes?.specie?.[species.slug] ?? null,
      });
    });
    return () => {
      active = false;
    };
  }, [visible, species, manifest]);
  const current = loaded.slug === species?.slug;
  const sheet = current ? loaded.sheet : null;
  const photos = current ? loaded.photos : [];
  const lookalikes = current ? loaded.lookalikes : null;

  if (!species) return null;
  const { listing } = species;
  const deadline = POSSESSION_DEADLINES[listing.regulation];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.header, { paddingTop: 12 }]}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{species.commonName}</Text>
          <Text style={styles.scientific}>{sheet?.nome_scientifico_autore || species.scientificName}</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Chiudi scheda">
          <Text style={styles.close}>Chiudi</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        {photos.length > 0 && <PhotoGallery photos={photos} />}

        {/* Riepilogo */}
        <View style={styles.badges}>
          {sheet?.presenza_italia && (
            <Badge color={presenceColor(sheet.presenza_italia)} label={`In Italia: ${sheet.presenza_italia}`} />
          )}
          <Badge color="#1565c0" label="Rilevanza unionale" />
          {(sheet?.famiglia || species.family) && <Badge color="#616161" label={sheet?.famiglia || species.family} />}
        </View>
        <Text style={styles.meta}>
          {species.total > 0
            ? `${species.total.toLocaleString('it-IT')} segnalazioni in Italia su GBIF`
            : 'Nessuna segnalazione in Italia su GBIF'}
          {sheet?.nome_inglese ? ` · in inglese: ${sheet.nome_inglese}` : ''}
        </Text>

        {/* Come riconoscerla */}
        <Section title="Come riconoscerla">
          {sheet?.descrizione?.length ? (
            sheet.descrizione.map((p, i) => (
              <Text key={i} style={styles.paragraph}>
                {p}
              </Text>
            ))
          ) : (
            <Text style={styles.muted}>
              ISPRA non ha ancora pubblicato la descrizione di questa specie, inserita nell’elenco
              dell’Unione nel {listing.regulation.slice(0, 4)}.
            </Text>
          )}
          {sheet?.sinonimi ? <Text style={styles.small}>Sinonimi: {sheet.sinonimi}</Text> : null}
        </Section>

        {/* Specie simili */}
        <Section title="Con cosa si può confondere">
          {lookalikes?.voci?.map((v) => (
            <View key={v.citazione} style={styles.lookalike}>
              <Text style={styles.lookalikeNames}>{v.simili.join(', ')}</Text>
              <Text style={styles.quote}>«{v.citazione}»</Text>
            </View>
          ))}
          {lookalikes?.correlate?.length ? (
            <View style={styles.related}>
              <Text style={styles.subheading}>Specie dell’elenco UE simili</Text>
              {lookalikes.correlate.map((slug) => (
                <Pressable key={slug} onPress={() => onOpenSpecies?.(slug)} accessibilityRole="link" hitSlop={6}>
                  <Text style={styles.link}>{relatedName(slug)} ›</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {lookalikes?.voci?.length ? (
            <Text style={styles.small}>Citazioni dalla scheda ISPRA (CC BY 4.0).</Text>
          ) : (
            !lookalikes?.correlate?.length && (
              <Text style={styles.muted}>La scheda ISPRA non indica specie con cui si può confondere.</Text>
            )
          )}
        </Section>

        {/* Cosa dice la legge */}
        <Section title="Cosa dice la legge">
          <Text style={styles.paragraph}>
            È una specie esotica invasiva di rilevanza unionale (Reg. UE 1143/2014), inserita
            nell’elenco con il Reg. di esecuzione (UE) {listing.regulation}, in vigore dal{' '}
            {formatDateIt(listing.inForce)}.
            {listing.appliesFrom
              ? ` Per questa specie i divieti si applicano dal ${formatDateIt(listing.appliesFrom)}.`
              : ''}
          </Text>
          <Text style={styles.subheading}>In Italia è vietato (D.Lgs. 230/2017, art. 6):</Text>
          {PROHIBITIONS.map((p) => (
            <Text key={p} style={styles.bullet}>
              • {p}
            </Text>
          ))}
          <Text style={styles.small}>{PROHIBITIONS_NOTE}</Text>

          <Text style={styles.subheading}>Sanzioni (art. 25)</Text>
          {PENALTIES.map((p) => (
            <View key={p.ref} style={styles.penalty}>
              <Text style={styles.penaltyWhat}>{p.what}</Text>
              <Text style={styles.penaltyValue}>
                {p.penalty} <Text style={styles.small}>({p.ref})</Text>
              </Text>
            </View>
          ))}
          <Text style={styles.small}>{CONFISCATION_NOTE}</Text>

          <Text style={styles.subheading}>Denuncia del possesso (art. 26)</Text>
          <Text style={styles.paragraph}>
            Chi detiene esemplari deve denunciarlo al Ministero dell’Ambiente entro 180 giorni
            dall’inserimento della specie nell’elenco.{' '}
            {deadline
              ? `Per questa specie il termine indicato dal Ministero era il ${formatDateIt(deadline)}.`
              : 'Per questa specie il termine è già scaduto.'}{' '}
            Le denunce tardive sono soggette a sanzione.
          </Text>
          <Text style={styles.disclaimer}>
            Sintesi divulgativa aggiornata a novembre 2026: non sostituisce il testo di legge.
          </Text>
          {LEGAL_SOURCES.map((s) => (
            <Link key={s.url} label={s.label} url={s.url} />
          ))}
        </Section>

        {/* Cosa fare */}
        <Section title="Cosa fare se la trovi">
          {WHAT_TO_DO.map((t, i) => (
            <Text key={i} style={styles.bullet}>
              {i + 1}. {t}
            </Text>
          ))}
        </Section>

        {/* Approfondimenti ISPRA */}
        {sheet?.sezioni?.length ? (
          <Section title="Approfondimenti">
            {sheet.sezioni.map((s) => (
              <Collapsible key={s.titolo} title={s.titolo}>
                {s.blocchi.map((b, i) => (
                  <View key={i}>
                    {b.sottotitolo ? <Text style={styles.blockSubtitle}>{b.sottotitolo}</Text> : null}
                    <Text style={styles.paragraph}>{b.testo}</Text>
                  </View>
                ))}
              </Collapsible>
            ))}
          </Section>
        ) : null}

        {sheet?.mappa_distribuzione && (
          <Section title="Distribuzione in Italia (ISPRA)">
            <Image
              source={{ uri: sheet.mappa_distribuzione }}
              style={styles.map}
              resizeMode="contain"
              accessibilityLabel="Mappa di distribuzione ISPRA"
            />
            <Text style={styles.small}>
              Celle 10×10 km, aggiornata a giugno 2025 (rendicontazione art. 24 Reg. UE 1143/2014). Richiede
              connessione.
            </Text>
          </Section>
        )}

        {/* Fonti */}
        <Section title="Fonti">
          {sheet ? (
            <>
              <Text style={styles.small}>
                Testi della scheda: {sheet.fonte.attribuzione}, licenza {sheet.fonte.licenza}, consultato il{' '}
                {formatDateIt(sheet.fonte.recuperato_il)}.
                {sheet.completa ? '' : ' La scheda ISPRA di questa specie è incompleta.'}
              </Text>
              <Link label="Scheda della specie sul sito ISPRA" url={sheet.fonte.url} />
              {sheet.pdf_scheda && <Link label="Scheda completa (PDF)" url={sheet.pdf_scheda} />}
              {sheet.pdf_valutazione_rischio && (
                <Link label="Valutazione del rischio (PDF, inglese)" url={sheet.pdf_valutazione_rischio} />
              )}
            </>
          ) : (
            <Text style={styles.muted}>Scheda ISPRA non disponibile.</Text>
          )}
        </Section>
      </ScrollView>
    </Modal>
  );
}

/** Foto iNaturalist (CC0 / CC BY) con autore e licenza; toccando si apre la pagina originale. */
function PhotoGallery({ photos }) {
  return (
    <View style={styles.gallery}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryRow}>
        {photos.map((p) => (
          <Pressable key={p.pagina} onPress={() => openUrl(p.pagina)} accessibilityRole="link">
            <Image source={{ uri: p.url }} style={styles.photo} accessibilityLabel={`Foto di ${p.autore}`} />
            <Text style={styles.photoCredit} numberOfLines={1}>
              © {p.autore} · {p.licenza}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text style={styles.small}>Foto da iNaturalist: tocca una foto per vedere l’originale.</Text>
    </View>
  );
}

/** "Poligono del Giappone (Reynoutria japonica)" per i collegamenti tra specie. */
function relatedName(slug) {
  const s = SPECIES.find((x) => x.slug === slug);
  return s ? `${s.commonName} (${s.scientificName})` : slug;
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Collapsible({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.collapsible}>
      <Pressable onPress={() => setOpen((o) => !o)} style={styles.collapsibleHeader} accessibilityRole="button">
        <Text style={styles.collapsibleTitle}>{title}</Text>
        <Text style={styles.chevron}>{open ? '−' : '+'}</Text>
      </Pressable>
      {open && <View style={styles.collapsibleBody}>{children}</View>}
    </View>
  );
}

function Badge({ color, label }) {
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function Link({ label, url }) {
  return (
    <Pressable onPress={() => openUrl(url)} accessibilityRole="link" hitSlop={6}>
      <Text style={styles.link}>{label} ↗</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  headerText: { flex: 1, paddingRight: 12 },
  title: { fontSize: 22, fontWeight: '700', color: '#1b1b1b' },
  scientific: { fontSize: 15, fontStyle: 'italic', color: '#555', marginTop: 2 },
  close: { fontSize: 16, color: '#2e7d32', fontWeight: '600', paddingTop: 4 },
  content: { paddingHorizontal: 18, paddingTop: 14, backgroundColor: '#fff' },
  lookalike: { marginBottom: 10 },
  lookalikeNames: { fontSize: 15, fontWeight: '700', color: '#1b1b1b' },
  quote: { fontSize: 14, lineHeight: 21, color: '#444', fontStyle: 'italic', marginTop: 2 },
  related: { marginTop: 4 },
  gallery: { marginBottom: 14 },
  galleryRow: { gap: 10 },
  photo: { width: 200, height: 150, borderRadius: 10, backgroundColor: '#eee' },
  photoCredit: { width: 200, fontSize: 11, color: '#666', marginTop: 4 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  meta: { fontSize: 13, color: '#555', marginTop: 8 },
  section: { marginTop: 22 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#2e7d32', marginBottom: 8 },
  subheading: { fontSize: 15, fontWeight: '600', marginTop: 12, marginBottom: 4, color: '#1b1b1b' },
  paragraph: { fontSize: 15, lineHeight: 22, color: '#222', marginBottom: 6 },
  bullet: { fontSize: 15, lineHeight: 22, color: '#222', marginBottom: 4, paddingLeft: 4 },
  small: { fontSize: 12, lineHeight: 17, color: '#666', marginTop: 4 },
  muted: { fontSize: 14, color: '#777', fontStyle: 'italic' },
  disclaimer: { fontSize: 12, color: '#8d6e00', marginTop: 10 },
  penalty: { marginBottom: 6 },
  penaltyWhat: { fontSize: 14, fontWeight: '600', color: '#222' },
  penaltyValue: { fontSize: 14, color: '#b71c1c' },
  collapsible: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#e0e0e0' },
  collapsibleHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 },
  collapsibleTitle: { fontSize: 15, fontWeight: '600', color: '#1b1b1b' },
  chevron: { fontSize: 20, color: '#2e7d32', width: 20, textAlign: 'center' },
  collapsibleBody: { paddingBottom: 8 },
  blockSubtitle: { fontSize: 13, fontWeight: '700', color: '#555', marginTop: 4, marginBottom: 2 },
  map: { width: '100%', height: 320, backgroundColor: '#f5f5f5', borderRadius: 8 },
  link: { fontSize: 14, color: '#1565c0', marginTop: 8 },
});
