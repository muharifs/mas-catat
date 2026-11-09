import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, ICON, radius, spacing, type } from '../theme';

type Tone = 'info' | 'warn' | 'danger';
type IconName = ComponentProps<typeof Ionicons>['name'];

interface NoticeProps {
  tone?: Tone;
  title?: string;
  children: string;
}

const ICONS: Record<Tone, IconName> = {
  info: 'information-circle',
  warn: 'warning',
  danger: 'alert-circle',
};

// Boxed message: info (teal tint), warn (amber) or danger (red). The text carries the meaning; colour and the icon only support it.
export function Notice({ tone = 'info', title, children }: NoticeProps) {
  return (
    <View style={[styles.box, boxTone[tone]]} accessibilityRole={tone === 'danger' ? 'alert' : undefined}>
      <Ionicons name={ICONS[tone]} size={ICON.sm} color={iconColor[tone]} style={styles.icon} />
      <View style={styles.body}>
        {title ? <Text style={[styles.title, textTone[tone]]}>{title}</Text> : null}
        <Text style={[styles.text, textTone[tone]]}>{children}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.sm },
  // Aligns the 20dp icon with the first text line (line height 22).
  icon: { marginTop: 1 },
  body: { flex: 1, gap: spacing.xs },
  title: { ...type.label },
  text: { ...type.body },
});

const boxTone = StyleSheet.create({
  info: { backgroundColor: colors.brandTint },
  warn: { backgroundColor: colors.warnTint, borderWidth: 1, borderColor: colors.warn },
  danger: { backgroundColor: colors.errorTint, borderWidth: 1, borderColor: colors.error },
});

const textTone = StyleSheet.create({
  info: { color: colors.text },
  warn: { color: colors.warn },
  danger: { color: colors.error },
});

const iconColor = { info: colors.brandStrong, warn: colors.warn, danger: colors.error } as const;
