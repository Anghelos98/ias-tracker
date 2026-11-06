import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_FILTERS } from './points';

// Preferenze dell'utente salvate sul telefono.

const FILTERS_KEY = 'ias-tracker/filters/v1';
const WELCOME_KEY = 'ias-tracker/welcome-seen/v1';
const GRID_KEY = 'ias-tracker/show-grid/v1';

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
