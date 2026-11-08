import { renderHook } from '@testing-library/react-native';

import { MODAL_SWITCH_MS, useDeferredOpen } from '../src/hooks/useDeferredOpen';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function setup(busy = false) {
  const busyRef = { current: busy };
  const { result, unmount } = await renderHook(() => useDeferredOpen(busyRef));
  return { busyRef, openAfterClose: result.current, unmount };
}

test("apre la schermata dopo l'animazione di chiusura della precedente", async () => {
  const { openAfterClose } = await setup();
  const open = jest.fn();
  openAfterClose(open);
  jest.advanceTimersByTime(MODAL_SWITCH_MS - 1);
  expect(open).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(open).toHaveBeenCalledTimes(1);
});

test("una nuova richiesta sostituisce quella in attesa: mai due schermate aperte insieme", async () => {
  const { openAfterClose } = await setup();
  const first = jest.fn();
  const second = jest.fn();
  openAfterClose(first);
  jest.advanceTimersByTime(MODAL_SWITCH_MS / 2);
  openAfterClose(second);
  jest.advanceTimersByTime(MODAL_SWITCH_MS);
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
});

test("non apre se nel frattempo è stata aperta un'altra schermata (es. elenco all'avvio)", async () => {
  const { busyRef, openAfterClose } = await setup();
  const open = jest.fn();
  openAfterClose(open);
  busyRef.current = true; // l'elenco delle specie si apre durante l'attesa
  jest.advanceTimersByTime(MODAL_SWITCH_MS);
  expect(open).not.toHaveBeenCalled();
});

test("l'apertura in attesa si annulla con lo smontaggio", async () => {
  const { openAfterClose, unmount } = await setup();
  const open = jest.fn();
  openAfterClose(open);
  await unmount();
  jest.advanceTimersByTime(MODAL_SWITCH_MS);
  expect(open).not.toHaveBeenCalled();
});
