import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, ICON, MIN_TOUCH, radius, spacing, TABULAR, type } from '../theme';
import { BALANCE_MASK } from '../balanceVisibilityStore';
import { formatRupiah } from '../format';

interface PillLinkProps {
  /** A word ("Piutang", "Titipan"): the amount alone would not say what it is. */
  label: string;
  /** Integer rupiah, only formatted here. */
  amount: number;
  onPress: () => void;
  /** Spoken hint, for example "Buka daftar pinjaman". */
  hint?: string;
  /** Longer name for screen readers when the visible label is short (for example "Pengeluaran bulan ini"). */
  spokenLabel?: string;
  /** Show the mask instead of the amount (the eye on Beranda). The pill stays tappable. */
  hidden?: boolean;
}

// A pill-shaped button that opens another screen, showing a label and an amount. It is NOT a Chip: a Chip means
// "selected / not selected", this one only navigates. Touch height 48, teal tint with strong-teal text.
export function PillLink({ label, amount, onPress, hint, spokenLabel, hidden = false }: PillLinkProps) {
  const spoken = spokenLabel ?? label;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hidden ? `${spoken}, saldo disembunyikan` : `${spoken} ${formatRupiah(amount)}`}
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
    >
      <Text maxFontSizeMultiplier={1.3} style={styles.label}>
        {label}
      </Text>
      <Text maxFontSizeMultiplier={1.3} style={styles.amount}>
        {hidden ? BALANCE_MASK : formatRupiah(amount)}
      </Text>
      <Ionicons name="chevron-forward" size={ICON.sm} color={colors.brandStrong} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTint,
  },
  pressed: { backgroundColor: colors.brandTintPressed },
  label: { ...type.secondary, color: colors.brandStrong, flexShrink: 1 },
  amount: { ...type.label, ...TABULAR, color: colors.brandStrong },
});
