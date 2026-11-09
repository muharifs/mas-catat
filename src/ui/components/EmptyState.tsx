import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, ICON, radius, spacing, type } from '../theme';
import { Button } from './Button';

interface EmptyStateProps {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const CIRCLE = 72;

// Empty list. The icon is decoration only (no illustration, nothing to license); the title and message say what is missing.
export function EmptyState({ title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.circle}>
        <Ionicons name="file-tray-outline" size={ICON.lg} color={colors.brandStrong} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} style={styles.action} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandTint,
  },
  title: { ...type.titleM, textAlign: 'center', color: colors.text },
  message: { ...type.body, textAlign: 'center', color: colors.textSecondary },
  action: { alignSelf: 'stretch' },
});
