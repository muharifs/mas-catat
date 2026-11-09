import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { colors, TABULAR, type } from '../theme';
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
// Green is moneyIn (never the teal brand); the sign or a word stays the real signal next to the colour.
export function Money({ amount, size = 'body', sign = '', tone, style }: MoneyProps) {
  const resolved = tone ?? moneyTone(amount, sign);
  return (
    <Text maxFontSizeMultiplier={1.3} style={[sizeStyle[size], TABULAR, toneStyle[resolved], style]}>
      {formatSigned(amount, sign)}
    </Text>
  );
}

const sizeStyle = StyleSheet.create({
  display: { ...type.display },
  large: { ...type.amountL },
  heading: { ...type.titleM },
  body: { ...type.bodyStrong },
});

const toneStyle = StyleSheet.create({
  positive: { color: colors.moneyIn },
  negative: { color: colors.moneyOut },
  neutral: { color: colors.text },
});
