import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { colors, radius, spacing, type } from '../theme';

interface SwipeRowProps {
  children: ReactNode;
  /** When false the row is plain: no gesture, no background label. */
  enabled: boolean;
  /** Text revealed behind the row while it is dragged, e.g. "Bayar Rp15.000". */
  label: string;
  /** Runs once when the row is released past the threshold. The gesture is locked until it settles. */
  onSwipe: () => void | Promise<void>;
}

/** Finger must move this far (dp) before the row can claim the gesture. */
const CLAIM_DISTANCE = 12;
/** Horizontal movement must beat vertical movement by this factor, so a vertical scroll is never stolen. */
const HORIZONTAL_BIAS = 2;
/** Release past this share of the row width (or the minimum below) to fire. */
const THRESHOLD_RATIO = 0.45;
const MIN_THRESHOLD = 120;

/**
 * A row that can be dragged to the RIGHT. Past the threshold the release fires onSwipe; before it the row springs
 * back and nothing happens.
 *
 * React Native vs the web: there are no pointer or CSS-transition events here. PanResponder is RN's built-in gesture
 * system (touches are negotiated between views, like a ScrollView and a row both wanting the same finger), and
 * Animated drives the movement with a native-thread value so the row follows the finger without going through React
 * renders. A tap still reaches the Pressable inside the row, because the row only claims the touch once it moves.
 */
export function SwipeRow({ children, enabled, label, onSwipe }: SwipeRowProps) {
  const [translateX] = useState(() => new Animated.Value(0));
  const [width, setWidth] = useState(0);

  // The responder is created once, so its handlers read the latest props through this ref, refreshed after every
  // render. A ref (not state) because changing it must not re-render.
  const live = useRef({ enabled, onSwipe, threshold: MIN_THRESHOLD, width: 0, busy: false });
  const threshold = Math.max(MIN_THRESHOLD, width * THRESHOLD_RATIO);
  useEffect(() => {
    live.current = { ...live.current, enabled, onSwipe, threshold, width };
  });

  // The handlers only touch `live` inside gesture callbacks, never during render, so the rule below is a false alarm.
  // eslint-disable-next-line react-hooks/refs
  const [panResponder] = useState(() => {
    const springBack = () => Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
    return PanResponder.create({
      // Claim only clearly horizontal, rightward movement. Everything else stays with the list (scroll) or the row (tap).
      onMoveShouldSetPanResponder: (_e, g) =>
        live.current.enabled &&
        !live.current.busy &&
        g.dx > CLAIM_DISTANCE &&
        Math.abs(g.dx) > HORIZONTAL_BIAS * Math.abs(g.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_e, g) => {
        const max = live.current.width || g.dx;
        translateX.setValue(Math.min(Math.max(g.dx, 0), max));
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dx < live.current.threshold || live.current.busy) {
          springBack();
          return;
        }
        live.current.busy = true; // locked until the save finishes: no double firing
        springBack();
        void Promise.resolve(live.current.onSwipe()).finally(() => {
          live.current.busy = false;
        });
      },
      onPanResponderTerminate: springBack,
    });
  });

  if (!enabled) return <>{children}</>;

  const opacity = translateX.interpolate({ inputRange: [0, 24, threshold], outputRange: [0, 0.6, 1], extrapolate: 'clamp' });
  return (
    <View style={styles.frame} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      <Animated.View style={[styles.background, { opacity }]} pointerEvents="none">
        <Text style={styles.label}>{label}</Text>
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.row, overflow: 'hidden' },
  background: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    paddingLeft: spacing.lg,
  },
  label: { ...type.heading, color: colors.onPrimary },
});
