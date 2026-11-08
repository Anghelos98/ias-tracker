import { useCallback, useEffect, useRef } from 'react';

// Tempo tra la chiusura di una schermata (Modal) e l'apertura della successiva: copre
// l'animazione di chiusura dei pannelli dal basso (200 ms) e quella delle schede (pageSheet).
export const MODAL_SWITCH_MS = 400;

/**
 * Apertura di una schermata dopo la chiusura di un'altra.
 *
 * iOS presenta una sola Modal alla volta. React Native segna la Modal come presentata PRIMA
 * di chiedere a iOS di mostrarla: se in quel momento ne è già presentata un'altra, iOS rifiuta
 * e la Modal resta "presentata" solo per React Native. Non compare e non si riapre più finché
 * `visible` non torna a false, cosa che dall'interfaccia non si può fare perché non c'è nulla
 * da chiudere. Per questo:
 * - c'è al massimo un'apertura in attesa: una nuova richiesta sostituisce la precedente;
 * - allo scadere, l'apertura avviene solo se nessun'altra schermata è aperta (`busyRef`):
 *   se nel frattempo l'utente ne ha aperta una, la sua scelta più recente vince.
 *
 * @param {{ current: boolean }} busyRef  true se una schermata è aperta
 * @returns {(open: () => void) => void}
 */
export function useDeferredOpen(busyRef, delay = MODAL_SWITCH_MS) {
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  return useCallback(
    (open) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        if (!busyRef.current) open();
      }, delay);
    },
    [busyRef, delay],
  );
}
