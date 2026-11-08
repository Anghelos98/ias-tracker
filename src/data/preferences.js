import AsyncStorage from '@react-native-async-storage/async-storage';

import { NO_FOLLOWS, isPlausibleIsoDate } from './news';
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
    if (!raw) return DEFAULT_FILTERS;
    const saved = JSON.parse(raw);
    // solo le chiavi note, con il tipo giusto (dati di versioni precedenti o corrotti)
    const filters = {
      includeAutomatic:
        typeof saved?.includeAutomatic === 'boolean' ? saved.includeAutomatic : DEFAULT_FILTERS.includeAutomatic,
      minYear: Number.isFinite(saved?.minYear) ? saved.minYear : DEFAULT_FILTERS.minYear,
      maxAgeDays: Number.isFinite(saved?.maxAgeDays) ? saved.maxAgeDays : DEFAULT_FILTERS.maxAgeDays,
      lastYears: Number.isFinite(saved?.lastYears) ? saved.lastYears : DEFAULT_FILTERS.lastYears,
      maxUncertainty: Number.isFinite(saved?.maxUncertainty) ? saved.maxUncertainty : DEFAULT_FILTERS.maxUncertainty,
    };
    // Versione precedente: "Ultimi 5 anni" era salvato come anno fisso (anno in corso - 4).
    if (
      saved &&
      typeof saved === 'object' &&
      !('lastYears' in saved) &&
      filters.minYear === new Date().getFullYear() - 4 &&
      filters.maxAgeDays == null
    ) {
      return { ...filters, minYear: null, lastYears: 5 };
    }
    return filters;
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
    return {
      species: Array.isArray(saved?.species) ? saved.species : [],
      regions: Array.isArray(saved?.regions) ? saved.regions : [],
    };
  } catch {
    return NO_FOLLOWS;
  }
}

export function saveFollows(follows) {
  return AsyncStorage.setItem(FOLLOWS_KEY, JSON.stringify(follows)).catch(() => {});
}

/**
 * Data salvata (ISO) solo se plausibile: una data nel futuro, salvata da una versione precedente
 * con dati scaricati sbagliati, farebbe considerare già viste tutte le novità successive.
 */
async function loadDate(key) {
  try {
    const value = await AsyncStorage.getItem(key);
    return isPlausibleIsoDate(value) ? value : null;
  } catch {
    return null;
  }
}

/** Data (ISO) dell'ultimo aggiornamento di cui l'utente ha visto le novità. */
export function loadNewsSeen() {
  return loadDate(NEWS_SEEN_KEY);
}

export function saveNewsSeen(isoDate) {
  return AsyncStorage.setItem(NEWS_SEEN_KEY, isoDate).catch(() => {});
}

/** Data (ISO) dell'ultimo aggiornamento già annunciato con una notifica. */
export function loadNewsNotified() {
  return loadDate(NEWS_NOTIFIED_KEY);
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

// --- Impostazioni ----------------------------------------------------------------------

const THEME_KEY = 'ias-tracker/theme/v1';
const MAP_TYPE_KEY = 'ias-tracker/map-type/v1';
const SIGNATURE_KEY = 'ias-tracker/signature/v1';

export const THEMES = ['auto', 'light', 'dark'];
export const MAP_TYPES = ['standard', 'satellite', 'hybrid'];
/** Lunghezza massima della firma delle segnalazioni (nome ed ente). */
export const SIGNATURE_MAX = 120;

async function loadChoice(key, allowed) {
  try {
    const value = await AsyncStorage.getItem(key);
    return allowed.includes(value) ? value : allowed[0];
  } catch {
    return allowed[0];
  }
}

/** Tema: 'auto' (come il telefono), 'light' o 'dark'. */
export function loadTheme() {
  return loadChoice(THEME_KEY, THEMES);
}

export function saveTheme(theme) {
  return AsyncStorage.setItem(THEME_KEY, theme).catch(() => {});
}

/** Tipo di mappa: 'standard', 'satellite' o 'hybrid' (satellite con strade e nomi). */
export function loadMapType() {
  return loadChoice(MAP_TYPE_KEY, MAP_TYPES);
}

export function saveMapType(mapType) {
  return AsyncStorage.setItem(MAP_TYPE_KEY, mapType).catch(() => {});
}

/** Firma facoltativa aggiunta alle segnalazioni inviate (salvata sul telefono, mai inviata allo sviluppatore). */
export async function loadSignature() {
  try {
    return ((await AsyncStorage.getItem(SIGNATURE_KEY)) ?? '').slice(0, SIGNATURE_MAX);
  } catch {
    return '';
  }
}

export function saveSignature(signature) {
  return AsyncStorage.setItem(SIGNATURE_KEY, signature.slice(0, SIGNATURE_MAX)).catch(() => {});
}
