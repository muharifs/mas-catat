import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, ICON, radius, spacing, type } from '../theme';
import { toast } from '../toast';

type IconName = ComponentProps<typeof Ionicons>['name'];

const CIRCLE = 48;
const TILE_MIN_HEIGHT = 72;

interface QuickActionProps {
  label: string;
  icon: IconName;
  onPress: () => void;
  /** Why the tile cannot be used. A disabled tile stays visible: tapping it shows this text as a toast. */
  disabledReason?: string | null;
}

// One tile of the quick-action grid: a 48dp circle with an icon, the word below. The whole tile is the touch area.
// A tile cannot show a reason line like a Button, so the reason is a toast on tap and the accessibility hint.
export function QuickAction({ label, icon, onPress, disabledReason }: QuickActionProps) {
  const disabled = Boolean(disabledReason);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={disabledReason ?? undefined}
      accessibilityState={{ disabled }}
      onPress={disabled ? () => toast(disabledReason as string) : onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
    >
      <View style={[styles.circle, disabled && styles.circleDisabled]}>
        <Ionicons name={icon} size={ICON.md} color={disabled ? colors.textTertiary : colors.brandStrong} />
      </View>
      <Text maxFontSizeMultiplier={1.3} style={[styles.label, disabled && styles.labelDisabled]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, minHeight: TILE_MIN_HEIGHT, alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs, borderRadius: radius.md },
  pressed: { backgroundColor: colors.bgMute },
  circle: { width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandTint },
  circleDisabled: { backgroundColor: colors.bgDisabled },
  label: { ...type.secondary, color: colors.text, textAlign: 'center' },
  labelDisabled: { color: colors.textTertiary },
});
