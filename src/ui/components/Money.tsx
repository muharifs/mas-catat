import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { colors, type } from '../theme';
import { formatSigned, moneyTone, type MoneyTone } from '../format';

type Size = 'display' | 'large' | 'heading' | 'body';

interface MoneyProps {
  amount: number;
  /** display = 28 (total kas), large = 20 (Tunai/Debit), heading = 18 (arrears in a list), body = 16. */
  size?: Size;
  /** Explicit "+" / "-" (cash flow lists). Without it a negative balance is shown red with its minus. */
  sign?: '+' | '-' | '';
  /** Force a colour meaning, for example "negative" for arrears. Default: derived from sign and amount. */
  tone?: MoneyTone;
  style?: StyleProp<TextStyle>;
}

// Displays integer rupiah. It only formats (formatSigned); it never computes money.
export function Money({ amount, size = 'body', sign = '', tone, style }: MoneyProps) {
  const resolved = tone ?? moneyTone(amount, sign);
  return <Text style={[sizeStyle[size], toneStyle[resolved], style]}>{formatSigned(amount, sign)}</Text>;
}

const sizeStyle = StyleSheet.create({
  display: { ...type.display },
  large: { fontSize: 20, fontWeight: '700' },
  heading: { ...type.heading },
  body: { ...type.body, fontWeight: '600' },
});

const toneStyle = StyleSheet.create({
  positive: { color: colors.primary },
  negative: { color: colors.danger },
  neutral: { color: colors.text },
});
