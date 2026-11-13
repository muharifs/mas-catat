import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { sortByName } from '@/domain/sort';
import { useRepos } from '@/db/provider';
import { Card } from '@/ui/components/Card';
import { ErrorState } from '@/ui/components/ErrorState';
import { ListRow, RowText } from '@/ui/components/ListRow';
import { Loading } from '@/ui/components/Loading';
import { Money } from '@/ui/components/Money';
import { ReportLine } from '@/ui/components/ReportLine';
import { SectionHeader } from '@/ui/components/SectionHeader';
import { formatDate } from '@/ui/dates';
import { isSettledState, MEETING_STATUS_LABELS, WEEK_STATE_LABELS } from '@/ui/reportLabels';
import { colors, spacing, type } from '@/ui/theme';
import { useLoad } from '@/ui/useLoad';
import { SEP } from '@/ui/separator';

// Report of one meeting: dues and how they were covered, the host payout and offset, kas contribution, and every member's state.
export default function MeetingReportScreen() {
  const { id, number } = useLocalSearchParams<{ id: string; number: string }>();
  const repos = useRepos();

  const load = useCallback(async () => {
    const [meeting, members] = await Promise.all([repos.reports.getMeetingReport(id, Number(number)), repos.members.list()]);
    return { meeting, members };
  }, [repos, id, number]);
  const { data, error, reload } = useLoad(load);

  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  if (!data) return <Loading />;

  const { meeting, members } = data;
  const nameOf = (memberId: string | null) =>
    memberId === null ? 'Belum ditentukan' : (members.find((m) => m.id === memberId)?.name ?? '-');

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Pertemuan {meeting.week}</Text>
      <Text style={styles.hint}>
        {formatDate(meeting.date)}{SEP}{MEETING_STATUS_LABELS[meeting.status]}{SEP}tuan rumah: {nameOf(meeting.hostMemberId)}
      </Text>

      <SectionHeader title="Iuran pertemuan" />
      <Card>
        <ReportLine label="Total iuran" amount={meeting.totalDues} hint="Rp15.000 x jumlah anggota" />
        <ReportLine label="Dibayar anggota" amount={meeting.coveredByPayments} />
        <ReportLine label="Iuran dilunasi lewat potongan" amount={meeting.coveredByOffset} />
        <ReportLine label="Dari titipan" amount={meeting.coveredByTitipan} />
        <ReportLine label="Belum dibayar" amount={meeting.unpaid} strong tone={meeting.unpaid > 0 ? 'negative' : 'neutral'} />
      </Card>

      <SectionHeader title="Tuan rumah dan kas" />
      <Card>
        <ReportLine label="Pembayaran tuan rumah (seharusnya)" amount={meeting.hostPayoutDue} hint="Rp10.000 x jumlah anggota" />
        <ReportLine label="Pembayaran tuan rumah (tercatat)" amount={meeting.hostPayout} emptyText="Belum dibayar" />
        <ReportLine label="Dipotong dari bayaran tuan rumah ini" amount={meeting.hostOffset} />
        <ReportLine
          label="Bagian untuk kas"
          amount={meeting.kasContribution}
          emptyText="Belum masuk"
          strong
          tone="positive"
          hint="Rp5.000 x jumlah anggota, setelah semua iuran pertemuan ini lunas."
        />
      </Card>

      <SectionHeader title="Status anggota" />
      {sortByName(meeting.members, (m) => nameOf(m.memberId)).map((m) => (
        <ListRow
          key={m.memberId}
          title={nameOf(m.memberId)}
          tone="alt"
          onPress={() => router.push({ pathname: '/reports/period/[id]/members/[memberId]', params: { id, memberId: m.memberId } })}
          right={m.status.outstanding > 0 ? <Money amount={m.status.outstanding} size="body" tone="negative" /> : undefined}
        >
          <RowText tone={isSettledState(m.state) ? 'ok' : 'danger'}>{WEEK_STATE_LABELS[m.state]}</RowText>
        </ListRow>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  title: { ...type.titleL, color: colors.text },
  hint: { ...type.secondary, color: colors.textSecondary },
});
