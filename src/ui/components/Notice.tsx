import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, type } from '../theme';

type Tone = 'info' | 'warn' | 'danger';

interface NoticeProps {
  tone?: Tone;
  title?: string;
  children: string;
}

// Boxed message: info (grey-green), warn (amber) or danger (red). The text carries the meaning; colour only supports it.
export function Notice({ tone = 'info', title, children }: NoticeProps) {
  return (
    <View style={[styles.box, boxTone[tone]]} accessibilityRole={tone === 'danger' ? 'alert' : undefined}>
      {title ? <Text style={[styles.title, textTone[tone]]}>{title}</Text> : null}
      <Text style={[styles.text, textTone[tone]]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { padding: spacing.md, borderRadius: radius.row, gap: spacing.xs },
  title: { ...type.label },
  text: { ...type.body },
});

const boxTone = StyleSheet.create({
  info: { backgroundColor: colors.surfaceAlt },
  warn: { backgroundColor: colors.warnSoft },
  danger: { backgroundColor: colors.dangerSoft },
});

const textTone = StyleSheet.create({
  info: { color: colors.text },
  warn: { color: colors.warn },
  danger: { color: colors.danger },
});
