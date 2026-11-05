import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { weekState, type WeekState } from '@/domain/payment-preview';
import type { WeekStatus } from '@/domain/types';
import { useRepos } from '@/db/provider';
import { Button } from '@/ui/components/Button';
import { CorrectionForm } from '@/ui/components/CorrectionForm';
import { formatDate } from '@/ui/dates';
import { formatRupiah } from '@/ui/format';
import { useLoad } from '@/ui/useLoad';

const STATE_LABEL: Record<WeekState, string> = {
  paid: 'Lunas',
  offset: 'Lunas lewat potongan tuan rumah',
  partial_offset: 'Sebagian lewat potongan tuan rumah',
  partial: 'Kurang',
  unpaid: 'Belum bayar',
};

function weekDetail(s: WeekStatus): string {
  const parts: string[] = [];
  if (s.paid > 0) parts.push(`dibayar ${formatRupiah(s.paid)}`);
  if (s.offset > 0) parts.push(`potongan ${formatRupiah(s.offset)}`);
  if (s.outstanding > 0) parts.push(`sisa ${formatRupiah(s.outstanding)}`);
  return parts.join(', ');
}

// Member detail inside one period: per-week status, payment history and the "Catat pembayaran" button.
export default function MemberInPeriodScreen() {
  const { id, memberId } = useLocalSearchParams<{ id: string; memberId: string }>();
  const repos = useRepos();

  const load = useCallback(async () => {
    const [period, member, weeks, statuses, payments, allocations, balances] = await Promise.all([
      repos.periods.getById(id),
      repos.members.getById(memberId),
      repos.weeks.listByPeriod(id),
      repos.payments.getWeekStatuses(id, memberId),
      repos.payments.listWithCredit(id, memberId),
      repos.payments.listAllocations(id, memberId),
      repos.payments.listBalances(id),
    ]);
    return { period, member, weeks, statuses, payments, allocations, balance: balances.find((b) => b.memberId === memberId) };
  }, [repos, id, memberId]);
  const { data, error, reload } = useLoad(load);
  // Id of the payment whose correction form is open (one at a time).
  const [correcting, setCorrecting] = useState<string | null>(null);

  if (error) return <Text style={styles.error}>{error}</Text>;
  if (!data) return <Text style={styles.muted}>Memuat...</Text>;
  const { period, member, weeks, statuses, payments, allocations, balance } = data;
  if (!period || !member) return <Text style={styles.error}>Data tidak ditemukan.</Text>;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{member.name}</Text>
      <Text style={styles.muted}>{period.name}</Text>

      {balance ? (
        <View style={styles.summary}>
          <Text>
            Tunggakan sampai pertemuan {balance.throughWeek}: {formatRupiah(balance.arrears)}
          </Text>
          <Text>Bayar di muka: {formatRupiah(balance.prepaid)}</Text>
          <Text>Kredit: {formatRupiah(balance.credit)}</Text>
        </View>
      ) : null}

      {period.status === 'active' ? (
        <Button
          label="Catat pembayaran"
          onPress={() => router.push({ pathname: '/periods/[id]/pay', params: { id: period.id, memberId: member.id } })}
        />
      ) : (
        <Text style={styles.muted}>Periode sudah berakhir, pembayaran tidak bisa dicatat.</Text>
      )}

      <Text style={styles.section}>Status per pertemuan</Text>
      {statuses.map((s) => {
        const state = weekState(s);
        const week = weeks.find((w) => w.number === s.week);
        return (
          <View key={s.week} style={styles.row}>
            <View style={styles.head}>
              <Text style={styles.weekTitle}>
                Pertemuan {s.week}
                {week ? ` - ${formatDate(week.date)}` : ''}
              </Text>
              <Text style={state === 'paid' || state === 'offset' ? styles.ok : styles.bad}>{STATE_LABEL[state]}</Text>
            </View>
            {weekDetail(s) ? <Text style={styles.muted}>{weekDetail(s)}</Text> : null}
          </View>
        );
      })}

      <Text style={styles.section}>Riwayat pembayaran</Text>
      {payments.length === 0 ? <Text style={styles.muted}>Belum ada pembayaran.</Text> : null}
      {payments.map((p) => {
        const own = allocations.filter((a) => a.paymentId === p.id);
        return (
          <View key={p.id} style={p.reversed ? [styles.row, styles.reversedRow] : styles.row}>
            <Text style={[styles.weekTitle, p.reversed ? styles.strike : null]}>
              {formatDate(p.date)} - {formatRupiah(p.amount)}
            </Text>
            {p.reversed ? (
              <Text style={styles.bad}>Dikoreksi (dibatalkan): {p.reversalReason}</Text>
            ) : (
              <>
                {own.length > 0 ? (
                  <Text>Melunasi: {own.map((a) => `pertemuan ${a.week} (${formatRupiah(a.amount)})`).join(', ')}</Text>
                ) : null}
                {p.credit > 0 ? <Text style={styles.bad}>Menjadi kredit: {formatRupiah(p.credit)}</Text> : null}
                {period.status === 'active' && correcting !== p.id ? (
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
  container: { padding: 16, gap: 10 },
  title: { fontSize: 22, fontWeight: '700' },
  section: { fontSize: 16, fontWeight: '700', marginTop: 8 },
  summary: { padding: 12, borderRadius: 8, backgroundColor: '#f2f6f3', gap: 2 },
  row: { padding: 12, borderRadius: 8, backgroundColor: '#f7f7f7', gap: 6 },
  reversedRow: { backgroundColor: '#fdf1f0' },
  strike: { textDecorationLine: 'line-through' },
  head: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  weekTitle: { fontWeight: '600' },
  ok: { color: '#1f6f50', fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  bad: { color: '#b3261e', fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  error: { padding: 16, color: '#b3261e' },
  muted: { color: '#666' },
});
