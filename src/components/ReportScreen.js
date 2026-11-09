import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import useSheetTopInset from '../hooks/useSheetTopInset';

import { PEC_NOTE, REGIONAL_OFFICES, locateRegion, officeAddress } from '../data/contacts';
import { REPORT_EMAIL } from '../data/legal';
import { REGIONS } from '../data/regions';
import { SPECIES } from '../data/species';
import { diag } from '../diagnostics/log';
import { gpsFromExif } from '../reports/format';
import { INTERVENTIONS, NOTE_MAX } from '../reports/notebook';
import { alertDraft, isRecorded, sendByEmail, shareReport } from '../reports/send';
import { addReport, newReportId, persistPhotos } from '../reports/storage';
import { useColors, useThemedStyles } from '../theme';
import { photoWithoutMetadata } from '../utils/cleanPhoto';
import { allowPhotoLocation, readGpsPosition } from '../utils/location';

// Confini delle regioni (~100 KB), letti solo quando serve la prima volta (posizione nota):
// all'avvio dell'app non servono.
const regionShapes = () => require('../../assets/data/region_shapes.json');

// Taccuino che non accetta la voce (errori di addReport con `code`, vedi reports/storage.js).
// La segnalazione si può comunque inviare: chi è sul campo non deve perderla.
const NOTEBOOK_PROBLEMS = {
  full: {
    title: 'Taccuino pieno',
    text:
      'Su questo telefono il taccuino ha esaurito lo spazio, quindi la voce non è stata salvata. ' +
      'Esporta il taccuino ed elimina le voci che non ti servono più.',
  },
  unreadable: {
    title: 'Taccuino non leggibile',
    text: 'Non è stato possibile leggere il taccuino salvato: per non rischiare di cancellarlo, la voce non è stata salvata.',
  },
};

const MAX_PHOTOS = 3;
const POOR_ACCURACY_M = 50; // oltre questa incertezza suggeriamo di riprovare all'aperto
const UNKNOWN_SPECIES = { slug: null, commonName: 'Specie non identificata', scientificName: 'da identificare' };
const KINDS = [
  { value: 'presenza', label: 'Presenza' },
  { value: 'intervento', label: 'Intervento' },
];

/**
 * App.js ricrea il componente (key) a ogni apertura: il modulo parte sempre vuoto, con la
 * specie mostrata sulla mappa e il GPS già avviato.
 *
 * Nuova voce del taccuino di campo:
 * - presenza: specie, posizione GPS (automatica), foto e note facoltative; si può inviare al
 *   Ministero dell'Ambiente, condividere con qualsiasi app o solo salvare;
 * - intervento di gestione (taglio, eradicazione…): in più il tipo di intervento; si salva
 *   nel taccuino e si può condividere.
 * Ogni voce resta salvata sul telefono, nel taccuino.
 */
export default function ReportScreen({
  visible,
  initialSpecies,
  initialKind = 'presenza',
  signature = '',
  onClose,
  onOpenNotebook,
}) {
  const insets = useSafeAreaInsets();
  const topInset = useSheetTopInset();
  const colors = useColors();
  const styles = useThemedStyles(createStyles);
  const [kind, setKind] = useState(initialKind);
  const [intervention, setIntervention] = useState(null);
  const [species, setSpecies] = useState(initialSpecies ?? null);
  const [pickingSpecies, setPickingSpecies] = useState(!initialSpecies);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState(null); // { latitude, longitude, accuracy, source }
  const [locating, setLocating] = useState(true);
  const [locationError, setLocationError] = useState(null);
  const [photos, setPhotos] = useState([]); // { uri, gps, source }
  // Ultima foto dalla galleria senza posizione: { permissionDenied } (avviso sotto le foto)
  const [missingPhotoLocation, setMissingPhotoLocation] = useState(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const isIntervention = kind === 'intervento';

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
    return SPECIES.filter((s) => s.commonName.toLowerCase().includes(q) || s.scientificName.toLowerCase().includes(q));
  }, [query]);

  const addPhoto = useCallback(async (fromCamera) => {
    try {
      if (fromCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Fotocamera non disponibile', 'Consenti l’accesso alla fotocamera nelle impostazioni.');
          return;
        }
      }
      // Qualità piena: la foto viene compressa una sola volta, quando si tolgono i metadati.
      const options = { mediaTypes: ['images'], quality: 1, exif: true };
      // Android: dalla galleria la posizione della foto arriva solo con il permesso apposito
      const permission = fromCamera ? null : await allowPhotoLocation();
      if (permission) diag('foto', `permesso posizione delle foto: ${permission}`);
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const source = asset.assetId ?? asset.uri;
      // La posizione si legge dai metadati restituiti dal selettore; la foto salvata e inviata è
      // una copia senza metadati (vedi utils/cleanPhoto.js).
      const gps = gpsFromExif(asset.exif);
      // registro di diagnostica (solo build di prova): solo se c'è, mai la posizione
      diag('foto', `${fromCamera ? 'fotocamera' : 'galleria'}: posizione della foto ${gps ? 'presente' : 'assente'}`);
      // solo dalla galleria: con la fotocamera si è sul posto e il GPS dà già la posizione giusta
      // (e su iPhone la fotocamera dell'app non salva mai il luogo nella foto)
      setMissingPhotoLocation(
        gps || fromCamera ? null : { permissionDenied: permission === 'denied' || permission === 'never_ask_again' },
      );
      let uri;
      try {
        uri = await photoWithoutMetadata(asset.uri);
      } catch {
        // mai la foto originale al suo posto: conterrebbe i metadati
        Alert.alert('Foto non disponibile', 'Non è stato possibile preparare la foto. Riprova o scegline un’altra.');
        return;
      }
      setPhotos((prev) =>
        prev.some((p) => p.source === source)
          ? prev // stessa foto scelta due volte
          : [...prev, { uri, gps, source }].slice(0, MAX_PHOTOS),
      );
    } catch {
      // es. simulatore senza fotocamera, galleria non accessibile
      Alert.alert('Foto non disponibile', 'Non è stato possibile aprire la fotocamera o la galleria.');
    }
  }, []);

  const changeKind = (next) => {
    setKind(next);
    // per un intervento la specie deve essere nota
    if (next === 'intervento' && species && !species.slug) {
      setSpecies(null);
      setPickingSpecies(true);
    }
  };

  const photoWithGps = photos.find((p) => p.gps);
  const ready = species !== null && position !== null && (!isIntervention || intervention !== null) && !sending;

  // Blocca un secondo tocco prima che lo stato `sending` arrivi al render (voce doppia).
  const busyRef = useRef(false);

  /** channel: 'email' | 'share' | 'save' | { office } */
  const send = useCallback(
    async (channel) => {
      if (!ready || busyRef.current) return;
      busyRef.current = true;
      setSending(true);
      const unlock = () => {
        busyRef.current = false;
        setSending(false);
      };
      let report;
      let problem = null; // voce non salvata nel taccuino (pieno o non leggibile)
      try {
        const id = newReportId();
        report = {
          id,
          kind,
          intervention: isIntervention ? intervention : null,
          createdAt: new Date().toISOString(),
          speciesSlug: species.slug,
          scientificName: species.scientificName,
          commonName: species.commonName,
          latitude: position.latitude,
          longitude: position.longitude,
          accuracy: position.accuracy ?? null,
          locationSource: position.source,
          note,
          signature: signature.trim() || null,
          photos: await persistPhotos(
            id,
            photos.map((p) => p.uri),
          ),
          sent: [],
        };
        await addReport(report); // salvata comunque, anche se l'invio viene annullato
      } catch (error) {
        problem = NOTEBOOK_PROBLEMS[error?.code] ?? null;
        if (!problem || channel === 'save') {
          // niente è stato salvato: il modulo resta aperto per riprovare o per inviare
          if (problem) {
            Alert.alert(problem.title, `${problem.text}\n\nPuoi comunque inviarla per email o condividerla.`);
          } else Alert.alert('Errore', 'Non è stato possibile salvare. Riprova.');
          unlock();
          return;
        }
      }
      // Da qui la voce è nel taccuino: un errore nell'invio non deve farla salvare di nuovo,
      // quindi il modulo si chiude comunque. L'email (o la condivisione) si apre prima della
      // chiusura: su iOS non si può presentarla sopra una Modal che si sta chiudendo.
      if (channel === 'save') {
        onClose();
        Alert.alert('Salvato nel taccuino', 'Puoi esportare le voci del taccuino in CSV, GeoJSON o KML.');
        return;
      }
      let result = 'cancelled';
      try {
        if (channel === 'email') result = await sendByEmail(report);
        else if (channel?.office) {
          result = await sendByEmail(report, { address: officeAddress(channel.office), channel: 'regione' });
        } else result = await shareReport(report);
      } catch {
        result = 'cancelled';
      }
      if (problem) {
        if (!isRecorded(result) && result !== 'draft') {
          // né salvata né inviata: il modulo resta aperto, così non si perde nulla
          Alert.alert(problem.title, `${problem.text}\n\nNon è stata nemmeno inviata: il modulo resta aperto.`);
          unlock();
          return;
        }
        onClose();
        Alert.alert(
          problem.title,
          result === 'draft'
            ? `${problem.text}\n\nL’email è tra le bozze dell’app Mail: inviala da lì.`
            : `${problem.text}\n\nLa segnalazione è stata comunque passata all’app di posta o di condivisione.`,
        );
        return;
      }
      onClose();
      if (result === 'draft') alertDraft();
      else if (!isRecorded(result)) {
        Alert.alert('Salvato nel taccuino', 'Non è stato inviato: lo trovi nel taccuino di campo.');
      }
    },
    [ready, kind, isIntervention, intervention, species, position, note, signature, photos, onClose],
  );

  const widespread = presence?.toLowerCase().startsWith('diffusa');
  // Ufficio regionale competente per il luogo della segnalazione
  const offices = useMemo(() => {
    if (!position) return [];
    const code = locateRegion(position.latitude, position.longitude, regionShapes(), REGIONS);
    return code ? (REGIONAL_OFFICES[code] ?? []) : [];
  }, [position]);
  let missing = null;
  if (species === null) missing = 'Scegli la specie';
  else if (isIntervention && intervention === null) missing = 'Scegli il tipo di intervento';
  else if (position === null) missing = 'Serve la posizione';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.header, { paddingTop: 14 + topInset }]}>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
          <Text style={styles.headerAction}>Annulla</Text>
        </Pressable>
        <Text style={styles.headerTitle} accessibilityRole="header">
          {isIntervention ? 'Nuovo intervento' : 'Nuova segnalazione'}
        </Text>
        <Pressable
          onPress={onOpenNotebook}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Taccuino di campo"
        >
          <Text style={styles.headerAction}>Taccuino</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.segmented} accessibilityRole="tablist">
          {KINDS.map((k) => {
            const active = k.value === kind;
            return (
              <Pressable
                key={k.value}
                style={[styles.segment, active && styles.segmentActive]}
                onPress={() => changeKind(k.value)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{k.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.small}>
          {isIntervention
            ? 'Registra un intervento di gestione (taglio, eradicazione…) nel tuo taccuino di campo.'
            : 'Segnala dove hai visto una specie invasiva.'}
        </Text>

        {/* 1. Specie */}
        <Step number={1} title="Specie" styles={styles}>
          {species && !pickingSpecies ? (
            <Pressable
              style={styles.choice}
              onPress={() => setPickingSpecies(true)}
              accessibilityRole="button"
              accessibilityLabel={`Specie: ${species.commonName}, ${species.scientificName}`}
              accessibilityHint="Tocca per cambiare specie"
            >
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
                placeholderTextColor={colors.placeholder}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
                accessibilityLabel="Cerca la specie"
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
                    accessibilityRole="button"
                  >
                    <Text style={styles.choiceTitle}>{s.commonName}</Text>
                    <Text style={styles.choiceSubtitle}>{s.scientificName}</Text>
                  </Pressable>
                ))}
                {!isIntervention && (
                  <Pressable
                    style={styles.speciesRow}
                    onPress={() => {
                      setSpecies(UNKNOWN_SPECIES);
                      setPickingSpecies(false);
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={styles.choiceTitle}>Non so quale sia</Text>
                    <Text style={styles.choiceSubtitle}>Le foto aiuteranno a identificarla</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}
        </Step>

        {/* Tipo di intervento */}
        {isIntervention && (
          <Step number={2} title="Tipo di intervento" styles={styles}>
            <View style={styles.chips}>
              {INTERVENTIONS.map((i) => {
                const active = i.value === intervention;
                return (
                  <Pressable
                    key={i.value}
                    onPress={() => setIntervention(i.value)}
                    style={[styles.chip, active && styles.chipActive]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{i.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Step>
        )}

        {/* Posizione */}
        <Step number={isIntervention ? 3 : 2} title="Posizione" styles={styles}>
          {locating && (
            <View style={styles.row} accessible accessibilityLabel="Rilevo la posizione GPS">
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.muted}> Rilevo la posizione GPS…</Text>
            </View>
          )}
          {!locating && position && (
            <View accessible>
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
          {!locating && locationError && (
            <Text style={styles.warning} accessibilityLiveRegion="polite">
              {locationError}
            </Text>
          )}
          <View style={styles.row}>
            <SmallButton label="Aggiorna posizione" onPress={locate} disabled={locating} styles={styles} />
            {photoWithGps && position?.source !== 'foto' && (
              <SmallButton
                label="Usa posizione della foto"
                onPress={() => setPosition({ ...photoWithGps.gps, accuracy: null, source: 'foto' })}
                styles={styles}
              />
            )}
          </View>
        </Step>

        {/* Foto */}
        <Step number={isIntervention ? 4 : 3} title={`Foto (facoltative, max ${MAX_PHOTOS})`} styles={styles}>
          <View style={styles.photos}>
            {photos.map((p, i) => (
              <Pressable
                key={`${i}-${p.uri}`}
                onLongPress={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                accessibilityRole="image"
                accessibilityLabel={`Foto ${i + 1}`}
                accessibilityHint="Tieni premuto per rimuovere la foto"
                accessibilityActions={[{ name: 'delete', label: 'Rimuovi foto' }]}
                onAccessibilityAction={(e) => {
                  if (e.nativeEvent.actionName === 'delete') setPhotos((prev) => prev.filter((_, j) => j !== i));
                }}
              >
                <Image source={{ uri: p.uri }} style={styles.photo} />
              </Pressable>
            ))}
          </View>
          {photos.length > 0 && <Text style={styles.small}>Tieni premuta una foto per rimuoverla.</Text>}
          {photos.length > 0 && missingPhotoLocation && (
            <Text style={[styles.hint, styles.hintNeutral, styles.photoHint]} accessibilityLiveRegion="polite">
              {photoLocationHint(missingPhotoLocation)}
            </Text>
          )}
          {photos.length < MAX_PHOTOS && (
            <View style={styles.row}>
              <SmallButton label="Scatta foto" onPress={() => addPhoto(true)} styles={styles} />
              <SmallButton label="Dalla galleria" onPress={() => addPhoto(false)} styles={styles} />
            </View>
          )}
          <Text style={styles.small}>
            Dalla galleria: se la foto contiene il luogo dello scatto, l’app può proporlo come posizione della
            segnalazione. Serve che la fotocamera del telefono salvi la posizione (impostazione «posizione» o
            «tag di localizzazione») e che la foto non sia passata da app che la tolgono, come WhatsApp,
            Telegram o alcune gallerie.
          </Text>
          <Text style={styles.small}>
            {isIntervention
              ? 'Consiglio: una foto prima e una dopo l’intervento.'
              : 'Consiglio: una foto della pianta intera e una delle foglie o dei fiori.'}
          </Text>
        </Step>

        {/* Note */}
        <Step number={isIntervention ? 5 : 4} title="Note (facoltative)" styles={styles}>
          <TextInput
            style={[styles.input, styles.noteInput]}
            placeholder={
              isIntervention
                ? 'Es. superficie trattata, numero di piante, mezzi usati, prossimo controllo…'
                : 'Es. quante piante, estensione, vicino a un corso d’acqua…'
            }
            placeholderTextColor={colors.placeholder}
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={NOTE_MAX}
            accessibilityLabel="Note"
          />
          {note.length > NOTE_MAX * 0.9 && (
            <Text style={styles.noteCount}>
              {note.length.toLocaleString('it-IT')} / {NOTE_MAX.toLocaleString('it-IT')} caratteri
            </Text>
          )}
        </Step>

        {/* Invio */}
        <View style={styles.actions}>
          {!isIntervention && species?.slug && presence && (
            <Text style={[styles.hint, widespread ? styles.hintNeutral : styles.hintImportant]}>
              {widespread
                ? 'Specie già diffusa in Italia: la casella del Ministero è pensata soprattutto per le nuove comparse. Puoi inviare la segnalazione alla Regione o condividerla con l’ente parco.'
                : `Specie ${presence.toLowerCase()} in Italia secondo ISPRA: la tua segnalazione è preziosa per intervenire presto. Inviala al Ministero.`}
            </Text>
          )}
          {isIntervention ? (
            <Pressable
              style={[styles.primary, !ready && styles.disabled]}
              onPress={() => send('save')}
              disabled={!ready}
              accessibilityRole="button"
              accessibilityState={{ disabled: !ready }}
            >
              <Text style={styles.primaryText}>{sending ? 'Salvataggio…' : 'Salva nel taccuino'}</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.primary, !ready && styles.disabled]}
              onPress={() => send('email')}
              disabled={!ready}
              accessibilityRole="button"
              accessibilityState={{ disabled: !ready }}
              accessibilityLabel={`Invia al Ministero dell’Ambiente, email a ${REPORT_EMAIL}`}
            >
              <Text style={styles.primaryText}>{sending ? 'Salvataggio…' : 'Invia al Ministero dell’Ambiente'}</Text>
              <Text style={styles.primarySub}>email a {REPORT_EMAIL}</Text>
            </Pressable>
          )}
          {!isIntervention &&
            offices.map((office) => (
              <Pressable
                key={office.name}
                style={[styles.secondary, !ready && styles.disabled]}
                onPress={() => send({ office })}
                disabled={!ready}
                accessibilityRole="button"
                accessibilityState={{ disabled: !ready }}
                accessibilityLabel={`Invia a ${office.name}, email a ${officeAddress(office)}`}
              >
                <Text style={styles.secondaryText}>Invia a {office.name}</Text>
                <Text style={styles.secondarySub}>
                  {office.email ? `${office.emailLabel}: ${office.email}` : `PEC ${office.pec}`}
                </Text>
              </Pressable>
            ))}
          {!isIntervention && offices.some((o) => !o.email) && <Text style={styles.small}>{PEC_NOTE}</Text>}
          {!isIntervention && offices.length > 1 && (
            <Text style={styles.small}>Scegli la Provincia autonoma in cui hai trovato la pianta.</Text>
          )}
          <Pressable
            style={[styles.secondary, !ready && styles.disabled]}
            onPress={() => send('share')}
            disabled={!ready}
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready }}
          >
            <Text style={styles.secondaryText}>{isIntervention ? 'Salva e condividi…' : 'Condividi…'}</Text>
          </Pressable>
          {!isIntervention && (
            <Pressable
              style={[styles.tertiary, !ready && styles.disabled]}
              onPress={() => send('save')}
              disabled={!ready}
              accessibilityRole="button"
              accessibilityState={{ disabled: !ready }}
            >
              <Text style={styles.tertiaryText}>Salva solo nel taccuino</Text>
            </Pressable>
          )}
          {missing && !sending && <Text style={styles.small}>{missing} per poter salvare.</Text>}
          <Text style={styles.small}>
            {signature.trim()
              ? `Firmata come “${signature.trim()}” (modificabile nelle Impostazioni). `
              : ''}
            Ogni voce resta salvata sul telefono, nel taccuino di campo.
          </Text>
        </View>
      </ScrollView>
    </Modal>
  );
}

function Step({ number, title, children, styles }) {
  return (
    <View style={styles.step}>
      <Text style={styles.stepTitle} accessibilityRole="header">
        <Text style={styles.stepNumber}>{number} </Text>
        {title}
      </Text>
      {children}
    </View>
  );
}

function SmallButton({ label, onPress, disabled, styles }) {
  return (
    <Pressable
      style={[styles.smallButton, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
    >
      <Text style={styles.smallButtonText}>{label}</Text>
    </Pressable>
  );
}

/** Perché la foto appena aggiunta non ha una posizione da proporre (testo dell'avviso). */
function photoLocationHint({ permissionDenied }) {
  if (permissionDenied) {
    return (
      'Questa foto non contiene la posizione: l’app non ha il permesso di leggere la posizione delle foto. ' +
      'Puoi concederlo dalle impostazioni del telefono (App → AlienHub → Autorizzazioni). ' +
      'La foto resta allegata; per la segnalazione si usa la posizione GPS.'
    );
  }
  return (
    'Questa foto non contiene la posizione. Succede se la fotocamera non salvava il luogo dello scatto o se ' +
    'la foto è passata da un’app che lo toglie (WhatsApp, Telegram, alcune gallerie). ' +
    'Per la segnalazione si usa la posizione GPS.'
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
    },
    headerTitle: { fontSize: 17, fontWeight: '700', color: c.text },
    headerAction: { fontSize: 16, color: c.primary, fontWeight: '600' },
    scroll: { backgroundColor: c.background },
    content: { padding: 16 },
    flex: { flex: 1 },
    segmented: {
      flexDirection: 'row',
      backgroundColor: c.surfaceAlt,
      borderRadius: 10,
      padding: 3,
    },
    segment: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
    segmentActive: { backgroundColor: c.primaryFill },
    segmentText: { fontSize: 15, fontWeight: '600', color: c.primary },
    segmentTextActive: { color: c.onPrimary },
    step: { marginTop: 22 },
    stepTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8, color: c.text },
    stepNumber: { color: c.primary },
    row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    choice: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.selected,
      borderRadius: 12,
      padding: 12,
    },
    choiceTitle: { fontSize: 15, fontWeight: '600', color: c.text },
    choiceSubtitle: { fontSize: 13, fontStyle: 'italic', color: c.textSecondary },
    change: { color: c.primary, fontWeight: '600' },
    input: {
      backgroundColor: c.surfaceAlt,
      color: c.text,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
    },
    noteInput: { minHeight: 80, textAlignVertical: 'top' },
    noteCount: { fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 4 },
    speciesList: { marginTop: 6 },
    speciesRow: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.border },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { borderWidth: 1.5, borderColor: c.chipBorder, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
    chipActive: { backgroundColor: c.primaryFill, borderColor: c.primaryFill },
    chipText: { fontSize: 14, color: c.primary },
    chipTextActive: { color: c.onPrimary, fontWeight: '600' },
    coords: { fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'], color: c.text },
    muted: { fontSize: 13, color: c.textMuted },
    warning: { fontSize: 13, color: c.warning, marginTop: 4 },
    small: { fontSize: 12, color: c.textMuted, marginTop: 6 },
    photos: { flexDirection: 'row', gap: 8 },
    photo: { width: 96, height: 96, borderRadius: 10, backgroundColor: c.placeholderBg },
    smallButton: {
      borderWidth: 1.5,
      borderColor: c.primary,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    smallButtonText: { color: c.primary, fontWeight: '600' },
    actions: { marginTop: 26 },
    hint: { fontSize: 13, lineHeight: 19, padding: 10, borderRadius: 10, marginBottom: 12 },
    hintImportant: { backgroundColor: c.hintImportantBg, color: c.hintImportantText },
    hintNeutral: { backgroundColor: c.surfaceAlt, color: c.textSecondary },
    photoHint: { marginTop: 8, marginBottom: 4 },
    primary: { backgroundColor: c.primaryFill, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    primaryText: { color: c.onPrimary, fontSize: 16, fontWeight: '700' },
    primarySub: { color: c.onPrimarySoft, fontSize: 12, marginTop: 2 },
    secondary: {
      marginTop: 10,
      borderRadius: 14,
      paddingVertical: 13,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: c.primary,
    },
    secondaryText: { color: c.primary, fontSize: 16, fontWeight: '700' },
    secondarySub: { color: c.textSecondary, fontSize: 12, marginTop: 2, paddingHorizontal: 8, textAlign: 'center' },
    tertiary: { marginTop: 6, paddingVertical: 10, alignItems: 'center' },
    tertiaryText: { color: c.primary, fontSize: 15, fontWeight: '600' },
    disabled: { opacity: 0.4 },
  });
