// Esito degli invii: "inviata" solo quando il sistema lo conferma. Su Android
// expo-mail-composer risponde sempre "sent" e la condivisione sempre "shared", anche se
// l'utente annulla: lì l'app sa solo che l'invio è stato avviato.
import { Alert, Linking, Platform, Share } from 'react-native';
import * as MailComposer from 'expo-mail-composer';

import { isRecorded, sendByEmail, shareReport } from '../src/reports/send';
import { markSent } from '../src/reports/storage';

jest.mock('../src/reports/storage', () => ({ markSent: jest.fn(async () => []) }));
jest.mock('expo-mail-composer', () => ({
  isAvailableAsync: jest.fn(),
  composeAsync: jest.fn(),
  MailComposerStatus: { SENT: 'sent', SAVED: 'saved', CANCELLED: 'cancelled', UNDETERMINED: 'undetermined' },
}));

const report = {
  id: 'r1',
  createdAt: '2026-11-08T10:00:00.000Z',
  scientificName: 'Ailanthus altissima',
  commonName: 'Ailanto',
  latitude: 41.9,
  longitude: 12.5,
  accuracy: 5,
  locationSource: 'gps',
  note: '',
  photos: [],
  sent: [],
};
const originalOS = Platform.OS;

beforeEach(() => {
  markSent.mockClear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  Platform.OS = originalOS;
  jest.restoreAllMocks();
});

function mailApp(status) {
  MailComposer.isAvailableAsync.mockResolvedValue(true);
  MailComposer.composeAsync.mockResolvedValue({ status });
}

test.each([
  ['ios', 'sent', 'sent', true],
  ['android', 'sent', 'opened', false], // Android: "sent" anche se annullata
  ['ios', 'saved', 'draft', null],
  ['ios', 'cancelled', 'cancelled', null],
  ['android', 'undetermined', 'cancelled', null],
])('app Mail su %s, stato "%s" → %s', async (os, status, expected, confirmed) => {
  Platform.OS = os;
  mailApp(status);
  expect(await sendByEmail(report)).toBe(expected);
  if (confirmed === null) expect(markSent).not.toHaveBeenCalled();
  else expect(markSent).toHaveBeenCalledWith('r1', 'email', confirmed);
});

test('senza app Mail si apre il programma di posta: invio non confermato', async () => {
  MailComposer.isAvailableAsync.mockResolvedValue(false);
  jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  const result = await sendByEmail(report, { address: 'ufficio@regione.it', channel: 'regione' });
  expect(result).toBe('opened');
  expect(open.mock.calls[0][0]).toMatch(/^mailto:ufficio@regione\.it\?subject=/);
  expect(markSent).toHaveBeenCalledWith('r1', 'regione', false);
});

test('nessun programma di posta: avviso, niente annotato', async () => {
  MailComposer.isAvailableAsync.mockResolvedValue(false);
  jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
  expect(await sendByEmail(report)).toBe('unavailable');
  expect(Alert.alert).toHaveBeenCalledWith('Email non disponibile', expect.any(String));
  expect(markSent).not.toHaveBeenCalled();
});

test.each([
  ['ios', 'sharedAction', 'sent', true],
  ['android', 'sharedAction', 'opened', false],
  ['ios', 'dismissedAction', 'cancelled', null],
])('condivisione su %s, %s → %s', async (os, action, expected, confirmed) => {
  Platform.OS = os;
  jest.spyOn(Share, 'share').mockResolvedValue({ action });
  expect(await shareReport(report)).toBe(expected);
  if (confirmed === null) expect(markSent).not.toHaveBeenCalled();
  else expect(markSent).toHaveBeenCalledWith('r1', 'condivisione', confirmed);
});

test("un invio non annotato (es. taccuino pieno) non blocca l'esito", async () => {
  Platform.OS = 'ios';
  mailApp('sent');
  markSent.mockRejectedValueOnce(Object.assign(new Error('Taccuino pieno'), { code: 'full' }));
  expect(await sendByEmail(report)).toBe('sent');
  expect(isRecorded('sent') && isRecorded('opened') && !isRecorded('draft') && !isRecorded('cancelled')).toBe(true);
});
