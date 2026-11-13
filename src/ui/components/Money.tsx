import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { colors, fonts, TABULAR, type } from '../theme';
import { formatSigned, moneyTone, type MoneyTone } from '../format';

type Size = 'hero' | 'display' | 'large' | 'heading' | 'body';

interface MoneyProps {
  amount: number;
  /** hero = 36 (total kas on Beranda), display = 28, large = 20 (Tunai/Debit), heading = 18 (arrears in a list), body = 16. */
  size?: Size;
  /** Explicit "+" / "-" (cash flow lists). Without it a negative balance is shown red with its minus. */
  sign?: '+' | '-' | '';
  /** Force a colour meaning, for example "negative" for arrears. Default: derived from sign and amount. */
  tone?: MoneyTone;
  /** One line that shrinks (down to 60%) instead of wrapping when the amount is wider than the space. */
  fit?: boolean;
  /** Paint only the "Rp" smaller (type.amountL, 20) while the sign and digits keep the size. Screen readers read the whole amount once. */
  smallPrefix?: boolean;
  style?: StyleProp<TextStyle>;
}

const ASCII_HYPHEN = '-';
const TYPOGRAPHIC_MINUS = '−';

/**
 * Display text only: a leading ASCII hyphen becomes U+2212 (same width and height as "+" in Inter). formatSigned,
 * CSV and dialogs keep the ASCII hyphen; only what is painted on screen changes.
 */
export function displayMoneyText(text: string): string {
  return text.startsWith(ASCII_HYPHEN) ? TYPOGRAPHIC_MINUS + text.slice(1) : text;
}

/** Splits painted money text into sign, "Rp" and digits. Returns null when the text has another shape. */
export function splitMoneyText(text: string): [string, string, string] | null {
  const match = /^([−+-]?)(Rp)(.*)$/.exec(text);
  if (!match) return null;
  return [match[1] ?? '', match[2] ?? '', match[3] ?? ''];
}

/** Screen-reader text: says "minus" / "plus" in words instead of relying on how the engine reads the symbol. */
export function moneyAccessibilityLabel(text: string): string | undefined {
  if (text.startsWith(ASCII_HYPHEN)) return `minus ${text.slice(1)}`;
  if (text.startsWith('+')) return `plus ${text.slice(1)}`;
  return undefined;
}

// Displays integer rupiah. It only formats (formatSigned); it never computes money.
// Green is moneyIn (never the teal brand); the sign or a word stays the real signal next to the colour.
export function Money({ amount, size = 'body', sign = '', tone, fit = false, smallPrefix = false, style }: MoneyProps) {
  const resolved = tone ?? moneyTone(amount, sign);
  const text = formatSigned(amount, sign);
  const shown = displayMoneyText(text);
  const parts = smallPrefix ? splitMoneyText(shown) : null;
  return (
    <Text
      accessibilityLabel={smallPrefix ? (moneyAccessibilityLabel(text) ?? text) : moneyAccessibilityLabel(text)}
      maxFontSizeMultiplier={1.3}
      numberOfLines={fit ? 1 : undefined}
      adjustsFontSizeToFit={fit}
      minimumFontScale={fit ? 0.6 : undefined}
      style={[sizeStyle[size], TABULAR, toneStyle[resolved], style]}
    >
      {parts ? (
        <>
          {parts[0]}
          {/* A nested Text is a span in the same paragraph (one baseline); only the size differs, the rest is inherited. */}
          <Text style={styles.smallPrefix}>{parts[1]}</Text>
          {parts[2]}
        </>
      ) : (
        shown
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  // fontFamily repeats the inherited bold only because the font scan (fonts.qa.test) wants it in every Text style.
  smallPrefix: { fontSize: type.amountL.fontSize, fontFamily: fonts.bold },
});

const sizeStyle = StyleSheet.create({
  hero: { ...type.hero },
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
