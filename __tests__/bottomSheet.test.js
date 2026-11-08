// Pannello dal basso: si chiude toccando lo sfondo; chiuso dal genitore, scende e poi sparisce.

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import BottomSheet, { SheetScrollView } from '../src/components/BottomSheet';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({ __esModule: true, default: () => 'light' }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const sheet = (visible, onClose) => (
  <BottomSheet visible={visible} onClose={onClose} closeLabel="Chiudi prova" header={<Text>Titolo</Text>}>
    <SheetScrollView>
      <Text>Contenuto</Text>
    </SheetScrollView>
  </BottomSheet>
);

test('tocco sullo sfondo: chiede la chiusura', async () => {
  const onClose = jest.fn();
  await render(sheet(true, onClose));
  expect(screen.getByText('Titolo')).toBeTruthy();
  expect(screen.getByText('Contenuto')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Chiudi prova'));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('chiuso dal genitore: sparisce dopo l’animazione, riaperto ricompare', async () => {
  jest.useFakeTimers();
  try {
    const { rerender } = await render(sheet(true, jest.fn()));
    await rerender(sheet(false, jest.fn()));
    expect(screen.getByText('Contenuto')).toBeTruthy(); // ancora in animazione
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.queryByText('Contenuto')).toBeNull();
    await rerender(sheet(true, jest.fn()));
    expect(screen.getByText('Contenuto')).toBeTruthy();
  } finally {
    jest.useRealTimers();
  }
});
