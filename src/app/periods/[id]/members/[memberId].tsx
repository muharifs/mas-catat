import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { weekState } from '@/domain/payment-preview';
import type { WeekStatus } from '@/domain/types';
import { useRepos } from '@/db/provider';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { CorrectionForm } from '@/ui/components/CorrectionForm';
import { ErrorState } from '@/ui/components/ErrorState';
import { Loading } from '@/ui/components/Loading';
import { Money } from '@/ui/components/Money';
import { SectionHeader } from '@/ui/components/SectionHeader';
import { formatDate } from '@/ui/dates';
import { PAYMENT_HOST_PAYOUT_STANDS_TEXT } from '@/ui/errors';
import { formatRupiah } from '@/ui/format';
import { colors, radius, spacing, type } from '@/ui/theme';
import { SKIPPED_NO_DUES_TEXT, WEEK_STATE_LABELS, weekStateTone } from '@/ui/reportLabels';
import { useLoad } from '@/ui/useLoad';
import { SEP } from '@/ui/separator';

function weekDetail(s: WeekStatus): string {
  const parts: string[] = [];
  if (s.paid > 0) parts.push(`dibayar ${formatRupiah(s.paid)}`);
  if (s.offset > 0) parts.push(`potongan ${formatRupiah(s.offset)}`);
  if (s.credited > 0) parts.push(`titipan ${formatRupiah(s.credited)}`);
  if (s.outstanding > 0) parts.push(`sisa ${formatRupiah(s.outstanding)}`);
  return parts.join(', ');
}

// Member detail inside one period: per-week status, payment history and the "Catat pembayaran" button.
export default function MemberInPeriodScreen() {
  const { id, memberId } = useLocalSearchParams<{ id: string; memberId: string }>();
  const repos = useRepos();

  const load = useCallback(async () => {
    const [period, member, weeks, statuses, payments, allocations, balances, standingPayouts] = await Promise.all([
      repos.periods.getById(id),
      repos.members.getById(memberId),
      repos.weeks.listByPeriod(id),
      repos.payments.getWeekStatuses(id, memberId),
      repos.payments.listWithCredit(id, memberId),
      repos.payments.listAllocations(id, memberId),
      repos.payments.listBalances(id),
      repos.payments.getStandingHostPayoutWeeks(id, memberId),
    ]);
    return {
      period,
      member,
      weeks,
      statuses,
      payments,
      allocations,
      balance: balances.find((b) => b.memberId === memberId),
      // B3: while the member's own host payout stands, their payments cannot be corrected.
      correctionBlocked: standingPayouts.length > 0,
    };
  }, [repos, id, memberId]);
  const { data, error, reload } = useLoad(load);
  // Id of the payment whose correction form is open (one at a time).
  const [correcting, setCorrecting] = useState<string | null>(null);

  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  if (!data) return <Loading />;
  const { period, member, weeks, statuses, payments, allocations, balance, correctionBlocked } = data;
  if (!period || !member) return <ErrorState title="Data tidak ditemukan" message="Anggota atau periode tidak ditemukan. Kembali lalu pilih lagi." />;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{member.name}</Text>
      <Text style={styles.muted}>{period.name}</Text>

      {balance ? (
        <Card>
          <Text style={styles.label}>Tunggakan sampai pertemuan {balance.throughWeek}</Text>
          <Money amount={balance.arrears} size="display" tone={balance.arrears > 0 ? 'negative' : 'neutral'} />
          <Text style={styles.body}>Dibayar di muka: {formatRupiah(balance.prepaid)}</Text>
          <Text style={styles.body}>Titipan: {formatRupiah(balance.credit)}</Text>
        </Card>
      ) : null}

      {period.status === 'active' ? (
        <Button
          label="Catat pembayaran"
          onPress={() => router.push({ pathname: '/periods/[id]/pay', params: { id: period.id, memberId: member.id } })}
        />
      ) : (
        <Text style={styles.muted}>Periode sudah berakhir, pembayaran tidak bisa dicatat.</Text>
      )}

      <SectionHeader title="Status per pertemuan" />
      {statuses.map((s) => {
        const state = weekState(s);
        const week = weeks.find((w) => w.number === s.week);
        return (
          <View key={s.week} style={styles.row}>
            <View style={styles.head}>
              <Text style={styles.weekTitle}>
                Pertemuan {s.week}
                {week ? `${SEP}${formatDate(week.date)}` : ''}
              </Text>
              <Text style={styles[weekStateTone(state)]}>{WEEK_STATE_LABELS[state]}</Text>
            </View>
            {state === 'skipped' ? <Text style={styles.muted}>{SKIPPED_NO_DUES_TEXT}</Text> : null}
            {weekDetail(s) ? <Text style={styles.muted}>{weekDetail(s)}</Text> : null}
          </View>
        );
      })}

      <SectionHeader title="Riwayat pembayaran" />
      {payments.length === 0 ? <Text style={styles.muted}>Belum ada pembayaran.</Text> : null}
      {payments.map((p) => {
        // An allocation on a skipped meeting no longer counts (its amount is titipan, shown below): never list it as "Melunasi".
        const own = allocations.filter((a) => a.paymentId === p.id && a.skipped !== true);
        return (
          <View key={p.id} style={p.reversed ? [styles.row, styles.reversedRow] : styles.row}>
            <Text style={[styles.weekTitle, p.reversed ? styles.strike : null]}>
              {formatDate(p.date)}{SEP}{formatRupiah(p.amount)}
            </Text>
            {p.reversed ? (
              <Text style={styles.bad}>Dikoreksi (dibatalkan): {p.reversalReason}</Text>
            ) : (
              <>
                {own.length > 0 ? (
                  <Text style={styles.body}>Melunasi: {own.map((a) => `pertemuan ${a.week} (${formatRupiah(a.amount)})`).join(', ')}</Text>
                ) : null}
                {p.credit > 0 ? <Text style={styles.bad}>Menjadi titipan: {formatRupiah(p.credit)}</Text> : null}
                {period.status === 'active' && correctionBlocked ? (
                  <Text style={styles.muted}>{PAYMENT_HOST_PAYOUT_STANDS_TEXT}</Text>
                ) : period.status === 'active' && correcting !== p.id ? (
                  <Button label="Koreksi" variant="secondary" onPress={() => setCorrecting(p.id)} />
                ) : null}
              </>
            )}
            {correcting === p.id ? (
              <CorrectionForm
                title={`Koreksi pembayaran ${formatRupiah(p.amount)}`}
                message={`Pembayaran ${formatRupiah(p.amount)} tanggal ${formatDate(p.date)} dibatalkan dan uangnya dikeluarkan lagi dari kas. Pertemuan yang dilunasinya jadi belum lunas. Pembayaran lain tidak berubah. Setelah itu catat ulang pembayaran yang benar. Koreksi tidak bisa dibatalkan.`}
                submitLabel="Koreksi pembayaran"
                onCancel={() => setCorrecting(null)}
                onSubmit={async (reason) => {
                  await repos.payments.reverse(p.id, reason);
                  setCorrecting(null);
                  await reload();
                }}
              />
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  title: { ...type.titleL, color: colors.text },
  label: { ...type.label, color: colors.textSecondary },
  body: { ...type.body, color: colors.text },
  row: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.bgMute, gap: spacing.sm },
  reversedRow: { backgroundColor: colors.errorTint },
  strike: { textDecorationLine: 'line-through' },
  head: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  weekTitle: { ...type.bodyStrong, color: colors.text, flex: 1 },
  ok: { ...type.label, color: colors.moneyIn, flexShrink: 1, textAlign: 'right' },
  bad: { ...type.label, color: colors.error, flexShrink: 1, textAlign: 'right' },
  // Skipped meeting: neither settled nor in arrears, so neither green nor red.
  neutral: { ...type.label, color: colors.textSecondary, flexShrink: 1, textAlign: 'right' },
  muted: { ...type.secondary, color: colors.textSecondary },
});
