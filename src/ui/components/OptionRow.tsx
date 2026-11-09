import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, type, TABULAR } from '../theme';

interface OptionRowProps {
  label: string;
  /** Small second line, for example "(tuan rumah pertemuan 2)". */
  hint?: string;
  /** Bold text at the right edge, for example "Sisa Rp300.000". Display only. */
  trailing?: string;
  selected: boolean;
  onPress: () => void;
  /** checkbox = many can be selected (members of a period); radio = exactly one (the host). */
  mode?: 'checkbox' | 'radio';
}

const ROW_HEIGHT = 56;
const MARK = 24;

// A selectable row with a VISIBLE checkbox or radio mark (so selection never depends on colour alone).
// React Native has no <input type="checkbox">: this is a Pressable that draws its own mark.
export function OptionRow({ label, hint, trailing, selected, onPress, mode = 'checkbox' }: OptionRowProps) {
  return (
    <Pressable
      accessibilityRole={mode}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={[label, hint, trailing].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && !selected && styles.pressed]}
    >
      <View style={[styles.mark, mode === 'radio' ? styles.radio : styles.box, selected && styles.markSelected]}>
        {selected ? mode === 'radio' ? <View style={styles.dot} /> : <Text style={styles.tick}>✓</Text> : null}
      </View>
      <View style={styles.text}>
        <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {trailing ? (
        <Text maxFontSizeMultiplier={1.3} style={styles.trailing}>
          {trailing}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  // Selected: tint + thicker border + filled mark (the border grows by 1dp, the 56dp minimum height absorbs it).
  rowSelected: { backgroundColor: colors.brandTint, borderWidth: 2, borderColor: colors.brandStrong },
  pressed: { backgroundColor: colors.bgMute },
  mark: {
    width: MARK,
    height: MARK,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgCard,
  },
  box: { borderRadius: radius.sm },
  radio: { borderRadius: radius.pill },
  markSelected: { borderColor: colors.brandStrong, backgroundColor: colors.brandStrong },
  dot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colors.onBrand },
  tick: { color: colors.onBrand, fontSize: 16, fontWeight: '700', lineHeight: 18 },
  text: { flex: 1 },
  label: { ...type.body, color: colors.text },
  labelSelected: { ...type.bodyStrong },
  hint: { ...type.secondary, color: colors.textSecondary },
  trailing: { ...type.bodyStrong, ...TABULAR, color: colors.text },
});
