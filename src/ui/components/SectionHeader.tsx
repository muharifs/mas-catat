import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, MIN_TOUCH, spacing, type } from '../theme';

interface SectionHeaderProps {
  title: string;
  /** Optional link-style action at the right, for example "Lihat semua". */
  actionLabel?: string;
  onAction?: () => void;
}

// Heading of a group of cards or rows (18sp bold). Lives on the page background.
export function SectionHeader({ title, actionLabel, onAction }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={styles.action}>
          <Text style={styles.actionLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { ...type.titleM, color: colors.text, flexShrink: 1 },
  action: { minHeight: MIN_TOUCH, justifyContent: 'center', paddingLeft: spacing.sm },
  actionLabel: { ...type.label, color: colors.brandStrong },
});
