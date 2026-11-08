import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  FlatList,
  GestureDetector,
  GestureHandlerRootView,
  ScrollView,
  usePanGesture,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemedStyles } from '../theme';

// Pannello che sale dal basso (elenco specie, Filtri, Vicino a me).
//
// Si chiude toccando lo sfondo scuro, con il tasto Indietro (Android) o trascinandolo verso il
// basso: il pannello segue il dito e lo sfondo si schiarisce di pari passo; lasciato oltre una
// soglia (o con un gesto rapido) si chiude, altrimenti torna su.
// - Dalla maniglia e dall'intestazione (`header`) si trascina sempre.
// - Dal contenuto si trascina solo verso il basso e quando l'elenco è in cima: altrimenti il
//   gesto scorre l'elenco. Per questo l'elenco è SheetFlatList / SheetScrollView.
// Il trascinamento è riconosciuto da react-native-gesture-handler (riconoscitori nativi): con il
// sistema dei tocchi di React Native (PanResponder) sul telefono non partiva.
// Apertura e chiusura sono animate qui (Modal senza animazione propria), così la chiusura
// parte dal punto in cui il dito ha lasciato il pannello.

const OPEN_MS = 260;
const CLOSE_MS = 200;
const CLOSE_DISTANCE = 120; // trascinato oltre questa distanza (px) si chiude…
const CLOSE_VELOCITY = 800; // …oppure con un gesto rapido verso il basso (px/s)

// Trascinamento: parte dopo 8 px in verticale; un movimento orizzontale di 20 px lo annulla.
const DRAG_START = 8;
const DRAG_FAIL_X = [-20, 20];

const SheetScrollContext = createContext(null);

/** Proprietà da passare alla ScrollView / FlatList del contenuto di un BottomSheet. */
export function useSheetScrollProps() {
  return useContext(SheetScrollContext) ?? {};
}

/** ScrollView del contenuto di un BottomSheet (in cima, il gesto verso il basso chiude il pannello). */
export function SheetScrollView(props) {
  return <ScrollView {...useSheetScrollProps()} {...props} />;
}

/** FlatList del contenuto di un BottomSheet (in cima, il gesto verso il basso chiude il pannello). */
export function SheetFlatList(props) {
  return <FlatList {...useSheetScrollProps()} {...props} />;
}

export default function BottomSheet({ visible, onClose, closeLabel, maxHeight, paddingBottom, header, children }) {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const offscreen = screenHeight;
  // Spostamento del pannello verso il basso: 0 = aperto, `offscreen` = fuori dallo schermo.
  const [translateY] = useState(() => new Animated.Value(offscreen));
  // Modal presente: resta montata durante l'animazione di chiusura, poi sparisce.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true); // apertura: stato aggiornato durante il render
  const atTopRef = useRef(true); // elenco del contenuto in cima
  const dragRef = useRef(false); // il gesto in corso sta trascinando il pannello
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Apertura: la Modal compare e il pannello sale. Chiusura (visible = false, da qualunque
  // parte arrivi): il pannello scende dal punto in cui si trova, poi la Modal sparisce.
  useEffect(() => {
    if (visible) return undefined;
    const animation = Animated.timing(translateY, {
      toValue: offscreen,
      duration: CLOSE_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setMounted(false); // non se nel frattempo è stato riaperto
    });
    return () => animation.stop();
  }, [visible, offscreen, translateY]);

  useEffect(() => {
    if (!visible || !mounted) return undefined;
    atTopRef.current = true;
    const animation = Animated.timing(translateY, {
      toValue: 0,
      duration: OPEN_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [visible, mounted, translateY]);

  const snapBack = useCallback(() => {
    Animated.spring(translateY, { toValue: 0, bounciness: 4, speed: 18, useNativeDriver: true }).start();
  }, [translateY]);

  // Funzioni del gesto (eseguite in JavaScript: Reanimated non è installato).
  const startDrag = useCallback(
    (fromList) => {
      // dal contenuto si trascina solo se l'elenco è in cima all'inizio del gesto
      dragRef.current = !fromList || atTopRef.current;
      if (dragRef.current) translateY.stopAnimation();
    },
    [translateY],
  );
  const moveDrag = useCallback(
    (e) => {
      if (dragRef.current) translateY.setValue(Math.max(0, e.translationY));
    },
    [translateY],
  );
  const endDrag = useCallback(
    (e) => {
      if (!dragRef.current) return;
      dragRef.current = false;
      if (!e.canceled && (e.translationY > CLOSE_DISTANCE || e.velocityY > CLOSE_VELOCITY)) onCloseRef.current?.();
      else snapBack();
    },
    [snapBack],
  );

  const startFromHeader = useCallback(() => startDrag(false), [startDrag]);
  const startFromList = useCallback(() => startDrag(true), [startDrag]);

  // Dalla maniglia e dall'intestazione: trascinamento verticale.
  const headerPan = usePanGesture({
    disableReanimated: true,
    activeOffsetY: [-DRAG_START, DRAG_START],
    failOffsetX: DRAG_FAIL_X,
    onActivate: startFromHeader,
    onUpdate: moveDrag,
    onDeactivate: endDrag,
  });
  // Dal contenuto: solo verso il basso (verso l'alto il gesto fallisce e scorre l'elenco),
  // insieme allo scorrimento dell'elenco (simultaneousWith in scrollProps).
  const bodyPan = usePanGesture({
    disableReanimated: true,
    activeOffsetY: [-1000, DRAG_START],
    failOffsetY: [-DRAG_START, 1000],
    failOffsetX: DRAG_FAIL_X,
    onActivate: startFromList,
    onUpdate: moveDrag,
    onDeactivate: endDrag,
  });

  const scrollProps = useMemo(
    () => ({
      onScroll: (e) => {
        atTopRef.current = e.nativeEvent.contentOffset.y <= 0;
      },
      scrollEventThrottle: 16,
      bounces: false, // in cima il gesto verso il basso trascina il pannello, non l'elenco
      simultaneousWith: bodyPan, // l'elenco scorre e il pannello si trascina con lo stesso gesto
    }),
    [bodyPan],
  );

  const backdropOpacity = useMemo(
    () => translateY.interpolate({ inputRange: [0, offscreen], outputRange: [1, 0], extrapolate: 'clamp' }),
    [translateY, offscreen],
  );

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* iOS: con la tastiera aperta il pannello sale sopra di essa (prima, con pochi risultati
          nella ricerca, si abbassava e finiva dietro la tastiera) e si accorcia se serve */}
      {/* i gesti nativi dentro una Modal richiedono una propria radice */}
      <GestureHandlerRootView style={styles.fill}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.root, { paddingTop: insets.top + 8 }]}
        >
          <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} pointerEvents="none" />
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
          />
          <Animated.View style={[styles.sheet, { maxHeight, paddingBottom, transform: [{ translateY }] }]}>
            {/* collapsable={false}: viste native vere su cui agganciare i gesti (React Native
              "appiattisce" i contenitori senza aspetto proprio) */}
            <GestureDetector gesture={headerPan}>
              <View collapsable={false}>
                <View collapsable={false} style={styles.handleArea}>
                  <View style={styles.handle} />
                </View>
                {header}
              </View>
            </GestureDetector>
            <GestureDetector gesture={bodyPan}>
              <View collapsable={false} style={styles.body}>
                <SheetScrollContext.Provider value={scrollProps}>{children}</SheetScrollContext.Provider>
              </View>
            </GestureDetector>
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const createStyles = (c) =>
  StyleSheet.create({
    fill: { flex: 1 },
    root: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: c.backdrop },
    sheet: {
      flexShrink: 1, // con la tastiera aperta si accorcia invece di uscire dallo schermo
      backgroundColor: c.surface,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingHorizontal: 16,
    },
    // area della maniglia più alta del disegno: più facile da prendere con il dito
    handleArea: { paddingTop: 8, paddingBottom: 12, alignItems: 'center' },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.handle },
    body: { flexShrink: 1 },
  });
