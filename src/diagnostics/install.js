// Importato per primo da index.js: il registro di diagnostica (solo build di prova) deve essere
// attivo prima che si carichi il resto dell'app, per annotare anche gli errori all'avvio.
import { installDiagnostics } from './log';

installDiagnostics();
