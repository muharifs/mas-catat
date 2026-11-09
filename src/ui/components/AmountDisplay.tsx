import { StyleSheet, Text, View } from 'react-native';
import { groupDigits } from '@/domain/amount-input';
import { parseRupiahInput } from '@/domain/payment-preview';
import { formatRupiah } from '../format';
import { colors, spacing, TABULAR, type } from '../theme';

interface AmountDisplayProps {
  /** The digits typed so far ("45000"), or "" when nothing is typed. Only formatted here, never computed. */
  value: string;
}

// Shows the amount being typed on AmountKeypad: a small "Rp" and the big number with dots. It is plain Text, not a
// TextInput, so no system keyboard appears and there is no cursor (and nothing to paste). On the web you would style
// an <input>; here the keypad owns the state and this only displays it.
export function AmountDisplay({ value }: AmountDisplayProps) {
  const parsed = parseRupiahInput(value);
  const empty = value.length === 0;
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={parsed === null ? 'Jumlah belum diisi' : `Jumlah ${formatRupiah(parsed)}`}
      accessibilityLiveRegion="polite"
      style={styles.box}
    >
      <Text maxFontSizeMultiplier={1.3} style={[styles.prefix, empty && styles.faint]}>
        Rp
      </Text>
      <Text
        maxFontSizeMultiplier={1.3}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={[styles.number, empty && styles.faint]}
      >
        {empty ? '0' : groupDigits(value)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  prefix: { ...type.titleM, color: colors.textSecondary },
  number: { ...type.hero, ...TABULAR, flexShrink: 1, color: colors.text },
  faint: { color: colors.textTertiary },
});
