import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, MIN_TOUCH, radius, spacing, type } from '../theme';

interface ChipProps {
  label: string;
  onPress: () => void;
  selected?: boolean;
}

// Small tappable shortcut (date shortcuts, quick amounts). The touch height is still 48.
export function Chip({ label, onPress, selected = false }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.selected, pressed && styles.pressed]}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.row,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  selected: { backgroundColor: colors.primary },
  pressed: { opacity: 0.75 },
  label: { ...type.label, color: colors.primary },
  labelSelected: { color: colors.onPrimary },
});
