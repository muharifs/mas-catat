import { useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRepos } from '@/db/provider';
import { Card } from '@/ui/components/Card';
import { ErrorState } from '@/ui/components/ErrorState';
import { Loading } from '@/ui/components/Loading';
import { Money } from '@/ui/components/Money';
import { ReportLine } from '@/ui/components/ReportLine';
import { SectionHeader } from '@/ui/components/SectionHeader';
import { formatDate } from '@/ui/dates';
import { formatRupiah } from '@/ui/format';
import {
  CORRECTED_NOT_COUNTED,
  correctionText,
  EVENT_LABELS,
  eventLines,
  isSettledState,
  LOAN_LABELS,
  WEEK_STATE_LABELS,
} from '@/ui/reportLabels';
import { colors, radius, spacing, type } from '@/ui/theme';
import { useLoad } from '@/ui/useLoad';

// History of one member in one period: status per meeting, then payments, offsets, titipan, write-off and refund in
// date order (corrected items stay, marked), then the member's Piutang loans.
export default function MemberHistoryScreen() {
  const { id, memberId } = useLocalSearchParams<{ id: string; memberId: string }>();
  const repos = useRepos();

  const load = useCallback(async () => {
    const [period, member, history] = await Promise.all([
      repos.periods.getById(id),
      repos.members.getById(memberId),
      repos.reports.getMemberHistory(id, memberId),
    ]);
    return { period, member, history };
  }, [repos, id, memberId]);
  const { data, error, reload } = useLoad(load);

  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  if (!data) return <Loading />;
  const { period, member, history } = data;
  if (!period || !member) return <ErrorState title="Data tidak ditemukan" message="Anggota atau periode tidak ditemukan. Kembali lalu pilih lagi." />;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{member.name}</Text>
      <Text style={styles.hint}>{period.name}</Text>

      <Card>
        <ReportLine label="Dibayar" amount={history.totals.paid} />
        <ReportLine label="Iuran dilunasi lewat potongan" amount={history.totals.offset} />
        <ReportLine label="Dari titipan" amount={history.totals.titipanUsed} />
        <ReportLine label="Tunggakan" amount={history.totals.outstanding} strong tone={history.totals.outstanding > 0 ? 'negative' : 'neutral'} />
        <Text style={styles.hint}>{CORRECTED_NOT_COUNTED}</Text>
      </Card>

      <SectionHeader title="Status per pertemuan" />
      {history.weeks.map((w) => (
        <View key={w.week} style={styles.row}>
          <View style={styles.head}>
            <Text style={styles.rowTitle}>
              Pertemuan {w.week}
              {w.date ? ` - ${formatDate(w.date)}` : ''}
            </Text>
            <Text style={isSettledState(w.state) ? styles.ok : styles.bad}>{WEEK_STATE_LABELS[w.state]}</Text>
          </View>
          {w.status.outstanding > 0 ? <Text style={styles.hint}>Sisa {formatRupiah(w.status.outstanding)}</Text> : null}
        </View>
      ))}

      <SectionHeader title="Riwayat" />
      {history.events.length === 0 ? <Text style={styles.hint}>Belum ada catatan.</Text> : null}
      {history.events.map((e, index) => {
        const correction = correctionText(e);
        return (
          <View key={`${e.kind}-${e.date}-${index}`} style={e.reversed ? [styles.row, styles.reversedRow] : styles.row}>
            <View style={styles.head}>
              <Text style={[styles.rowTitle, styles.flex, e.reversed && styles.strike]}>{EVENT_LABELS[e.kind]}</Text>
              <Money amount={e.amount} size="body" tone="neutral" style={e.reversed ? styles.strike : undefined} />
            </View>
            <Text style={styles.hint}>{formatDate(e.date)}</Text>
            {eventLines(e).map((line) => (
              <Text key={line} style={styles.body}>
                {line}
              </Text>
            ))}
            {correction ? <Text style={styles.bad}>{correction}</Text> : null}
          </View>
        );
      })}

      <SectionHeader title="Piutang (dipinjam anggota)" />
      {history.loans.length === 0 ? <Text style={styles.hint}>Tidak ada pinjaman.</Text> : null}
      {history.loans.map((l, index) => {
        const correction = correctionText(l);
        return (
          <View key={`${l.kind}-${l.date}-${index}`} style={l.reversed ? [styles.row, styles.reversedRow] : styles.row}>
            <View style={styles.head}>
              <Text style={[styles.rowTitle, styles.flex, l.reversed && styles.strike]}>{LOAN_LABELS[l.kind]}</Text>
              <Money amount={l.amount} size="body" tone="neutral" style={l.reversed ? styles.strike : undefined} />
            </View>
            <Text style={styles.hint}>{formatDate(l.date)}</Text>
            {correction ? <Text style={styles.bad}>{correction}</Text> : null}
          </View>
        );
      })}
      {history.loans.length > 0 ? (
        <Card tone="alt">
          <ReportLine label="Sisa piutang anggota ini" amount={history.totals.piutang} strong />
          <Text style={styles.hint}>Pinjaman dikurangi pelunasan, dari semua periode.</Text>
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  title: { ...type.titleL, color: colors.text },
  body: { ...type.body, color: colors.text },
  hint: { ...type.secondary, color: colors.textSecondary },
  flex: { flex: 1 },
  row: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.bgMute, gap: spacing.xs },
  reversedRow: { backgroundColor: colors.errorTint },
  strike: { textDecorationLine: 'line-through' },
  head: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  rowTitle: { ...type.bodyStrong, color: colors.text },
  ok: { ...type.label, color: colors.moneyIn, flexShrink: 1, textAlign: 'right' },
  bad: { ...type.label, color: colors.error, flexShrink: 1 },
});
