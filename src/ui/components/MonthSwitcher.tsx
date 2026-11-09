import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatMonth } from '../months';
import { colors, ICON, MIN_TOUCH, radius, spacing, type } from '../theme';

interface MonthSwitcherProps {
  /** "YYYY-MM" shown in the middle. */
  month: string;
  onPrevious: () => void;
  onNext: () => void;
  /** True on the current month: entries are never dated in the future, so there is nothing further on. */
  nextDisabled: boolean;
}

// Previous / next month buttons around the month name. Both buttons are 48dp wide and tall. The "next" button is
// disabled on the newest month and says why in its accessibility label (a disabled button must never be silent).
export function MonthSwitcher({ month, onPrevious, onNext, nextDisabled }: MonthSwitcherProps) {
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Bulan sebelumnya"
        onPress={onPrevious}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Ionicons name="chevron-back" size={ICON.md} color={colors.brandStrong} />
      </Pressable>
      <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={styles.title}>
        {formatMonth(month)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={nextDisabled ? 'Bulan berikutnya. Sudah di bulan terbaru' : 'Bulan berikutnya'}
        accessibilityState={{ disabled: nextDisabled }}
        disabled={nextDisabled}
        onPress={onNext}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Ionicons name="chevron-forward" size={ICON.md} color={nextDisabled ? colors.textTertiary : colors.brandStrong} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  button: { width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: colors.brandTintPressed },
  title: { ...type.titleM, color: colors.text, flexShrink: 1, textAlign: 'center' },
});
