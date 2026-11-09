import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, ICON, radius, spacing, type } from '../theme';

interface IconChoiceProps {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  onPress: () => void;
}

const TILE_HEIGHT = 72;
const CIRCLE = 40;

// A radio tile: icon in a circle plus a word (Tunai, Debit, ...). Selection is shown by tint, a thicker border AND a
// check mark, so it never depends on colour alone. Each tile has `flex: 1`, so put them in a `flexDirection: 'row'`
// View and they share the width (React Native has no CSS grid; flex is the layout tool). Icon above the word keeps
// three tiles readable on a 360dp phone.
export function IconChoice({ label, icon, selected, onPress }: IconChoiceProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, selected && styles.tileSelected, pressed && !selected && styles.pressed]}
    >
      <View style={[styles.circle, selected && styles.circleSelected]}>
        <Ionicons name={icon} size={ICON.md} color={selected ? colors.onBrand : colors.textSecondary} />
      </View>
      <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.label, selected && styles.labelSelected]}>
        {label}
      </Text>
      {selected ? (
        <View style={styles.check}>
          <Ionicons name="checkmark-circle" size={ICON.sm} color={colors.brandStrong} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minHeight: TILE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  tileSelected: { backgroundColor: colors.brandTint, borderWidth: 2, borderColor: colors.brandStrong },
  pressed: { backgroundColor: colors.bgMute },
  circle: { width: CIRCLE, height: CIRCLE, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgMute },
  circleSelected: { backgroundColor: colors.brandStrong },
  label: { ...type.label, color: colors.text },
  labelSelected: { color: colors.text },
  check: { position: 'absolute', top: 2, right: 2 },
});
