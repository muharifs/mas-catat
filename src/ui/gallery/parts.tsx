// Small layout helpers shared by the gallery sections. Plain Views and Texts only: the gallery adds no new UI component.
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SectionHeader } from '../components/SectionHeader';
import { toast } from '../toast';
import { colors, spacing, type } from '../theme';

/** Every gallery onPress ends here: a toast, nothing else (no navigation, no write). */
export function pressedToast(name: string): () => void {
  return () => toast(`Ditekan: ${name}`);
}

/** Section title (the component name) plus one small line listing the states shown below it. */
export function Section({ title, states, children }: { title: string; states: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <SectionHeader title={title} />
      <Text style={styles.states}>{states}</Text>
      {children}
    </View>
  );
}

/** One state: a small caption above the component. */
export function Demo({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <View style={styles.demo}>
      <Text style={styles.caption}>{caption}</Text>
      {children}
    </View>
  );
}

/** A horizontal row; `wrap` lets items drop to the next line. */
export function Row({ children, wrap = false }: { children: ReactNode; wrap?: boolean }) {
  return <View style={[styles.row, wrap && styles.wrap]}>{children}</View>;
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  states: { ...type.secondary, color: colors.textSecondary },
  demo: { gap: spacing.xs },
  caption: { ...type.secondary, color: colors.textSecondary },
  row: { flexDirection: 'row', gap: spacing.sm },
  wrap: { flexWrap: 'wrap' },
});
