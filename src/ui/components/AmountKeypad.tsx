import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AmountKey } from '@/domain/amount-input';
import { colors, ICON, radius, spacing, type } from '../theme';

interface AmountKeypadProps {
  onKey: (key: AmountKey) => void;
  /** Removes one digit. */
  onBackspace: () => void;
  /** Empties the amount: long press on backspace, and a TalkBack action "Hapus semua". */
  onClear: () => void;
}

const ROWS: readonly (readonly AmountKey[])[] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
];

const KEY_HEIGHT = 56;

// Number pad for amounts: 1-9, 000, 0 and backspace. No operators, because nothing is calculated. Each key is a
// Pressable (React Native has no <button>); there is no hover or :active CSS, so the pressed look comes from the
// style callback. Every key is 56dp high, above the 48dp touch minimum.
export function AmountKeypad({ onKey, onBackspace, onClear }: AmountKeypadProps) {
  return (
    <View style={styles.pad}>
      {ROWS.map((row) => (
        <View key={row.join('')} style={styles.row}>
          {row.map((k) => (
            <DigitKey key={k} digit={k} onKey={onKey} />
          ))}
        </View>
      ))}
      <View style={styles.row}>
        <DigitKey digit="000" onKey={onKey} spokenLabel="Tiga nol" />
        <DigitKey digit="0" onKey={onKey} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hapus satu angka"
          accessibilityActions={[{ name: 'clear', label: 'Hapus semua' }]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'clear') onClear();
          }}
          onPress={onBackspace}
          onLongPress={onClear}
          style={({ pressed }) => [styles.key, pressed && styles.pressed]}
        >
          <Ionicons name="backspace-outline" size={ICON.md} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

function DigitKey({ digit, onKey, spokenLabel }: { digit: AmountKey; onKey: (key: AmountKey) => void; spokenLabel?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spokenLabel ?? `Angka ${digit}`}
      onPress={() => onKey(digit)}
      style={({ pressed }) => [styles.key, pressed && styles.pressed]}
    >
      <Text maxFontSizeMultiplier={1.3} style={styles.digit}>
        {digit}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pad: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  key: {
    flex: 1,
    height: KEY_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.bgCard,
  },
  pressed: { backgroundColor: colors.bgMute },
  digit: { ...type.titleL, color: colors.text },
});
