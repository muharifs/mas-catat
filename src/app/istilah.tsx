import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/ui/components/Card';
import { SectionHeader } from '@/ui/components/SectionHeader';
import { GLOSSARY_INTRO, glossaryGroups } from '@/ui/glossary';
import { colors, spacing, type } from '@/ui/theme';

// Static help page: what the words in the app mean. The data lives in src/ui/glossary.ts; this only renders it.
// No numberOfLines on purpose, so large system fonts never cut a meaning.
export default function GlossaryScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.intro}>{GLOSSARY_INTRO}</Text>
      {glossaryGroups().map((g) => (
        <View key={g.group} style={styles.group}>
          <SectionHeader title={g.group} />
          <Card>
            {g.entries.map((e) => (
              <View key={e.term} style={styles.entry}>
                <Text style={styles.term}>{e.term}</Text>
                <Text style={styles.meaning}>{e.meaning}</Text>
              </View>
            ))}
          </Card>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg },
  intro: { ...type.body, color: colors.textSecondary },
  group: { gap: spacing.sm },
  entry: { gap: 2, marginBottom: spacing.sm },
  term: { ...type.bodyStrong, color: colors.text },
  meaning: { ...type.body, color: colors.text },
});
