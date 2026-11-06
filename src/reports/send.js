import { Alert, Linking, Platform, Share } from 'react-native';
import * as MailComposer from 'expo-mail-composer';

import { REPORT_EMAIL } from '../data/legal';
import { markSent } from './storage';

function formatCoordinate(value) {
  return value.toFixed(6);
}

export function reportSubject(report) {
  return `Segnalazione specie esotica invasiva: ${report.scientificName}`;
}

/** Testo della segnalazione, uguale per email e condivisione. */
export function reportBody(report) {
  const date = new Date(report.createdAt).toLocaleString('it-IT', {
    dateStyle: 'long',
    timeStyle: 'short',
  });
  const lat = formatCoordinate(report.latitude);
  const lon = formatCoordinate(report.longitude);
  const accuracy = report.accuracy != null ? ` (precisione ± ${Math.round(report.accuracy)} m)` : '';
  const source = report.locationSource === 'foto' ? ' – posizione ricavata dalla foto' : ' – posizione GPS';
  const lines = [
    'Segnalazione di specie esotica invasiva di rilevanza unionale (Reg. UE 1143/2014, D.Lgs. 230/2017).',
    '',
    `Specie: ${report.commonName} (${report.scientificName})`,
    `Data e ora: ${date}`,
    `Coordinate (WGS84): ${lat}, ${lon}${accuracy}${source}`,
    `Mappa: https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`,
  ];
  if (report.note?.trim()) lines.push(`Note: ${report.note.trim()}`);
  lines.push(
    `Foto: ${report.photos.length ? `${report.photos.length} allegate` : 'nessuna'}`,
    '',
    'Inviata con IAS Tracker, app gratuita e open source.',
  );
  return lines.join('\n');
}

/**
 * Email al Ministero dell'Ambiente (casella per le segnalazioni, art. 18 c. 8 D.Lgs. 230/2017).
 * Con l'app Mail configurata le foto vengono allegate; altrimenti si apre il programma di
 * posta predefinito con il solo testo.
 * @returns {Promise<boolean>} true se l'email risulta inviata (o salvata in bozza)
 */
export async function sendByEmail(report) {
  const subject = reportSubject(report);
  const body = reportBody(report);

  if (await MailComposer.isAvailableAsync()) {
    const { status } = await MailComposer.composeAsync({
      recipients: [REPORT_EMAIL],
      subject,
      body,
      attachments: report.photos,
    });
    const ok = status === MailComposer.MailComposerStatus.SENT || status === MailComposer.MailComposerStatus.SAVED;
    if (ok) await markSent(report.id, 'email');
    return ok;
  }

  const url = `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  if (await Linking.canOpenURL(url)) {
    if (report.photos.length) {
      Alert.alert(
        'Foto da allegare',
        'Il programma di posta si aprirà con il testo già compilato, ma non è possibile allegare le foto ' +
          'automaticamente: aggiungile dalla galleria prima di inviare.',
      );
    }
    await Linking.openURL(url);
    await markSent(report.id, 'email');
    return true;
  }

  Alert.alert(
    'Email non disponibile',
    `Nessun programma di posta configurato. Puoi usare "Condividi" oppure scrivere a ${REPORT_EMAIL}.`,
  );
  return false;
}

/**
 * Condivisione con qualsiasi app (Regione, ente parco, messaggi…). Su iOS viene condivisa
 * anche la prima foto; su Android solo il testo (limite del foglio di condivisione di sistema).
 */
export async function shareReport(report) {
  const message = reportBody(report);
  const content =
    Platform.OS === 'ios' && report.photos[0] ? { message, url: report.photos[0] } : { message, title: reportSubject(report) };
  const result = await Share.share(content, { subject: reportSubject(report) });
  if (result.action === Share.sharedAction) {
    await markSent(report.id, 'condivisione');
    return true;
  }
  return false;
}

/** Posizione GPS contenuta nei dati EXIF di una foto, se presente. */
export function gpsFromExif(exif) {
  if (!exif) return null;
  const toDecimal = (value) => {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return null;
    // formato razionale "41/1,53/1,4567/100" (gradi, minuti, secondi)
    const parts = value.split(',').map((p) => {
      const [n, d] = p.split('/').map(Number);
      return d ? n / d : n;
    });
    if (parts.some(Number.isNaN)) return null;
    return (parts[0] ?? 0) + (parts[1] ?? 0) / 60 + (parts[2] ?? 0) / 3600;
  };
  const gps = exif['{GPS}'] ?? exif;
  const lat = toDecimal(gps.Latitude ?? gps.GPSLatitude);
  const lon = toDecimal(gps.Longitude ?? gps.GPSLongitude);
  if (lat == null || lon == null || (lat === 0 && lon === 0)) return null;
  const latRef = gps.LatitudeRef ?? gps.GPSLatitudeRef;
  const lonRef = gps.LongitudeRef ?? gps.GPSLongitudeRef;
  return {
    latitude: latRef === 'S' ? -Math.abs(lat) : lat,
    longitude: lonRef === 'W' ? -Math.abs(lon) : lon,
  };
}
