import { useEffect, useRef, useState, useSyncExternalStore, type ComponentRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { buttonVariant, current, orderButtons, pressBack, pressButton, pressScrim, subscribe, type ActiveDialog } from '../dialog';
import { colors, elevation, spacing, type } from '../theme';
import { Button } from './Button';
import { Card } from './Card';

export const DIALOG_MAX_WIDTH = 400;

// Mounted ONCE in the root layout, outside <Stack key={dataVersion}>, so it survives reloadEverything().
// React Native's <Modal> is a separate native window (not a div in the page): it covers the native header and tab
// bar, and statusBarTranslucent lets the scrim cover the status bar too. onRequestClose is the Android Back button.
export function DialogHost() {
  const dialog = useSyncExternalStore(subscribe, current, current);
  // Keep the last dialog drawn while the Modal fades out. Presses on it are ignored by the queue (id no longer at head).
  const [lastShown, setLastShown] = useState<ActiveDialog | null>(dialog);
  if (dialog && dialog !== lastShown) setLastShown(dialog);
  const shown = dialog ?? lastShown;
  const { width, height } = useWindowDimensions();
  const titleRef = useRef<ComponentRef<typeof Text>>(null);
  const dialogId = dialog?.id;

  useEffect(() => {
    if (dialogId === undefined) return;
    // This is not a native Alert, so the keyboard would cover part of the card: close it first.
    Keyboard.dismiss();
    // Move the TalkBack focus to the title after one frame (the Modal window must exist first).
    const frame = requestAnimationFrame(() => {
      const node = titleRef.current ? findNodeHandle(titleRef.current) : null;
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    });
    return () => cancelAnimationFrame(frame);
  }, [dialogId]);

  return (
    <Modal
      visible={dialog !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (dialog) pressBack(dialog.id);
      }}
    >
      {shown ? (
        <View style={styles.overlay} key={shown.id}>
          {/* The scrim is a sibling under the card, not its parent, so taps on the card never reach it. */}
          <Pressable style={StyleSheet.absoluteFill} accessible={false} importantForAccessibility="no" onPress={() => pressScrim(shown.id)} />
          <View accessibilityViewIsModal style={{ width: Math.min(width - 2 * spacing.xl, DIALOG_MAX_WIDTH) }}>
            <Card style={styles.card}>
              <Text ref={titleRef} accessibilityRole="header" style={styles.title}>
                {shown.options.title}
              </Text>
              {shown.options.message || shown.options.body ? (
                <ScrollView style={{ maxHeight: height * 0.6 }} persistentScrollbar>
                  {shown.options.message ? <Text style={styles.message}>{shown.options.message}</Text> : null}
                  {shown.options.body}
                </ScrollView>
              ) : null}
              <View style={styles.buttons}>
                {orderButtons(shown.options.buttons).map((button) => {
                  const index = shown.options.buttons.indexOf(button);
                  return <Button key={index} label={button.label} variant={buttonVariant(button.role)} onPress={() => pressButton(shown.id, index)} />;
                })}
              </View>
            </Card>
          </View>
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  card: { gap: 0, ...elevation.high },
  title: { ...type.titleM, color: colors.text, marginBottom: spacing.md },
  message: { ...type.body, color: colors.text },
  buttons: { gap: spacing.sm, marginTop: spacing.lg },
});
