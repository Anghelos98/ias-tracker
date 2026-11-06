import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { filterFollowed, hasFollows, newestDate, notificationText, summarize, weeksSince } from '../data/news';
import {
  loadFollows,
  loadNewsNotified,
  loadNewsSeen,
  loadNotify,
  saveNewsNotified,
} from '../data/preferences';
import { REGIONS } from '../data/regions';
import { checkForUpdates, readNews } from '../data/remote';
import { SPECIES } from '../data/species';

// Avviso facoltativo quando l'aggiornamento settimanale dei dati porta novità sulle specie o
// regioni seguite. Nessun server e nessuna posizione: di tanto in tanto il sistema risveglia
// l'app in background (iOS sceglie lui quando, di solito di notte), l'app scarica il manifest
// come farebbe all'apertura e, se ci sono novità non ancora viste o annunciate, mostra una
// notifica locale.

export const NEWS_TASK = 'ias-tracker-news-check';
const CHANNEL_ID = 'novita';
const MINIMUM_INTERVAL_MIN = 12 * 60;

const SPECIES_NAMES = new Map(SPECIES.map((s) => [s.slug, s.commonName]));
const REGION_NAMES = new Map(REGIONS.map((r) => [r.code, r.name]));

/** Novità seguite non ancora viste né annunciate; null se non ce ne sono. */
export async function pendingFollowedNews(manifest) {
  const follows = await loadFollows();
  if (!hasFollows(follows)) return null;
  const news = await readNews(manifest);
  const [seen, notified] = await Promise.all([loadNewsSeen(), loadNewsNotified()]);
  const since = [seen, notified].filter(Boolean).sort().pop() ?? null;
  const followed = filterFollowed(summarize(weeksSince(news, since)), follows);
  return followed.species.length ? { followed, newest: newestDate(news) } : null;
}

async function checkAndNotify() {
  if (!(await loadNotify())) return;
  const { manifest } = await checkForUpdates();
  const pending = await pendingFollowedNews(manifest);
  if (!pending) return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Novità sulle specie che segui',
      body: notificationText(pending.followed.species, SPECIES_NAMES, REGION_NAMES),
      data: { screen: 'novita' },
    },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
  });
  await saveNewsNotified(pending.newest);
}

// L'attività va definita al primo caricamento del modulo, anche quando il sistema avvia
// l'app in background (per questo il modulo è importato da index.js).
TaskManager.defineTask(NEWS_TASK, async () => {
  try {
    await checkAndNotify();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Attiva gli avvisi: chiede il permesso per le notifiche e registra il controllo periodico.
 * @returns {Promise<boolean>} false se l'utente non concede il permesso
 */
export async function enableNewsAlerts() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Novità sulle specie seguite',
      // eslint-disable-next-line import/namespace -- esportato da expo-notifications, non visto dal plugin
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const { granted } = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!granted) return false;
  await BackgroundTask.registerTaskAsync(NEWS_TASK, { minimumInterval: MINIMUM_INTERVAL_MIN });
  return true;
}

export async function disableNewsAlerts() {
  if (await TaskManager.isTaskRegisteredAsync(NEWS_TASK)) await BackgroundTask.unregisterTaskAsync(NEWS_TASK);
}

/** true se il sistema consente le attività in background (l'utente può averle disattivate). */
export async function backgroundAvailable() {
  try {
    return (await BackgroundTask.getStatusAsync()) === BackgroundTask.BackgroundTaskStatus.Available;
  } catch {
    return false;
  }
}
