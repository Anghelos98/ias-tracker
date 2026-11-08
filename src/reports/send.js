import { Alert, Linking, Platform, Share } from 'react-native';
import * as MailComposer from 'expo-mail-composer';

import { REPORT_EMAIL } from '../data/legal';
import { reportBody, reportSubject } from './format';
import { markSent } from './storage';

/**
 * Esito di un invio, come lo può sapere l'app:
 * - 'sent': il sistema conferma che l'email è partita (o la condivisione è stata completata);
 * - 'opened': si sono aperti l'app di posta o il foglio di condivisione, ma l'invio non si può
 *   verificare. Su Android expo-mail-composer risponde sempre "sent" e la condivisione sempre
 *   "shared", anche se l'utente annulla (verificato nel codice nativo delle due librerie);
 * - 'draft': l'email è stata salvata tra le bozze dell'app Mail (iOS), non inviata;
 * - 'cancelled': annullato; 'unavailable': nessun programma di posta (avviso già mostrato).
 * @typedef {'sent'|'opened'|'draft'|'cancelled'|'unavailable'} SendResult
 */

/** L'invio è stato annotato nel taccuino (confermato o no)? */
export const isRecorded = (result) => result === 'sent' || result === 'opened';

/** Annota l'invio nel taccuino; se non riesce, l'invio resta comunque avvenuto. */
function markSentQuietly(reportId, channel, result) {
  if (!isRecorded(result)) return Promise.resolve();
  return markSent(reportId, channel, result === 'sent').catch(() => {});
}

/**
 * Email al Ministero dell'Ambiente (casella per le segnalazioni, art. 18 c. 8 D.Lgs. 230/2017)
 * o all'ufficio regionale indicato. Con l'app Mail configurata le foto vengono allegate;
 * altrimenti si apre il programma di posta predefinito con il solo testo.
 * @param {object} report
 * @param {{address: string, channel: string}} [to]  destinatario e voce per il taccuino
 * @returns {Promise<SendResult>}
 */
export async function sendByEmail(report, to = { address: REPORT_EMAIL, channel: 'email' }) {
  const subject = reportSubject(report);
  const body = reportBody(report);

  if (await MailComposer.isAvailableAsync()) {
    const { status } = await MailComposer.composeAsync({
      recipients: [to.address],
      subject,
      body,
      attachments: report.photos,
    });
    let result = 'cancelled';
    if (status === MailComposer.MailComposerStatus.SENT) result = Platform.OS === 'ios' ? 'sent' : 'opened';
    else if (status === MailComposer.MailComposerStatus.SAVED) result = 'draft';
    await markSentQuietly(report.id, to.channel, result);
    return result;
  }

  const url = `mailto:${to.address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  if (await Linking.canOpenURL(url)) {
    if (report.photos.length) {
      Alert.alert(
        'Foto da allegare',
        'Il programma di posta si aprirà con il testo già compilato, ma non è possibile allegare le foto ' +
          'automaticamente: aggiungile dalla galleria prima di inviare.',
      );
    }
    await Linking.openURL(url);
    await markSentQuietly(report.id, to.channel, 'opened'); // l'app non sa se verrà inviata
    return 'opened';
  }

  Alert.alert(
    'Email non disponibile',
    `Nessun programma di posta configurato. Puoi usare "Condividi" oppure scrivere a ${to.address}.`,
  );
  return 'unavailable';
}

/**
 * Condivisione con qualsiasi app (Regione, ente parco, messaggi…). Su iOS viene condivisa
 * anche la prima foto; su Android solo il testo (limite del foglio di condivisione di sistema).
 * @returns {Promise<SendResult>}
 */
export async function shareReport(report) {
  const message = reportBody(report);
  const content =
    Platform.OS === 'ios' && report.photos[0] ? { message, url: report.photos[0] } : { message, title: reportSubject(report) };
  const shared = await Share.share(content, { subject: reportSubject(report) });
  let result = 'cancelled';
  if (shared.action === Share.sharedAction) result = Platform.OS === 'ios' ? 'sent' : 'opened';
  await markSentQuietly(report.id, 'condivisione', result);
  return result;
}

/** Avviso per un'email rimasta in bozza (iOS): l'utente deve inviarla dall'app Mail. */
export function alertDraft() {
  Alert.alert('Email in bozza', 'L’email è stata salvata tra le bozze dell’app Mail: inviala da lì.');
}
