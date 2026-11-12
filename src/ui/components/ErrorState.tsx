import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, type } from '../theme';
import { Button } from './Button';

interface ErrorStateProps {
  /** Heading in red. Defaults to the load-failure title; give one for other link or route errors. */
  title?: string;
  message: string;
  /** When given, a "Coba lagi" button appears. Leave it out for errors a retry cannot fix (record not found). */
  onRetry?: () => void;
}

// Full-screen error. `message` is already Indonesian (see toIndonesian in src/ui/errors.ts).
export function ErrorState({ title = 'Data tidak bisa dibuka', message, onRetry }: ErrorStateProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message} accessibilityLiveRegion="polite">
        {message}
      </Text>
      {onRetry ? <Button label="Coba lagi" onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  title: { ...type.titleM, textAlign: 'center', color: colors.error },
  message: { ...type.body, textAlign: 'center', color: colors.text },
});
