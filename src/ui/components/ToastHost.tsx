import { useEffect, useState, useSyncExternalStore } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { currentToast, subscribeToast } from '../toast';
import { colors, elevation, radius, spacing, type } from '../theme';

/** Tab bar (about 56 dp) plus spacing.lg, so the toast sits above the tab bar on Beranda and Riwayat. Check on the phone. */
export const TOAST_BOTTOM_OFFSET = 80;
const FADE_MS = 150;

// Mounted once in the root layout. NOT a <Modal>: a Modal would block touches, this is a plain absolute View
// with pointerEvents="none" so taps go through to the screen underneath.
export function ToastHost() {
  const active = useSyncExternalStore(subscribeToast, currentToast, currentToast);
  const insets = useSafeAreaInsets();
  const [opacity] = useState(() => new Animated.Value(0));
  // Keep the last message drawn while fading out.
  const [lastMessage, setLastMessage] = useState(active?.message ?? '');
  if (active && active.message !== lastMessage) setLastMessage(active.message);

  useEffect(() => {
    Animated.timing(opacity, { toValue: active ? 1 : 0, duration: FADE_MS, useNativeDriver: true }).start();
  }, [active, opacity]);

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[styles.wrap, { bottom: insets.bottom + TOAST_BOTTOM_OFFSET, opacity }]}
    >
      <Animated.View style={styles.box}>
        <Text style={styles.text}>{lastMessage}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', marginHorizontal: spacing.lg },
  box: {
    maxWidth: 480,
    backgroundColor: colors.text,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...elevation.high,
  },
  text: { ...type.body, color: colors.bgCard },
});
