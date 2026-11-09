import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { AppState, Platform } from 'react-native';

// Registro di diagnostica per le build di prova (beta, RC).
//
// Annota su un file nel telefono errori, avvisi, tappe principali (specie caricata, filtri,
// pannelli, aggiornamento dei dati) e i blocchi dell'interfaccia, così un problema visto "in giro"
// si può capire dopo: dalle Impostazioni → Diagnostica l'utente condivide il file.
//
// - Attivo solo se la build ha EXPO_PUBLIC_DIAGNOSTICS=1 (profilo "preview" in eas.json; in prova
//   con Expo Go: EXPO_PUBLIC_DIAGNOSTICS=1 npx expo start). Nella versione pubblica non c'è: ogni
//   funzione qui sotto non fa nulla.
// - Il file resta sul telefono finché l'utente non lo condivide. Niente note, foto o coordinate:
//   chi registra un evento non deve mettere posizioni nel messaggio.
// - Al massimo MAX_LINES righe: le più vecchie si cancellano. Il file sopravvive al riavvio, così
//   dopo una chiusura improvvisa si vede cosa è successo prima.
// - Un errore nativo che chiude l'app non passa da JavaScript: per quelli serve il registro di
//   sistema di Android (Opzioni sviluppatore → Segnalazione di bug).

export const DIAGNOSTICS_ENABLED = process.env.EXPO_PUBLIC_DIAGNOSTICS === '1';

export const MAX_LINES = 1000;
const MAX_MESSAGE = 1500; // caratteri di un singolo evento
const FLUSH_DELAY_MS = 2000; // scrittura sul file raggruppata
// Blocco dell'interfaccia: un timer che dovrebbe scattare ogni TICK_MS arriva in ritardo di
// almeno STALL_MS (il JavaScript, o il thread dell'interfaccia che guida i timer, era occupato).
const TICK_MS = 250;
const STALL_MS = 500;

const FILE_NAME = 'registro-diagnostica.txt';
const SHARE_PREFIX = 'ias-tracker_'; // i file condivisi si cancellano al successivo avvio (shareFile.js)

let lines = [];
let loaded = false;
let flushTimer = null;
let installed = false;
const context = {}; // stato corrente (es. mappa), riportato nei blocchi dell'interfaccia

function logFile() {
  return new File(Paths.document, FILE_NAME);
}

function pad(n, width = 2) {
  return String(n).padStart(width, '0');
}

/** "2026-11-09 18:03:12.345" (ora locale del telefono). */
export function timestamp(date = new Date()) {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
  );
}

function truncate(text, max = MAX_MESSAGE) {
  return text.length > max ? `${text.slice(0, max)}… (+${text.length - max} caratteri)` : text;
}

/** Testo leggibile di un valore qualsiasi passato a console.warn / console.error. */
export function describeValue(value) {
  if (value instanceof Error) {
    const stack = (value.stack ?? '').split('\n').slice(1, 6).join('\n');
    return `${value.name}: ${value.message}${stack ? `\n${stack}` : ''}`;
  }
  if (typeof value === 'string') return value;
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Una riga del registro; i messaggi su più righe restano leggibili (rientro). */
export function formatLine(category, message, date = new Date()) {
  const text = truncate(String(message)).replace(/\n/g, '\n    ');
  return `${timestamp(date)} [${category}] ${text}`;
}

/** Tiene solo le ultime `max` righe. */
export function keepLast(list, max = MAX_LINES) {
  return list.length > max ? list.slice(list.length - max) : list;
}

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const file = logFile();
    if (file.exists) {
      const previous = file.textSync().split(/\n(?=\d{4}-\d{2}-\d{2} )/);
      lines = keepLast([...previous.filter(Boolean), ...lines]);
    }
  } catch {
    // file illeggibile: si riparte da un registro vuoto
  }
}

/** Scrive subito il registro sul file (dopo un errore grave l'app potrebbe chiudersi). */
export function flushDiagnostics() {
  if (!DIAGNOSTICS_ENABLED) return;
  clearTimeout(flushTimer);
  flushTimer = null;
  try {
    load();
    const file = logFile();
    if (!file.exists) file.create();
    file.writeSync(lines.join('\n'));
  } catch {
    // niente console qui: console.warn passa dal registro e si ripeterebbe all'infinito
  }
}

function scheduleFlush() {
  if (!flushTimer) flushTimer = setTimeout(flushDiagnostics, FLUSH_DELAY_MS);
}

/**
 * Annota un evento. `category` è una parola breve ("mappa", "filtri", "errore"…).
 * Non mettere nel messaggio coordinate, note o altri dati personali.
 */
export function diag(category, message) {
  if (!DIAGNOSTICS_ENABLED) return;
  load();
  lines.push(formatLine(category, message));
  lines = keepLast(lines);
  scheduleFlush();
}

/** Annota un errore e lo scrive subito sul file. */
export function diagError(category, error) {
  if (!DIAGNOSTICS_ENABLED) return;
  diag(category, describeValue(error));
  flushDiagnostics();
}

/**
 * Stato corrente da riportare se l'interfaccia si blocca (es. "mappa" → "zoom 7, 143 elementi").
 * Non viene scritto da solo: compare solo accanto a un blocco.
 */
export function setDiagContext(key, value) {
  if (!DIAGNOSTICS_ENABLED) return;
  if (value == null) delete context[key];
  else context[key] = value;
}

/** Durata di un'operazione: annotata solo se supera `minMs`. */
export function diagDuration(category, label, startMs, minMs = 0) {
  if (!DIAGNOSTICS_ENABLED) return;
  const ms = Date.now() - startMs;
  if (ms >= minMs) diag(category, `${label}: ${ms} ms`);
}

/** Numero di righe nel registro. */
export function diagnosticsCount() {
  if (!DIAGNOSTICS_ENABLED) return 0;
  load();
  return lines.length;
}

/** Svuota il registro (anche il file). */
export function clearDiagnostics() {
  if (!DIAGNOSTICS_ENABLED) return;
  lines = [];
  loaded = true;
  try {
    const file = logFile();
    if (file.exists) file.delete();
  } catch {
    // al peggio resta il file vecchio, che verrà sovrascritto alla prossima scrittura
  }
  diag('registro', 'registro cancellato');
}

/** Apre il foglio di condivisione con una copia del registro. */
export async function shareDiagnostics() {
  if (!DIAGNOSTICS_ENABLED) return;
  flushDiagnostics();
  const now = new Date();
  const name = `${SHARE_PREFIX}registro_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.txt`;
  const copy = new File(Paths.cache, name);
  if (copy.exists) copy.delete();
  copy.create();
  copy.writeSync(`${deviceSummary()}\n\n${lines.join('\n')}\n`);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Condivisione non disponibile');
  await Sharing.shareAsync(copy.uri, { mimeType: 'text/plain', UTI: 'public.plain-text', dialogTitle: name });
}

/** "IAS Tracker 1.0.0 · Android 14 (API 34) · Google Pixel 8 · build". Nessun dato personale. */
export function deviceSummary() {
  const version = Constants.expoConfig?.version ?? '?';
  const env = Constants.executionEnvironment;
  let where = 'build';
  if (env === 'storeClient' || Constants.appOwnership === 'expo') where = 'Expo Go';
  else if (env !== 'standalone' && env !== 'bare') where = `ambiente ${env ?? 'sconosciuto'}`;
  const c = Platform.constants ?? {};
  let system;
  if (Platform.OS === 'android') {
    system = `Android ${c.Release ?? '?'} (API ${Platform.Version}) · ${c.Manufacturer ?? ''} ${c.Model ?? ''}`.trim();
  } else {
    system = `${c.systemName ?? 'iOS'} ${c.osVersion ?? Platform.Version}`;
  }
  return `IAS Tracker ${version} · ${system} · ${where}${__DEV__ ? ' (sviluppo)' : ''}`;
}

function contextSummary() {
  const parts = Object.entries(context).map(([k, v]) => `${k}: ${v}`);
  return parts.length ? ` (${parts.join('; ')})` : '';
}

/**
 * Da chiamare una volta all'avvio (index.js): intercetta errori, avvisi e promesse rifiutate,
 * sorveglia i blocchi dell'interfaccia e salva il registro quando l'app va in secondo piano.
 */
export function installDiagnostics() {
  if (!DIAGNOSTICS_ENABLED || installed) return;
  installed = true;
  diag('avvio', `=== ${deviceSummary()} ===`);

  // avvisi ed errori scritti in console (anche dalle librerie)
  for (const [method, category] of [
    ['warn', 'avviso'],
    ['error', 'errore'],
  ]) {
    const original = console[method];
    console[method] = (...args) => {
      diag(category, args.map(describeValue).join(' '));
      original?.(...args);
    };
  }

  // errori JavaScript non gestiti (in produzione chiudono l'app: si salva subito)
  const errorUtils = global.ErrorUtils;
  if (errorUtils?.setGlobalHandler) {
    const previous = errorUtils.getGlobalHandler?.();
    errorUtils.setGlobalHandler((error, isFatal) => {
      diag(isFatal ? 'errore grave' : 'errore', describeValue(error));
      flushDiagnostics();
      previous?.(error, isFatal);
    });
  }

  // promesse rifiutate senza .catch (Hermes). Sostituisce l'avviso di React Native in modalità
  // sviluppo: passando da console.warn finisce nel registro e resta visibile in sviluppo.
  global.HermesInternal?.enablePromiseRejectionTracker?.({
    allRejections: true,
    onUnhandled: (id, rejection) => console.warn('Promessa rifiutata senza gestione:', rejection),
    onHandled: () => {},
  });

  // blocchi dell'interfaccia; sospeso in secondo piano (lì i timer si fermano di proposito)
  let last = Date.now();
  let watchdog = null;
  const startWatchdog = () => {
    if (watchdog) return;
    last = Date.now();
    watchdog = setInterval(() => {
      const now = Date.now();
      const late = now - last - TICK_MS;
      last = now;
      if (late >= STALL_MS) diag('blocco', `interfaccia ferma per circa ${late} ms${contextSummary()}`);
    }, TICK_MS);
  };
  const stopWatchdog = () => {
    clearInterval(watchdog);
    watchdog = null;
  };
  startWatchdog();

  AppState.addEventListener('change', (state) => {
    diag('app', state === 'active' ? 'in primo piano' : `in secondo piano (${state})`);
    if (state === 'active') startWatchdog();
    else {
      stopWatchdog();
      flushDiagnostics();
    }
  });
}
