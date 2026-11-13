import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, MIN_TOUCH, radius, spacing, type } from '../theme';

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
  /** Title in the error colour, for an action that ends something (for example closing a meeting). The words still say it. */
  destructive?: boolean;
  accessibilityLabel?: string;
}

// One list row: title (and details) on the left, optional right-hand content. A tappable row is a Pressable with
// accessibilityRole="button" so TalkBack announces it as actionable (on the web it would be an <a> or <button>).
// Rows are flat (no shadow: a long list of shadows is slow); a hairline border separates them from the page.
export function ListRow({ title, children, right, onPress, tone = 'default', strikeTitle = false, destructive = false, accessibilityLabel }: ListRowProps) {
  const body = (
    <>
      <View style={styles.main}>
        <Text style={[styles.title, strikeTitle && styles.strike, destructive && styles.destructive]}>{title}</Text>
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
      style={({ pressed }) => [styles.row, toneStyle[tone], pressed && pressedTone[tone]]}
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
    borderRadius: radius.md,
  },
  main: { flex: 1, gap: spacing.xs },
  right: { alignItems: 'flex-end', gap: spacing.xs },
  title: { ...type.bodyStrong, color: colors.text },
  strike: { textDecorationLine: 'line-through' },
  destructive: { color: colors.error },
  sub: { ...type.secondary },
});

const toneStyle = StyleSheet.create({
  default: { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.divider },
  alt: { backgroundColor: colors.bgMute },
  danger: { backgroundColor: colors.errorTint, borderWidth: 1, borderColor: colors.error },
});

const pressedTone = StyleSheet.create({
  default: { backgroundColor: colors.bgMute },
  alt: { backgroundColor: colors.bgDisabled },
  danger: { backgroundColor: colors.errorTint },
});

const subTone = StyleSheet.create({
  muted: { color: colors.textSecondary },
  danger: { color: colors.error, fontFamily: fonts.bold },
  ok: { color: colors.moneyIn, fontFamily: fonts.bold },
  warn: { color: colors.warn },
});
