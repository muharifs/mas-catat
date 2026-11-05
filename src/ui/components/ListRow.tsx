import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, MIN_TOUCH, radius, spacing, type } from '../theme';

interface ListRowProps {
  title: string;
  /** Extra lines under the title (text or any nodes). */
  children?: ReactNode;
  /** Content on the right (amount, status). */
  right?: ReactNode;
  /** When given, the row is tappable and read as a button; otherwise it is a plain row. */
  onPress?: () => void;
  tone?: 'default' | 'alt' | 'danger';
  strikeTitle?: boolean;
  accessibilityLabel?: string;
}

// One list row: title (and details) on the left, optional right-hand content. A tappable row is a Pressable with
// accessibilityRole="button" so TalkBack announces it as actionable (on the web it would be an <a> or <button>).
export function ListRow({ title, children, right, onPress, tone = 'default', strikeTitle = false, accessibilityLabel }: ListRowProps) {
  const body = (
    <>
      <View style={styles.main}>
        <Text style={[styles.title, strikeTitle && styles.strike]}>{title}</Text>
        {children}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </>
  );
  if (!onPress) return <View style={[styles.row, toneStyle[tone]]}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.row, toneStyle[tone], pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

/** Muted second line for a ListRow. */
export function RowText({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'danger' | 'ok' | 'warn' }) {
  return <Text style={[styles.sub, subTone[tone]]}>{children}</Text>;
}

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.row,
  },
  main: { flex: 1, gap: 2 },
  right: { alignItems: 'flex-end', gap: 2 },
  title: { ...type.body, fontWeight: '600', color: colors.text },
  strike: { textDecorationLine: 'line-through' },
  sub: { ...type.caption },
  pressed: { opacity: 0.75 },
});

const toneStyle = StyleSheet.create({
  default: { backgroundColor: colors.surface },
  alt: { backgroundColor: colors.surfaceAlt },
  danger: { backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.danger },
});

const subTone = StyleSheet.create({
  muted: { color: colors.textMuted },
  danger: { color: colors.danger, fontWeight: '600' },
  ok: { color: colors.primary, fontWeight: '600' },
  warn: { color: colors.warn },
});
