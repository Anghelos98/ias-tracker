import { Alert, Linking, Platform, Share } from 'react-native';
import * as MailComposer from 'expo-mail-composer';

import { REPORT_EMAIL } from '../data/legal';
import { reportBody, reportSubject } from './format';
import { markSent } from './storage';

/** Annota l'invio nel taccuino; se non riesce, l'invio resta comunque avvenuto. */
function markSentQuietly(reportId, channel) {
  return markSent(reportId, channel).catch(() => {});
}

/**
 * Email al Ministero dell'Ambiente (casella per le segnalazioni, art. 18 c. 8 D.Lgs. 230/2017)
 * o all'ufficio regionale indicato. Con l'app Mail configurata le foto vengono allegate;
 * altrimenti si apre il programma di posta predefinito con il solo testo.
 * @param {object} report
 * @param {{address: string, channel: string}} [to]  destinatario e voce per il taccuino
 * @returns {Promise<boolean>} true se l'email risulta inviata (o salvata in bozza)
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
    const ok = status === MailComposer.MailComposerStatus.SENT || status === MailComposer.MailComposerStatus.SAVED;
    if (ok) await markSentQuietly(report.id, to.channel);
    return ok;
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
    await markSentQuietly(report.id, to.channel);
    return true;
  }

  Alert.alert(
    'Email non disponibile',
    `Nessun programma di posta configurato. Puoi usare "Condividi" oppure scrivere a ${to.address}.`,
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
    await markSentQuietly(report.id, 'condivisione');
    return true;
  }
  return false;
}
