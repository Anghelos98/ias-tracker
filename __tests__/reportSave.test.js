// Modulo di segnalazione con il taccuino che non accetta la voce (pieno o non leggibile):
// la segnalazione si può comunque inviare, e se non parte il modulo resta aperto.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import ReportScreen from '../src/components/ReportScreen';
import { SPECIES } from '../src/data/species';
import { sendByEmail, shareReport } from '../src/reports/send';
import { addReport } from '../src/reports/storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: 41.9, longitude: 12.5, accuracy: 5 } })),
  Accuracy: { High: 4 },
}));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-file-system', () => ({ Paths: {}, File: jest.fn(), Directory: jest.fn() }));
jest.mock('expo-mail-composer', () => ({}));
jest.mock('../src/reports/storage', () => ({
  addReport: jest.fn(),
  newReportId: () => 'r1',
  persistPhotos: jest.fn(async () => []),
}));
jest.mock('../src/reports/send', () => ({
  ...jest.requireActual('../src/reports/send'),
  sendByEmail: jest.fn(),
  shareReport: jest.fn(),
  alertDraft: jest.fn(),
}));

const ailanto = SPECIES.find((s) => s.slug === 'ailanthus-altissima');
const full = () => Object.assign(new Error('Taccuino pieno'), { code: 'full' });
const MINISTRY = 'Invia al Ministero dell’Ambiente';

let onClose;
beforeEach(() => {
  onClose = jest.fn();
  addReport.mockReset();
  sendByEmail.mockReset();
  shareReport.mockReset();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function openForm() {
  await render(<ReportScreen visible initialSpecies={ailanto} onClose={onClose} onOpenNotebook={() => {}} />);
  await screen.findByText(/41\.900000/); // posizione GPS letta: il modulo è pronto
}

test('taccuino pieno, email aperta: inviata senza salvare, con avviso', async () => {
  addReport.mockRejectedValue(full());
  sendByEmail.mockResolvedValue('opened');
  await openForm();
  await fireEvent.press(screen.getByText(MINISTRY));
  expect(sendByEmail).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledWith('Taccuino pieno', expect.stringContaining('comunque passata'));
});

test('taccuino pieno, email annullata: il modulo resta aperto (niente va perso)', async () => {
  addReport.mockRejectedValue(full());
  sendByEmail.mockResolvedValue('cancelled');
  await openForm();
  await fireEvent.press(screen.getByText(MINISTRY));
  expect(onClose).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledWith('Taccuino pieno', expect.stringContaining('il modulo resta aperto'));
  expect(screen.getByText(MINISTRY)).toBeTruthy(); // si può riprovare
});

test('taccuino pieno, "Salva solo nel taccuino": nessun invio, modulo aperto', async () => {
  addReport.mockRejectedValue(full());
  await openForm();
  await fireEvent.press(screen.getByText('Salva solo nel taccuino'));
  expect(sendByEmail).not.toHaveBeenCalled();
  expect(shareReport).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledWith('Taccuino pieno', expect.stringContaining('Puoi comunque inviarla'));
});

test('errore imprevisto nel salvataggio: come prima, nessun invio e modulo aperto', async () => {
  addReport.mockRejectedValue(new Error('disco'));
  await openForm();
  await fireEvent.press(screen.getByText(MINISTRY));
  expect(sendByEmail).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledWith('Errore', 'Non è stato possibile salvare. Riprova.');
});

test('salvata e rimasta in bozza (iOS): avviso della bozza', async () => {
  const { alertDraft } = require('../src/reports/send');
  addReport.mockResolvedValue([]);
  sendByEmail.mockResolvedValue('draft');
  await openForm();
  await fireEvent.press(screen.getByText(MINISTRY));
  expect(onClose).toHaveBeenCalled();
  expect(alertDraft).toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalledWith('Salvato nel taccuino', expect.any(String));
});
