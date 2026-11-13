// Section C: money figures (Money, AmountDisplay, AmountKeypad).
// React Native vs web: `adjustsFontSizeToFit` (Money `fit`) is a native Text feature, not CSS; it needs numberOfLines
// and only shrinks when the text is wider than the box. The keypad uses the same pure functions as the real screens.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { appendAmountDigits, deleteLastDigit } from '@/domain/amount-input';
import { AmountDisplay } from '../components/AmountDisplay';
import { AmountKeypad } from '../components/AmountKeypad';
import { Money } from '../components/Money';
import { colors } from '../theme';
import { AMOUNT_BIG, AMOUNT_EXTREME, AMOUNT_MID } from './fixtures';
import { Demo, Section } from './parts';

const SIZES = ['hero', 'display', 'large', 'heading', 'body'] as const;
const SIGN_SIZES = ['hero', 'large', 'heading', 'body'] as const;

export function SectionC() {
  const [typed, setTyped] = useState('');
  return (
    <>
      <Section
        title="Money"
        states="5 ukuran, tanda + / - / tanpa, negatif, nol, tone dipaksa, fit true dan false di wadah 120 dp."
      >
        <Demo caption="Semua ukuran dengan Rp1.250.000 dan Rp12.345.000">
          {SIZES.map((size) => (
            <View key={size}>
              <Money amount={AMOUNT_MID} size={size} />
              <Money amount={AMOUNT_BIG} size={size} />
            </View>
          ))}
        </Demo>
        <Demo caption="Tanda: +, -, tanpa tanda">
          <Money amount={AMOUNT_MID} size="large" sign="+" />
          <Money amount={AMOUNT_MID} size="large" sign="-" />
          <Money amount={AMOUNT_MID} size="large" />
        </Demo>
        <Demo caption="Tanda +, -, tanpa tanda pada empat ukuran (hero, large, heading, body) berdampingan">
          <View style={styles.signGrid}>
            {SIGN_SIZES.map((size) => (
              <View key={size} style={styles.signColumn}>
                <Money amount={AMOUNT_MID} size={size} sign="+" />
                <Money amount={AMOUNT_MID} size={size} sign="-" />
                <Money amount={AMOUNT_MID} size={size} />
              </View>
            ))}
          </View>
        </Demo>
        <Demo caption="Angka negatif dan nol">
          <Money amount={-AMOUNT_MID} size="large" />
          <Money amount={0} size="large" />
        </Demo>
        <Demo caption="Tone dipaksa: positive, negative, neutral">
          <Money amount={AMOUNT_MID} size="large" tone="positive" />
          <Money amount={AMOUNT_MID} size="large" tone="negative" />
          <Money amount={AMOUNT_MID} size="large" tone="neutral" />
        </Demo>
        <Demo caption="fit true, wadah 120 dp, Rp123.456.789 ukuran hero (harus mengecil, tidak membungkus)">
          <View style={styles.narrow120}>
            <Money amount={AMOUNT_EXTREME} size="hero" fit />
          </View>
        </Demo>
        <Demo caption="smallPrefix: hanya Rp 20, digit hero 36; dibaca TalkBack sekali (Rp123.456.789)">
          <View style={styles.narrow120}>
            <Money amount={AMOUNT_EXTREME} size="hero" smallPrefix fit />
          </View>
        </Demo>
        <Demo caption="smallPrefix, saldo negatif (minus tetap ukuran hero)">
          <Money amount={-AMOUNT_MID} size="hero" smallPrefix />
        </Demo>
        <Demo caption="fit false, wadah yang sama (pembanding: membungkus atau terpotong)">
          <View style={styles.narrow120}>
            <Money amount={AMOUNT_EXTREME} size="hero" />
          </View>
        </Demo>
      </Section>

      <Section title="AmountDisplay" states="kosong (0 samar), 15000, 1250000, 12345000, 123456789, wadah 200 dp.">
        <Demo caption="Kosong">
          <AmountDisplay value="" />
        </Demo>
        <Demo caption="15000">
          <AmountDisplay value="15000" />
        </Demo>
        <Demo caption="1250000">
          <AmountDisplay value="1250000" />
        </Demo>
        <Demo caption="12345000">
          <AmountDisplay value="12345000" />
        </Demo>
        <Demo caption="123456789">
          <AmountDisplay value="123456789" />
        </Demo>
        <Demo caption="Wadah sempit 200 dp dengan 123456789 (periksa pengecilan)">
          <View style={styles.narrow200}>
            <AmountDisplay value="123456789" />
          </View>
        </Demo>
      </Section>

      <Section title="AmountKeypad" states="terpasang bersama AmountDisplay, 12 tombol, tekan lama hapus mengosongkan.">
        <Demo caption="Ketik angka; hapus; tekan lama hapus = kosongkan. Tidak ada yang disimpan.">
          <AmountDisplay value={typed} />
          <AmountKeypad
            onKey={(key) => setTyped((current) => appendAmountDigits(current, key))}
            onBackspace={() => setTyped(deleteLastDigit)}
            onClear={() => setTyped('')}
          />
        </Demo>
      </Section>
    </>
  );
}

const styles = StyleSheet.create({
  signGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  signColumn: { gap: 4 },
  // Fixed-width boxes with an outline so the edge the text must respect is visible.
  narrow120: { width: 120, borderWidth: 1, borderColor: colors.borderStrong },
  narrow200: { width: 200, borderWidth: 1, borderColor: colors.borderStrong },
});
