// Rete di sicurezza: un errore durante il disegno mostra un messaggio (invece di chiudere
// l'app) e permette di riprovare, anche dopo aver eliminato i dati scaricati.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import ErrorBoundary from '../src/components/ErrorBoundary';
import { clearDownloadedData } from '../src/data/remote';

jest.mock('../src/data/remote', () => ({ clearDownloadedData: jest.fn(async () => {}) }));

const state = { broken: true };
const rendered = jest.fn();

function Screen() {
  rendered();
  if (state.broken) throw new Error('dato con una forma inattesa');
  return <Text>Mappa</Text>;
}

beforeEach(() => {
  state.broken = true;
  rendered.mockClear();
  clearDownloadedData.mockClear();
  jest.spyOn(console, 'error').mockImplementation(() => {}); // React segnala l'errore intercettato
});

afterEach(() => {
  console.error.mockRestore();
});

test('un errore mostra il messaggio; "Riprova" fa ripartire la schermata', async () => {
  await render(
    <ErrorBoundary>
      <Screen />
    </ErrorBoundary>,
  );
  expect(screen.getByText('Qualcosa non ha funzionato')).toBeTruthy();
  expect(screen.queryByText('Mappa')).toBeNull();

  state.broken = false;
  await fireEvent.press(screen.getByText('Riprova'));
  expect(screen.getByText('Mappa')).toBeTruthy();
  expect(clearDownloadedData).not.toHaveBeenCalled();
});

test('errore che si ripete: si eliminano i dati scaricati e si riprova', async () => {
  await render(
    <ErrorBoundary>
      <Screen />
    </ErrorBoundary>,
  );
  await fireEvent.press(screen.getByText('Riprova'));
  expect(screen.getByText('Qualcosa non ha funzionato')).toBeTruthy(); // l'errore si ripete

  clearDownloadedData.mockImplementationOnce(async () => {
    state.broken = false; // i dati inclusi nell'app non causano l'errore
  });
  await fireEvent.press(screen.getByText('Elimina i dati scaricati e riprova'));
  await act(async () => {}); // fine dell'eliminazione (asincrona)
  expect(clearDownloadedData).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Mappa')).toBeTruthy();
});

test("se l'eliminazione non riesce si riprova comunque", async () => {
  clearDownloadedData.mockImplementationOnce(async () => {
    throw new Error('disco pieno');
  });
  await render(
    <ErrorBoundary>
      <Screen />
    </ErrorBoundary>,
  );
  const before = rendered.mock.calls.length;
  await fireEvent.press(screen.getByText('Elimina i dati scaricati e riprova'));
  await act(async () => {}); // fine dell'eliminazione (asincrona)
  expect(rendered.mock.calls.length).toBeGreaterThan(before);
  expect(screen.getByText('Qualcosa non ha funzionato')).toBeTruthy();
});
