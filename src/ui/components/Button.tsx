import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, MIN_TOUCH, radius, spacing, type } from '../theme';

type Variant = 'primary' | 'secondary' | 'tertiary' | 'danger' | 'dangerOutline';

interface ButtonProps {
  label: string;
  onPress: () => void;
  /**
   * primary = main action (one per screen); secondary = outline; tertiary = soft teal fill for low-priority actions;
   * danger = solid red (final, destructive); dangerOutline = red border only.
   */
  variant?: Variant;
  disabled?: boolean;
  /** Why the button is disabled. Shown under the button and read by screen readers (a disabled button never stays unexplained). */
  disabledReason?: string;
  /** Saving in progress: the label is replaced by a spinner, the size stays the same and the button is disabled. */
  loading?: boolean;
  /** For toggle-like buttons (for example Tunai / Debit): announced to screen readers as selected. */
  selected?: boolean;
  /** Narrower padding for buttons inside a row. The touch height stays 48. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

// React Native has no <button>: Pressable is the building block and Text must wrap every string.
// accessibilityState is what TalkBack reads (the web equivalent is aria-disabled / aria-pressed).
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  disabledReason,
  loading = false,
  selected,
  compact = false,
  style,
}: ButtonProps) {
  const inactive = disabled || loading;
  const showReason = disabled && !loading && Boolean(disabledReason);
  const button = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={loading ? `${label}, sedang menyimpan` : label}
      accessibilityHint={showReason ? disabledReason : undefined}
      accessibilityState={{ disabled: inactive, selected, busy: loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        styles[variant],
        pressed && !inactive && pressedStyle[variant],
        disabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={spinnerColor[variant]} />
      ) : (
        <Text style={[styles.label, labelStyle[variant], disabled && styles.labelDisabled]}>{label}</Text>
      )}
    </Pressable>
  );
  if (!showReason) return button;
  return (
    <View style={styles.withReason}>
      {button}
      <Text style={styles.reason}>{disabledReason}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    // Every variant has a 1.5dp border (transparent when it has none) so a state change never shifts the layout.
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  compact: { paddingHorizontal: spacing.md },
  primary: { backgroundColor: colors.brandStrong },
  secondary: { backgroundColor: colors.bgCard, borderColor: colors.brandStrong },
  tertiary: { backgroundColor: colors.brandTint },
  danger: { backgroundColor: colors.error },
  dangerOutline: { backgroundColor: colors.bgCard, borderColor: colors.error },
  // Disabled: flat grey fill and a muted label, no opacity trick (low opacity fails contrast).
  disabled: { backgroundColor: colors.bgDisabled, borderColor: colors.bgDisabled },
  label: { ...type.bodyStrong, color: colors.onBrand, textAlign: 'center' },
  labelDisabled: { color: colors.textTertiary },
  withReason: { gap: spacing.xs },
  reason: { ...type.secondary, color: colors.textSecondary },
});

const pressedStyle = StyleSheet.create({
  primary: { backgroundColor: colors.brandPressed },
  secondary: { backgroundColor: colors.brandTint },
  tertiary: { backgroundColor: colors.brandTintPressed },
  danger: { backgroundColor: colors.errorPressed },
  dangerOutline: { backgroundColor: colors.errorTint },
});

const labelStyle = StyleSheet.create({
  primary: {},
  danger: {},
  secondary: { color: colors.brandStrong },
  tertiary: { color: colors.brandStrong },
  dangerOutline: { color: colors.error },
});

const spinnerColor = {
  primary: colors.onBrand,
  danger: colors.onBrand,
  secondary: colors.brandStrong,
  tertiary: colors.brandStrong,
  dangerOutline: colors.error,
} as const;
