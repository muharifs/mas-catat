import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, type } from '../theme';

// Shown while a screen loads its data. ActivityIndicator is the native spinner (like a CSS spinner on the web).
export function Loading({ label = 'Memuat...' }: { label?: string }) {
  return (
    <View style={styles.wrap} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  text: { ...type.body, color: colors.textMuted },
});
