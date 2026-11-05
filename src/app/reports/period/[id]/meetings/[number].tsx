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
import { formatDate } from '@/ui/dates';
import { isSettledState, MEETING_STATUS_LABELS, WEEK_STATE_LABELS } from '@/ui/reportLabels';
import { colors, spacing, type } from '@/ui/theme';
import { useLoad } from '@/ui/useLoad';

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
        {formatDate(meeting.date)} - {MEETING_STATUS_LABELS[meeting.status]} - tuan rumah: {nameOf(meeting.hostMemberId)}
      </Text>

      <Card>
        <Text style={styles.heading}>Iuran pertemuan</Text>
        <ReportLine label="Total iuran" amount={meeting.totalDues} hint="15.000 x jumlah anggota" />
        <ReportLine label="Dibayar anggota" amount={meeting.coveredByPayments} />
        <ReportLine label="Potongan tuan rumah" amount={meeting.coveredByOffset} />
        <ReportLine label="Dari titipan" amount={meeting.coveredByTitipan} />
        <ReportLine label="Belum dibayar" amount={meeting.unpaid} strong tone={meeting.unpaid > 0 ? 'negative' : 'neutral'} />
      </Card>

      <Card>
        <Text style={styles.heading}>Tuan rumah dan kas</Text>
        <ReportLine label="Pembayaran tuan rumah (seharusnya)" amount={meeting.hostPayoutDue} hint="10.000 x jumlah anggota" />
        <ReportLine label="Pembayaran tuan rumah (tercatat)" amount={meeting.hostPayout} emptyText="Belum dibayar" />
        <ReportLine label="Potongan tunggakan tuan rumah" amount={meeting.hostOffset} />
        <ReportLine
          label="Kontribusi kas"
          amount={meeting.kasContribution}
          emptyText="Belum terealisasi"
          strong
          tone="positive"
          hint="5.000 x jumlah anggota, setelah semua iuran pertemuan ini lunas."
        />
      </Card>

      <Text style={styles.heading}>Status anggota</Text>
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
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  title: { ...type.title, color: colors.text },
  heading: { ...type.heading, color: colors.text },
  hint: { ...type.caption, color: colors.textMuted },
});
