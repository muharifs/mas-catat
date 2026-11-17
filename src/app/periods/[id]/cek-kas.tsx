import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { buildCountHistory, timesCounted } from '@/domain/cash-count';
import { useRepos } from '@/db/provider';
import { Badge } from '@/ui/components/Badge';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { EmptyState } from '@/ui/components/EmptyState';
import { ErrorState } from '@/ui/components/ErrorState';
import { Loading } from '@/ui/components/Loading';
import { Notice } from '@/ui/components/Notice';
import { COUNT_STRINGS, countRowView, firstDifferenceNotice } from '@/ui/cashCount';
import { formatDate, recordedAtLabel } from '@/ui/dates';
import { colors, spacing, type } from '@/ui/theme';
import { useLoad } from '@/ui/useLoad';

// History of the cash counts of one period: the latest count per meeting is shown, earlier ones only as "Dihitung N kali".
export default function CashCountHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const repos = useRepos();
  const load = useCallback(async () => {
    const [period, weeks, lines] = await Promise.all([repos.periods.getById(id), repos.weeks.listByPeriod(id), repos.cashCounts.listAll(id)]);
    return { period, weeks, lines };
  }, [repos, id]);
  const { data, error, reload } = useLoad(load);

  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  if (!data) return <Loading />;
  const { period, weeks, lines } = data;
  if (!period) return <ErrorState title="Data tidak ditemukan" message="Periode tidak ditemukan. Kembali lalu pilih lagi." />;
  const numbers = weeks.filter((w) => w.status !== 'skipped').map((w) => w.number);
  if (numbers.length === 0) return <EmptyState title={COUNT_STRINGS.historyTitle} message={COUNT_STRINGS.historyEmpty} />;
  const rows = buildCountHistory(lines, numbers);
  const notice = firstDifferenceNotice(rows);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{COUNT_STRINGS.historyTitle}</Text>
      <Text style={styles.muted}>{period.name}</Text>
      {notice ? <Notice tone="warn">{notice}</Notice> : null}
      {rows.map((row) => {
        const view = countRowView(row, timesCounted(lines, id, row.week));
        const date = row.lines[0]?.date;
        // Latest count of the meeting: the Tunai and Debit lines of one save share created_at, a later save has a later one.
        const latest = row.lines.reduce<string | undefined>((a, l) => (l.createdAt && (!a || l.createdAt > a) ? l.createdAt : a), undefined);
        const recordedAt = date ? recordedAtLabel(latest, date) : '';
        return (
          <Card key={row.week} tone={view.tint ? 'warn' : 'default'}>
            <Text style={styles.cardTitle}>{view.title}</Text>
            {date ? <Text style={styles.muted}>{formatDate(date)}</Text> : null}
            {recordedAt ? <Text style={styles.muted}>{recordedAt}</Text> : null}
            {view.lines.map((l) => (
              <View key={l.account} style={styles.line}>
                <Text style={styles.body}>{l.label}:</Text>
                <Badge label={l.text} tone={l.tone} onTint={view.tint} />
              </View>
            ))}
            {view.badge ? <Badge label={view.badge.label} tone={view.badge.tone} onTint={view.tint} /> : null}
            {row.lines.map((l) => (l.note ? <Text key={l.account} style={styles.muted}>{l.note}</Text> : null))}
            {view.help ? <Text style={styles.muted}>{view.help}</Text> : null}
          </Card>
        );
      })}
      {period.status === 'active' ? <Button label={COUNT_STRINGS.countNow} onPress={() => router.push('/cek-kas')} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  title: { ...type.titleL, color: colors.text },
  cardTitle: { ...type.titleM, color: colors.text },
  body: { ...type.body, color: colors.text },
  muted: { ...type.body, color: colors.textSecondary },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
