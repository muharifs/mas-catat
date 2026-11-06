import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, MIN_TOUCH, radius, spacing, type } from '../theme';

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

// A selectable row with a VISIBLE checkbox or radio mark (so selection never depends on colour alone).
// React Native has no <input type="checkbox">: this is a Pressable that draws its own mark.
export function OptionRow({ label, hint, trailing, selected, onPress, mode = 'checkbox' }: OptionRowProps) {
  return (
    <Pressable
      accessibilityRole={mode}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={[label, hint, trailing].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.pressed]}
    >
      <View style={[styles.mark, mode === 'radio' ? styles.radio : styles.box, selected && styles.markSelected]}>
        {selected ? mode === 'radio' ? <View style={styles.dot} /> : <Text style={styles.tick}>✓</Text> : null}
      </View>
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {trailing ? <Text style={styles.trailing}>{trailing}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.row,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rowSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  pressed: { opacity: 0.75 },
  mark: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.border, backgroundColor: colors.background },
  box: { borderRadius: 6 },
  radio: { borderRadius: 12 },
  markSelected: { borderColor: colors.primary },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  tick: { color: colors.primary, fontSize: 16, fontWeight: '700', lineHeight: 18 },
  text: { flex: 1 },
  label: { ...type.body, color: colors.text },
  hint: { ...type.caption, color: colors.textMuted },
  trailing: { ...type.body, fontWeight: '700', color: colors.text },
});
