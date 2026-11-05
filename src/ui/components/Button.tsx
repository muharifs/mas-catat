import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { colors, MIN_TOUCH, radius, spacing } from '../theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'dangerOutline';

interface ButtonProps {
  label: string;
  onPress: () => void;
  /** primary = main action; secondary = green outline; danger = solid red (final, destructive); dangerOutline = red border only. */
  variant?: Variant;
  disabled?: boolean;
  /** For toggle-like buttons (for example Tunai / Debit): announced to screen readers as selected. */
  selected?: boolean;
  /** Narrower padding for buttons inside a row. The touch height stays 48. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

// React Native has no <button>: Pressable is the building block and Text must wrap every string.
// accessibilityState is what TalkBack reads (the web equivalent is aria-disabled / aria-pressed).
export function Button({ label, onPress, variant = 'primary', disabled = false, selected, compact = false, style }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        styles[variant],
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.label, labelStyle[variant]]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.row,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: { paddingHorizontal: spacing.md },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primary },
  danger: { backgroundColor: colors.danger },
  dangerOutline: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.danger },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
  label: { color: colors.onPrimary, fontSize: 16, fontWeight: '600', textAlign: 'center' },
});

const labelStyle = StyleSheet.create({
  primary: {},
  danger: {},
  secondary: { color: colors.primary },
  dangerOutline: { color: colors.danger },
});
