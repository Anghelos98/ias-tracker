import { registerRootComponent } from 'expo';

// Definisce l'attività in background degli avvisi sulle novità: deve avvenire al caricamento,
// anche quando il sistema avvia l'app solo per eseguirla.
import './src/notifications/newsAlerts';
import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
