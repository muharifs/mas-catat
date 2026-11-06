import { router } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { defaultReportPeriod } from '@/domain/report';
import { useRepos } from '@/db/provider';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { ErrorState } from '@/ui/components/ErrorState';
import { ListRow, RowText } from '@/ui/components/ListRow';
import { Loading } from '@/ui/components/Loading';
import { Notice } from '@/ui/components/Notice';
import { ReportLine } from '@/ui/components/ReportLine';
import { formatDate } from '@/ui/dates';
import { EXPECTED_FORMULA, EXPECTED_LABELS, unpaidPayoutText } from '@/ui/reportLabels';
import { colors, spacing, type } from '@/ui/theme';
import { useLoad } from '@/ui/useLoad';

// Reports home: kas balances and expected kas (global over every period), then the way to the per-period reports.
// The screen only displays; every number comes from repos.reports (pure functions in src/domain/report.ts).
export default function ReportsScreen() {
  const repos = useRepos();

  const load = useCallback(async () => {
    const [kas, periods] = await Promise.all([repos.reports.getKasReport(), repos.periods.list()]);
    return { kas, periods };
  }, [repos]);
  const { data, error, reload } = useLoad(load);

  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  if (!data) return <Loading />;

  const { kas, periods } = data;
  const { balances, expected } = kas;
  const goPeriod = (id: string) => router.push({ pathname: '/reports/period/[id]', params: { id } });
  const preferred = defaultReportPeriod(periods);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card>
        <Text style={styles.heading}>Saldo kas</Text>
        <ReportLine label="Tunai" amount={balances.tunai} />
        <ReportLine label="Debit" amount={balances.debit} />
        <ReportLine label="Piutang (dipinjam anggota)" amount={balances.piutang} />
        <ReportLine label={EXPECTED_LABELS.actual} amount={balances.actual} strong />
        <Text style={styles.hint}>Sama dengan layar Kas. Piutang belum ada di tangan, jadi tidak masuk kas nyata.</Text>
      </Card>

      <Card>
        <Text style={styles.heading}>{EXPECTED_LABELS.expected}</Text>
        <ReportLine label={EXPECTED_LABELS.actual} amount={expected.actualKas} />
        <ReportLine
          label={`+ ${EXPECTED_LABELS.outstanding}`}
          amount={expected.outstandingDues}
          hint="Sampai pertemuan berjalan di periode aktif. Tunggakan yang sudah dihapus tidak dihitung."
        />
        <ReportLine label={`- ${EXPECTED_LABELS.titipan}`} amount={expected.creditHeld} />
        <ReportLine label={EXPECTED_LABELS.titipanAvailable} amount={expected.creditAvailable} hint="Uang anggota yang belum dipakai untuk iuran." />
        <ReportLine
          label={EXPECTED_LABELS.titipanCarried}
          amount={expected.creditCarriedOpen}
          hint="Titipan yang dibawa ke periode baru dan keluar dari baris ini saat pertemuannya ditutup."
        />
        <ReportLine label={`= ${EXPECTED_LABELS.expected}`} amount={expected.expected} strong />
        <Text style={styles.hint}>{EXPECTED_FORMULA}</Text>
      </Card>

      <Card tone="alt">
        <Text style={styles.heading}>Info (di luar rumus)</Text>
        <ReportLine label={EXPECTED_LABELS.prepaid} amount={expected.prepaidDues} hint="Iuran pertemuan setelah pertemuan berjalan yang sudah dibayar." />
        <ReportLine label={EXPECTED_LABELS.unpaidPayout} amount={expected.unpaidPayoutAmount} hint={unpaidPayoutText(expected.unpaidPayoutCount)} />
      </Card>

      <Text style={styles.heading}>Laporan per periode</Text>
      {periods.length === 0 ? <Notice>Belum ada periode.</Notice> : null}
      {preferred ? <Button label={`Buka ${preferred.name}`} onPress={() => goPeriod(preferred.id)} /> : null}
      {periods.map((p) => (
        <ListRow key={p.id} title={p.name} tone="alt" onPress={() => goPeriod(p.id)}>
          <RowText tone={p.status === 'active' ? 'ok' : 'muted'}>
            {p.status === 'active' ? 'Aktif' : 'Selesai'} - mulai {formatDate(p.startDate)}
            {p.endDate ? ` - berakhir ${formatDate(p.endDate)}` : ''}
          </RowText>
        </ListRow>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  heading: { ...type.heading, color: colors.text },
  hint: { ...type.caption, color: colors.textMuted },
});
