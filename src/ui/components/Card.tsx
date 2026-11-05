import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../theme';

interface CardProps {
  children: ReactNode;
  tone?: 'default' | 'alt' | 'danger';
  style?: StyleProp<ViewStyle>;
}

// A rounded box that groups related content. Like a <div class="card"> on the web.
export function Card({ children, tone = 'default', style }: CardProps) {
  return <View style={[styles.card, toneStyle[tone], style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { padding: spacing.lg, borderRadius: radius.card, gap: spacing.sm },
});

const toneStyle = StyleSheet.create({
  default: { backgroundColor: colors.surface },
  alt: { backgroundColor: colors.surfaceAlt },
  danger: { backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.danger },
});
