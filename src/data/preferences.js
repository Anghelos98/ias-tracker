import AsyncStorage from '@react-native-async-storage/async-storage';

import { NO_FOLLOWS } from './news';
import { DEFAULT_FILTERS } from './points';

// Preferenze dell'utente salvate sul telefono.

const FILTERS_KEY = 'ias-tracker/filters/v1';
const WELCOME_KEY = 'ias-tracker/welcome-seen/v1';
const GRID_KEY = 'ias-tracker/show-grid/v1';
const FOLLOWS_KEY = 'ias-tracker/follows/v1';
const NEWS_SEEN_KEY = 'ias-tracker/news-seen/v1';
const NEWS_NOTIFIED_KEY = 'ias-tracker/news-notified/v1';
const NOTIFY_KEY = 'ias-tracker/notify/v1';

export async function loadShowGrid() {
  try {
    return (await AsyncStorage.getItem(GRID_KEY)) === '1';
  } catch {
    return false;
  }
}

export function saveShowGrid(show) {
  return AsyncStorage.setItem(GRID_KEY, show ? '1' : '0').catch(() => {});
}

export async function loadFilters() {
  try {
    const raw = await AsyncStorage.getItem(FILTERS_KEY);
    return raw ? { ...DEFAULT_FILTERS, ...JSON.parse(raw) } : DEFAULT_FILTERS;
  } catch {
    return DEFAULT_FILTERS;
  }
}

export function saveFilters(filters) {
  return AsyncStorage.setItem(FILTERS_KEY, JSON.stringify(filters)).catch(() => {});
}

export async function hasSeenWelcome() {
  try {
    return (await AsyncStorage.getItem(WELCOME_KEY)) === '1';
  } catch {
    return true; // in caso di errore non insistere con il benvenuto
  }
}

export function markWelcomeSeen() {
  return AsyncStorage.setItem(WELCOME_KEY, '1').catch(() => {});
}

/** Specie (slug) e regioni (codice ISTAT) seguite. */
export async function loadFollows() {
  try {
    const raw = await AsyncStorage.getItem(FOLLOWS_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    return { species: saved.species ?? [], regions: saved.regions ?? [] };
  } catch {
    return NO_FOLLOWS;
  }
}

export function saveFollows(follows) {
  return AsyncStorage.setItem(FOLLOWS_KEY, JSON.stringify(follows)).catch(() => {});
}

/** Data (ISO) dell'ultimo aggiornamento di cui l'utente ha visto le novità. */
export async function loadNewsSeen() {
  try {
    return await AsyncStorage.getItem(NEWS_SEEN_KEY);
  } catch {
    return null;
  }
}

export function saveNewsSeen(isoDate) {
  return AsyncStorage.setItem(NEWS_SEEN_KEY, isoDate).catch(() => {});
}

/** Data (ISO) dell'ultimo aggiornamento già annunciato con una notifica. */
export async function loadNewsNotified() {
  try {
    return await AsyncStorage.getItem(NEWS_NOTIFIED_KEY);
  } catch {
    return null;
  }
}

export function saveNewsNotified(isoDate) {
  return AsyncStorage.setItem(NEWS_NOTIFIED_KEY, isoDate).catch(() => {});
}

export async function loadNotify() {
  try {
    return (await AsyncStorage.getItem(NOTIFY_KEY)) === '1';
  } catch {
    return false;
  }
}

export function saveNotify(enabled) {
  return AsyncStorage.setItem(NOTIFY_KEY, enabled ? '1' : '0').catch(() => {});
}
