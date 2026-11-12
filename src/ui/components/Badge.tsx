import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, type } from '../theme';

export type BadgeTone = 'neutral' | 'ok' | 'error' | 'warn' | 'brand';

interface BadgeProps {
  /** Always a word (Berlaku, Dikoreksi, Lunas, Belum lunas): the colour only supports it. */
  label: string;
  tone?: BadgeTone;
}

// Status pill: tinted fill with matching dark text. 14sp is the minimum text size of the app, so there are no count badges.
export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  return (
    <View style={[styles.pill, pillTone[tone]]}>
      <Text maxFontSizeMultiplier={1.3} style={[styles.label, labelTone[tone]]}>
        {label}
      </Text>
    </View>
  );
}

interface DotProps {
  tone?: 'error' | 'brand';
}

// 10dp status dot. Decoration only: put a word next to it or in the accessibility label of the parent.
export function Dot({ tone = 'error' }: DotProps) {
  return <View style={[styles.dot, tone === 'error' ? styles.dotError : styles.dotBrand]} />;
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill },
  label: { ...type.label },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
  dotError: { backgroundColor: colors.error },
  dotBrand: { backgroundColor: colors.brand },
});

const pillTone = StyleSheet.create({
  neutral: { backgroundColor: colors.neutralTint },
  ok: { backgroundColor: colors.moneyInTint },
  error: { backgroundColor: colors.errorTint },
  warn: { backgroundColor: colors.warnTint },
  brand: { backgroundColor: colors.brandTint },
});

const labelTone = StyleSheet.create({
  neutral: { color: colors.text },
  ok: { color: colors.moneyIn },
  error: { color: colors.error },
  warn: { color: colors.warn },
  brand: { color: colors.brandStrong },
});
