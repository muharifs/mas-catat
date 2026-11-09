import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, MIN_TOUCH, radius, spacing, type } from '../theme';

interface ChipProps {
  label: string;
  onPress: () => void;
  selected?: boolean;
}

// Small tappable shortcut or filter (date shortcuts, quick amounts). The touch height is still 48.
// Selected = teal accent fill with DARK text (white on the teal fails contrast) plus a check mark, so it is not colour only.
export function Chip({ label, onPress, selected = false }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.selected, pressed && !selected && styles.pressed]}
    >
      {selected ? <Ionicons name="checkmark" size={16} color={colors.text} /> : null}
      <Text maxFontSizeMultiplier={1.3} style={styles.label}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgCard,
  },
  selected: { backgroundColor: colors.brand, borderColor: colors.brandStrong },
  pressed: { backgroundColor: colors.bgMute },
  label: { ...type.label, color: colors.text },
});
