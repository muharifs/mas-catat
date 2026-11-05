import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, type } from '../theme';
import { Button } from './Button';

interface EmptyStateProps {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'stretch', gap: spacing.md, padding: spacing.xl },
  title: { ...type.heading, textAlign: 'center', color: colors.text },
  message: { ...type.body, textAlign: 'center', color: colors.textMuted },
});
