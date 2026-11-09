import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, elevation, radius, spacing } from '../theme';

interface CardProps {
  children: ReactNode;
  /** default = white with a soft shadow; alt = flat grey; info = teal tint; warn / danger = tinted with a border (always add a word too). */
  tone?: 'default' | 'alt' | 'info' | 'warn' | 'danger';
  style?: StyleProp<ViewStyle>;
}

// A rounded box that groups related content. Like a <div class="card"> on the web.
// Android draws the shadow (elevation) only because the card has an opaque background colour.
export function Card({ children, tone = 'default', style }: CardProps) {
  return <View style={[styles.card, toneStyle[tone], style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { padding: spacing.lg, borderRadius: radius.lg, gap: spacing.sm },
});

const toneStyle = StyleSheet.create({
  default: { backgroundColor: colors.bgCard, ...elevation.low },
  alt: { backgroundColor: colors.bgMute },
  info: { backgroundColor: colors.brandTint },
  warn: { backgroundColor: colors.warnTint, borderWidth: 1, borderColor: colors.warn },
  danger: { backgroundColor: colors.errorTint, borderWidth: 1, borderColor: colors.error },
});
