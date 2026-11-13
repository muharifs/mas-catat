import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { sortByName } from '@/domain/sort';
import { useRepos } from '@/db/provider';
import { Card } from '@/ui/components/Card';
import { ErrorState } from '@/ui/components/ErrorState';
import { ListRow, RowText } from '@/ui/components/ListRow';
import { Loading } from '@/ui/components/Loading';
import { Money } from '@/ui/components/Money';
import { ReportLine } from '@/ui/components/ReportLine';
import { SearchField } from '@/ui/components/SearchField';
import { SectionHeader } from '@/ui/components/SectionHeader';
import { formatDate } from '@/ui/dates';
import { filterByQuery, shouldShowMemberSearch } from '@/ui/memberSearch';
import { CORRECTED_NOT_COUNTED, MEETING_STATUS_LABELS } from '@/ui/reportLabels';
import { colors, spacing, type } from '@/ui/theme';
import { useLoad } from '@/ui/useLoad';
import { SEP } from '@/ui/separator';

// Report of one period (active or ended): summary, one row per meeting, one row per member (A-Z).
export default function PeriodReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const repos = useRepos();

  const load = useCallback(async () => {
    const [report, members, periodMembers] = await Promise.all([
      repos.reports.getPeriodReport(id),
      repos.members.list(),
      repos.periods.getMembers(id),
    ]);
    return { report, members, periodMembers };
  }, [repos, id]);
  const { data, error, reload } = useLoad(load);
  const [query, setQuery] = useState(''); // local search word; declared before the early returns

  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  if (!data) return <Loading />;

  const { report, members, periodMembers } = data;
  const { period, summary, meetings } = report;
  const nameOf = (memberId: string | null) =>
    memberId === null ? 'Belum ditentukan' : (members.find((m) => m.id === memberId)?.name ?? '-');
  const sortedMembers = sortByName(periodMembers, (m) => nameOf(m.memberId));
  const searchShown = shouldShowMemberSearch(sortedMembers.length);
  const found = filterByQuery(sortedMembers, (m) => nameOf(m.memberId), searchShown ? query : '');

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{period.name}</Text>
      <Text style={styles.hint}>
        {period.status === 'active' ? 'Aktif' : 'Berakhir'}{SEP}{period.memberCount} anggota{SEP}mulai {formatDate(period.startDate)}
        {period.endDate ? `${SEP}sampai ${formatDate(period.endDate)}` : ''}
      </Text>

      <SectionHeader title="Ringkasan periode" />
      <Card>
        <ReportLine label="Total iuran periode" amount={summary.totalDues} hint="Rp15.000 x anggota x pertemuan" />
        <ReportLine label="Terkumpul dari anggota" amount={summary.collected} />
        <ReportLine label="Pembayaran tuan rumah" amount={summary.payouts} />
        <ReportLine label="Dipotong dari bayaran tuan rumah" amount={summary.offsets} />
        <ReportLine label="Tunggakan ditanggung kas" amount={summary.writeoffs} hint="Dihapus saat periode berakhir. Tidak mengubah saldo kas." />
        <ReportLine label="Pengeluaran bersama" amount={summary.sharedGoal} />
        <ReportLine label="Pengembalian titipan" amount={summary.creditRefunds} />
        <ReportLine
          label="Perubahan kas bersih"
          amount={summary.netKasChange}
          strong
          tone={summary.netKasChange < 0 ? 'negative' : 'positive'}
          hint="Tunai + Debit dari catatan periode ini, tanpa saldo awal."
        />
        <Text style={styles.hint}>{CORRECTED_NOT_COUNTED}</Text>
      </Card>

      <SectionHeader title="Per pertemuan" />
      {meetings.map((m) => (
        <ListRow
          key={m.week}
          title={`Pertemuan ${m.week}${SEP}${formatDate(m.date)}`}
          tone="alt"
          onPress={() => router.push({ pathname: '/reports/period/[id]/meetings/[number]', params: { id, number: String(m.week) } })}
          right={<Money amount={m.unpaid} size="heading" tone={m.unpaid > 0 ? 'negative' : 'neutral'} />}
        >
          <RowText>Tuan rumah: {nameOf(m.hostMemberId)}</RowText>
          <RowText tone={m.fullyCovered ? 'ok' : 'warn'}>
            {MEETING_STATUS_LABELS[m.status]}{SEP}{m.fullyCovered ? 'iuran lengkap' : 'ada yang belum bayar'}
          </RowText>
        </ListRow>
      ))}

      <SectionHeader title="Per anggota" />
      {searchShown ? <SearchField value={query} onChangeText={setQuery} matchCount={found.matchCount} totalCount={sortedMembers.length} /> : null}
      {found.items.map((m) => (
        <ListRow
          key={m.memberId}
          title={nameOf(m.memberId)}
          tone="alt"
          onPress={() => router.push({ pathname: '/reports/period/[id]/members/[memberId]', params: { id, memberId: m.memberId } })}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  title: { ...type.titleL, color: colors.text },
  hint: { ...type.secondary, color: colors.textSecondary },
});
