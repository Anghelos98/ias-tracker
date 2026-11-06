import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { REPORT_EMAIL } from '../data/legal';
import { SPECIES } from '../data/species';
import { gpsFromExif } from '../reports/format';
import { sendByEmail, shareReport } from '../reports/send';
import { addReport, newReportId, persistPhotos } from '../reports/storage';
import { readGpsPosition } from '../utils/location';

const MAX_PHOTOS = 3;
const POOR_ACCURACY_M = 50; // oltre questa incertezza suggeriamo di riprovare all'aperto
const UNKNOWN_SPECIES = { slug: null, commonName: 'Specie non identificata', scientificName: 'da identificare' };

/**
 * App.js ricrea il componente (key) a ogni apertura: il modulo parte sempre vuoto, con la
 * specie mostrata sulla mappa e il GPS già avviato.
 *
 * Nuova segnalazione in tre passi: specie, posizione GPS (automatica), foto facoltative.
 * La segnalazione viene salvata sul telefono e inviata con strumenti esistenti
 * (email al Ministero dell'Ambiente o condivisione con qualsiasi app).
 */
export default function ReportScreen({ visible, initialSpecies, onClose, onOpenMyReports }) {
  const insets = useSafeAreaInsets();
  const [species, setSpecies] = useState(initialSpecies ?? null);
  const [pickingSpecies, setPickingSpecies] = useState(!initialSpecies);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState(null); // { latitude, longitude, accuracy, source }
  const [locating, setLocating] = useState(true);
  const [locationError, setLocationError] = useState(null);
  const [photos, setPhotos] = useState([]); // { uri, gps }
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const applyReading = useCallback((reading) => {
    if (reading.position) setPosition(reading.position);
    else setLocationError(reading.error);
    setLocating(false);
  }, []);

  // Prima lettura GPS all'apertura (lo stato si aggiorna solo quando arriva il risultato).
  useEffect(() => {
    if (!visible) return undefined;
    let active = true;
    readGpsPosition().then((reading) => {
      if (active) applyReading(reading);
    });
    return () => {
      active = false;
    };
  }, [visible, applyReading]);

  const locate = useCallback(async () => {
    setLocating(true);
    setLocationError(null);
    applyReading(await readGpsPosition());
  }, [applyReading]);

  const presence = useMemo(() => {
    if (!species?.sheet) return null;
    try {
      return species.sheet().presenza_italia ?? null;
    } catch {
      return null;
    }
  }, [species]);

  const filteredSpecies = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SPECIES;
    return SPECIES.filter(
      (s) => s.commonName.toLowerCase().includes(q) || s.scientificName.toLowerCase().includes(q),
    );
  }, [query]);

  const addPhoto = useCallback(async (fromCamera) => {
    if (fromCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Fotocamera non disponibile', 'Consenti l’accesso alla fotocamera nelle impostazioni.');
        return;
      }
    }
    const options = { mediaTypes: ['images'], quality: 0.7, exif: true };
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setPhotos((prev) => [...prev, { uri: asset.uri, gps: gpsFromExif(asset.exif) }].slice(0, MAX_PHOTOS));
  }, []);

  const photoWithGps = photos.find((p) => p.gps);
  const ready = species !== null && position !== null && !sending;

  const send = useCallback(
    async (channel) => {
      if (!ready) return;
      setSending(true);
      try {
        const id = newReportId();
        const report = {
          id,
          createdAt: new Date().toISOString(),
          speciesSlug: species.slug,
          scientificName: species.scientificName,
          commonName: species.commonName,
          latitude: position.latitude,
          longitude: position.longitude,
          accuracy: position.accuracy ?? null,
          locationSource: position.source,
          note,
          photos: await persistPhotos(
            id,
            photos.map((p) => p.uri),
          ),
          sent: [],
        };
        await addReport(report); // salvata comunque, anche se l'invio viene annullato
        const done = channel === 'email' ? await sendByEmail(report) : await shareReport(report);
        onClose();
        if (!done) {
          Alert.alert('Segnalazione salvata', 'Non è stata inviata: la trovi in “Le mie segnalazioni”.');
        }
      } catch {
        Alert.alert('Errore', 'Non è stato possibile salvare la segnalazione. Riprova.');
      } finally {
        setSending(false);
      }
    },
    [ready, species, position, note, photos, onClose],
  );

  const widespread = presence?.toLowerCase().startsWith('diffusa');

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={styles.headerAction}>Annulla</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Nuova segnalazione</Text>
        <Pressable onPress={onOpenMyReports} hitSlop={12}>
          <Text style={styles.headerAction}>Le mie</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* 1. Specie */}
        <Step number={1} title="Specie">
          {species && !pickingSpecies ? (
            <Pressable style={styles.choice} onPress={() => setPickingSpecies(true)}>
              <View style={styles.flex}>
                <Text style={styles.choiceTitle}>{species.commonName}</Text>
                <Text style={styles.choiceSubtitle}>{species.scientificName}</Text>
              </View>
              <Text style={styles.change}>Cambia</Text>
            </Pressable>
          ) : (
            <View>
              <TextInput
                style={styles.input}
                placeholder="Cerca per nome comune o scientifico"
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
              />
              <View style={styles.speciesList}>
                {filteredSpecies.slice(0, 8).map((s) => (
                  <Pressable
                    key={s.slug}
                    style={styles.speciesRow}
                    onPress={() => {
                      setSpecies(s);
                      setPickingSpecies(false);
                    }}
                  >
                    <Text style={styles.choiceTitle}>{s.commonName}</Text>
                    <Text style={styles.choiceSubtitle}>{s.scientificName}</Text>
                  </Pressable>
                ))}
                <Pressable
                  style={styles.speciesRow}
                  onPress={() => {
                    setSpecies(UNKNOWN_SPECIES);
                    setPickingSpecies(false);
                  }}
                >
                  <Text style={styles.choiceTitle}>Non so quale sia</Text>
                  <Text style={styles.choiceSubtitle}>Le foto aiuteranno a identificarla</Text>
                </Pressable>
              </View>
            </View>
          )}
        </Step>

        {/* 2. Posizione */}
        <Step number={2} title="Posizione">
          {locating && (
            <View style={styles.row}>
              <ActivityIndicator />
              <Text style={styles.muted}> Rilevo la posizione GPS…</Text>
            </View>
          )}
          {!locating && position && (
            <View>
              <Text style={styles.coords}>
                {position.latitude.toFixed(6)}, {position.longitude.toFixed(6)}
              </Text>
              <Text style={styles.muted}>
                {position.source === 'foto'
                  ? 'Posizione ricavata dalla foto'
                  : position.accuracy != null
                    ? `GPS, precisione ± ${Math.round(position.accuracy)} m`
                    : 'GPS'}
              </Text>
              {position.source === 'gps' && position.accuracy > POOR_ACCURACY_M && (
                <Text style={styles.warning}>
                  Precisione bassa: se puoi, spostati all’aperto e aggiorna la posizione.
                </Text>
              )}
            </View>
          )}
          {!locating && locationError && <Text style={styles.warning}>{locationError}</Text>}
          <View style={styles.row}>
            <SmallButton label="Aggiorna posizione" onPress={locate} disabled={locating} />
            {photoWithGps && position?.source !== 'foto' && (
              <SmallButton
                label="Usa posizione della foto"
                onPress={() => setPosition({ ...photoWithGps.gps, accuracy: null, source: 'foto' })}
              />
            )}
          </View>
        </Step>

        {/* 3. Foto */}
        <Step number={3} title={`Foto (facoltative, max ${MAX_PHOTOS})`}>
          <View style={styles.photos}>
            {photos.map((p, i) => (
              <Pressable
                key={p.uri}
                onLongPress={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                accessibilityHint="Tieni premuto per rimuovere la foto"
              >
                <Image source={{ uri: p.uri }} style={styles.photo} />
              </Pressable>
            ))}
          </View>
          {photos.length > 0 && <Text style={styles.small}>Tieni premuta una foto per rimuoverla.</Text>}
          {photos.length < MAX_PHOTOS && (
            <View style={styles.row}>
              <SmallButton label="Scatta foto" onPress={() => addPhoto(true)} />
              <SmallButton label="Dalla galleria" onPress={() => addPhoto(false)} />
            </View>
          )}
          <Text style={styles.small}>Consiglio: una foto della pianta intera e una delle foglie o dei fiori.</Text>
        </Step>

        {/* 4. Note */}
        <Step number={4} title="Note (facoltative)">
          <TextInput
            style={[styles.input, styles.noteInput]}
            placeholder="Es. quante piante, estensione, vicino a un corso d’acqua…"
            value={note}
            onChangeText={setNote}
            multiline
          />
        </Step>

        {/* Invio */}
        {species?.slug && presence && (
          <Text style={[styles.hint, widespread ? styles.hintNeutral : styles.hintImportant]}>
            {widespread
              ? 'Specie già diffusa in Italia: la casella del Ministero è pensata soprattutto per le nuove comparse. Puoi condividere la segnalazione con la tua Regione o l’ente parco.'
              : `Specie ${presence.toLowerCase()} in Italia secondo ISPRA: la tua segnalazione è preziosa per intervenire presto. Inviala al Ministero.`}
          </Text>
        )}
        <Pressable
          style={[styles.primary, !ready && styles.disabled]}
          onPress={() => send('email')}
          disabled={!ready}
        >
          <Text style={styles.primaryText}>{sending ? 'Salvataggio…' : 'Invia al Ministero dell’Ambiente'}</Text>
          <Text style={styles.primarySub}>email a {REPORT_EMAIL}</Text>
        </Pressable>
        <Pressable
          style={[styles.secondary, !ready && styles.disabled]}
          onPress={() => send('share')}
          disabled={!ready}
        >
          <Text style={styles.secondaryText}>Condividi…</Text>
        </Pressable>
        {!ready && !sending && (
          <Text style={styles.small}>
            {species === null ? 'Scegli la specie' : 'Serve la posizione'} per poter inviare la segnalazione.
          </Text>
        )}
        <Text style={styles.small}>
          La segnalazione resta salvata anche sul telefono, in “Le mie segnalazioni”.
        </Text>
      </ScrollView>
    </Modal>
  );
}

function Step({ number, title, children }) {
  return (
    <View style={styles.step}>
      <Text style={styles.stepTitle}>
        <Text style={styles.stepNumber}>{number} </Text>
        {title}
      </Text>
      {children}
    </View>
  );
}

function SmallButton({ label, onPress, disabled }) {
  return (
    <Pressable style={[styles.smallButton, disabled && styles.disabled]} onPress={onPress} disabled={disabled}>
      <Text style={styles.smallButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  headerAction: { fontSize: 16, color: '#2e7d32', fontWeight: '600' },
  content: { padding: 16, backgroundColor: '#fff' },
  flex: { flex: 1 },
  step: { marginBottom: 22 },
  stepTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8, color: '#1b1b1b' },
  stepNumber: { color: '#2e7d32' },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6f4ea',
    borderRadius: 12,
    padding: 12,
  },
  choiceTitle: { fontSize: 15, fontWeight: '600', color: '#1b1b1b' },
  choiceSubtitle: { fontSize: 13, fontStyle: 'italic', color: '#555' },
  change: { color: '#2e7d32', fontWeight: '600' },
  input: { backgroundColor: '#f1f3f4', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  noteInput: { minHeight: 80, textAlignVertical: 'top' },
  speciesList: { marginTop: 6 },
  speciesRow: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#e0e0e0' },
  coords: { fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },
  muted: { fontSize: 13, color: '#666' },
  warning: { fontSize: 13, color: '#b26a00', marginTop: 4 },
  small: { fontSize: 12, color: '#777', marginTop: 6 },
  photos: { flexDirection: 'row', gap: 8 },
  photo: { width: 96, height: 96, borderRadius: 10, backgroundColor: '#eee' },
  smallButton: {
    borderWidth: 1.5,
    borderColor: '#2e7d32',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  smallButtonText: { color: '#2e7d32', fontWeight: '600' },
  hint: { fontSize: 13, lineHeight: 19, padding: 10, borderRadius: 10, marginBottom: 12 },
  hintImportant: { backgroundColor: '#fff3e0', color: '#8a4b00' },
  hintNeutral: { backgroundColor: '#f1f3f4', color: '#444' },
  primary: { backgroundColor: '#2e7d32', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  primarySub: { color: '#e6f4ea', fontSize: 12, marginTop: 2 },
  secondary: {
    marginTop: 10,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#2e7d32',
  },
  secondaryText: { color: '#2e7d32', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.4 },
});
