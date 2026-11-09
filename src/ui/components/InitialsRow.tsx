import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { PaidTodayView } from '../paidToday';
import { colors, MIN_TOUCH, radius, spacing, type } from '../theme';

const CIRCLE = 40;
const ROW_MIN_HEIGHT = 56;

interface InitialsRowProps {
  view: PaidTodayView;
  onPress: () => void;
}

// Horizontal row of initials circles ("who paid today"). The WHOLE row is one touch area (it opens Pembayaran); the
// circles are not buttons. The names are in the accessibility label, because initials alone say nothing to a screen reader.
export function InitialsRow({ view, onPress }: InitialsRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={view.accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {view.initials.length === 0 ? (
        <Text style={styles.empty}>Belum ada yang bayar hari ini.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.circles}>
          {view.initials.map((i) => (
            <View key={i.key} style={styles.circle}>
              <Text maxFontSizeMultiplier={1.3} style={styles.initials}>
                {i.text}
              </Text>
            </View>
          ))}
          {view.extra > 0 ? (
            <View style={[styles.circle, styles.more]}>
              <Text maxFontSizeMultiplier={1.3} style={styles.initials}>{`+${view.extra}`}</Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: Math.max(ROW_MIN_HEIGHT, MIN_TOUCH), justifyContent: 'center', borderRadius: radius.md },
  pressed: { backgroundColor: colors.bgMute },
  circles: { alignItems: 'center', gap: spacing.sm },
  circle: { width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandTint },
  more: { backgroundColor: colors.bgMute },
  initials: { ...type.label, color: colors.brandStrong },
  empty: { ...type.secondary, color: colors.textSecondary },
});
