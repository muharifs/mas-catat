import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { endDateProblem, type EndDateProblem } from '@/domain/close';
import { sortByName } from '@/domain/sort';
import { useRepos } from '@/db/provider';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { DateField } from '@/ui/components/DateField';
import { ErrorState } from '@/ui/components/ErrorState';
import { Loading } from '@/ui/components/Loading';
import { Money } from '@/ui/components/Money';
import { Notice } from '@/ui/components/Notice';
import { SectionHeader } from '@/ui/components/SectionHeader';
import { formatDate, todayIso } from '@/ui/dates';
import { toIndonesian } from '@/ui/errors';
import { formatRupiah } from '@/ui/format';
import { toasts } from '@/ui/messages';
import { colors, radius, spacing, type } from '@/ui/theme';
import { toast } from '@/ui/toast';
import { useLoad } from '@/ui/useLoad';

const END_DATE_MESSAGE: Record<EndDateProblem, string> = {
  invalid: 'Tanggal tidak valid. Pilih tanggal dari kalender.',
  before_start: 'Tanggal berakhir tidak boleh sebelum tanggal mulai periode.',
  future: 'Tanggal berakhir tidak boleh di masa depan. Pilih hari ini atau sebelumnya.',
};

// Pre-close screen: shows exactly what ending the period will do (every number comes from the repository, which
// uses the pure domain plan; nothing is calculated here), blocks it while a meeting is open or a host is unpaid,
// and asks twice before the irreversible step.
export default function ClosePeriodScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const repos = useRepos();

  const load = useCallback(async () => {
    const [period, members, weeks, preview] = await Promise.all([
      repos.periods.getById(id),
      repos.members.list(),
      repos.weeks.listByPeriod(id),
      repos.periods.previewClose(id),
    ]);
    return { period, members, weeks, preview };
  }, [repos, id]);
  const { data, error: loadError, reload } = useLoad(load);

  const [endDate, setEndDate] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loadError) return <ErrorState message={loadError} onRetry={() => void reload()} />;
  if (!data) return <Loading />;
  const { period, members, weeks, preview } = data;
  if (!period) return <ErrorState title="Data tidak ditemukan" message="Periode tidak ditemukan. Kembali lalu pilih lagi." />;
  if (period.status === 'closed') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{period.name}</Text>
        <Text style={styles.body}>Periode ini sudah berakhir{period.endDate ? ` pada ${formatDate(period.endDate)}` : ''}.</Text>
        <Button label="Kembali" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  const periodId = period.id;
  const periodName = period.name;
  const nameOf = (memberId: string | null) =>
    memberId === null ? '-' : (members.find((m) => m.id === memberId)?.name ?? '-');
  const hostOf = (week: number) => nameOf(weeks.find((w) => w.number === week)?.hostMemberId ?? null);
  const problem = endDateProblem(endDate, period.startDate, todayIso());
  const canClose = preview.canClose && problem === null && !busy;
  const shown = sortByName(
    preview.members.filter((m) => m.arrearsBefore > 0 || m.credit > 0),
    (m) => nameOf(m.memberId),
  );

  async function performClose() {
    setBusy(true);
    try {
      await repos.periods.close(periodId, endDate);
      toast(toasts.periodClosed(periodName));
      // replace (not push): Back must not return to this screen, because the period has ended.
      router.replace({ pathname: '/periods/[id]', params: { id: periodId } });
    } catch (e) {
      setActionError(toIndonesian(e, 'close_period'));
      setBusy(false);
      await reload();
    }
  }

  // Two steps, both with Alert.alert (the native dialog; it is not a web confirm() and has no text input).
  function confirmClose() {
    setActionError(null);
    Alert.alert(
      'Akhiri periode',
      `Akhiri "${periodName}" pada ${formatDate(endDate)}?\n\nTunggakan ${formatRupiah(preview.totalWriteoff)} dari ${preview.writeoffs.length} anggota akan dihapus dan ditanggung kas. Sisa titipan anggota tetap tersimpan.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Lanjut',
          onPress: () =>
            Alert.alert(
              'Yakin ingin mengakhiri periode?',
              'Ini tidak bisa dibatalkan. Setelah periode berakhir, pembayaran, pertemuan dan pembayaran tuan rumah periode ini tidak bisa diubah lagi.',
              [
                { text: 'Batal', style: 'cancel' },
                { text: 'Ya, akhiri periode', style: 'destructive', onPress: () => void performClose() },
              ],
            ),
        },
      ],
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Akhiri {period.name}</Text>

      {!preview.canClose ? (
        <Card tone="danger">
          <Text style={styles.blockerTitle}>Belum bisa diakhiri</Text>
          {preview.openWeeks.length > 0 ? (
            <Text style={styles.blockerText}>
              Pertemuan yang masih terbuka: {preview.openWeeks.join(', ')}. Tutup semuanya dulu.
            </Text>
          ) : null}
          {preview.unpaidHostWeeks.length > 0 ? (
            <Text style={styles.blockerText}>
              Tuan rumah yang belum dibayar:{' '}
              {preview.unpaidHostWeeks.map((w) => `pertemuan ${w} (${hostOf(w)})`).join(', ')}. Bayar dulu semuanya
              (pembayaran yang sudah dikoreksi dianggap belum dibayar).
            </Text>
          ) : null}
          <Text style={styles.hint}>Angka di bawah dihitung dari pertemuan yang sudah ditutup saja.</Text>
        </Card>
      ) : null}

      <SectionHeader title="Ringkasan" />
      <Card>
        <Text style={styles.body}>Anggota menunggak: {preview.membersInArrears}</Text>
        <Text style={styles.body}>Total tunggakan sebelum titipan: {formatRupiah(preview.totalArrears)}</Text>
        <Text style={styles.body}>Dilunasi dari titipan anggota: {formatRupiah(preview.totalSettledByCredit)}</Text>
        <Text style={styles.label}>Tunggakan dihapus (ditanggung kas)</Text>
        <Money amount={preview.totalWriteoff} size="large" tone={preview.totalWriteoff > 0 ? 'negative' : 'neutral'} />
        <Text style={styles.body}>
          Anggota memegang titipan: {preview.membersWithCredit} ({formatRupiah(preview.totalCredit)})
        </Text>
        <Text style={styles.body}>Sisa titipan setelah dipakai: {formatRupiah(preview.totalCreditLeft)}</Text>
        <Text style={styles.hint}>
          Titipan anggota lebih dulu melunasi tunggakannya sendiri (pertemuan terlama dulu). Sisanya dihapus, satu catatan
          per anggota. Penghapusan tidak mengubah saldo kas. Sisa titipan dibawa ke periode berikutnya, atau dikembalikan
          lewat Menu {'>'} Titipan anggota.
        </Text>
      </Card>

      <SectionHeader title="Per anggota" />
      {shown.length === 0 ? <Text style={styles.muted}>Tidak ada tunggakan dan tidak ada titipan.</Text> : null}
      {shown.map((m) => (
        <View key={m.memberId} style={styles.row}>
          <Text style={styles.weekTitle}>{nameOf(m.memberId)}</Text>
          <Text style={styles.body}>
            Tunggakan {formatRupiah(m.arrearsBefore)}, titipan {formatRupiah(m.credit)}
          </Text>
          <Text style={m.writeoff > 0 ? styles.bad : styles.muted}>
            Dipakai dari titipan {formatRupiah(m.settledByCredit)}, dihapus {formatRupiah(m.writeoff)}, sisa titipan{' '}
            {formatRupiah(m.creditLeft)}
          </Text>
        </View>
      ))}

      <DateField label="Tanggal berakhir" value={endDate} onChange={setEndDate} maxDate={todayIso()} error={problem ? END_DATE_MESSAGE[problem] : null} />

      {actionError ? <Notice tone="danger">{actionError}</Notice> : null}
      <Button label={busy ? 'Memproses...' : 'Akhiri periode'} variant="danger" disabled={!canClose} onPress={confirmClose} />
      {!preview.canClose ? <Text style={styles.hint}>Tombol aktif setelah semua pertemuan ditutup dan semua tuan rumah dibayar.</Text> : null}
      <Button label="Batal" variant="secondary" onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  title: { ...type.titleL, color: colors.text },
  label: { ...type.label, color: colors.textSecondary },
  body: { ...type.body, color: colors.text },
  row: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.bgMute, gap: spacing.xs },
  weekTitle: { ...type.bodyStrong, color: colors.text },
  blockerTitle: { ...type.label, color: colors.error },
  blockerText: { ...type.body, color: colors.error },
  hint: { ...type.secondary, color: colors.textSecondary },
  bad: { ...type.body, color: colors.error, fontWeight: '700' },
  muted: { ...type.body, color: colors.textSecondary },
});
