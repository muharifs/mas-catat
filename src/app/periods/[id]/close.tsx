import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { endDateProblem, type EndDateProblem } from '@/domain/close';
import { useRepos } from '@/db/provider';
import { Button } from '@/ui/components/Button';
import { TextField } from '@/ui/components/TextField';
import { formatDate, todayIso } from '@/ui/dates';
import { toIndonesian } from '@/ui/errors';
import { formatRupiah } from '@/ui/format';
import { useLoad } from '@/ui/useLoad';

const END_DATE_MESSAGE: Record<EndDateProblem, string> = {
  invalid: 'Tanggal tidak valid. Gunakan format TTTT-BB-HH, misalnya 2026-01-04.',
  before_start: 'Tanggal berakhir tidak boleh sebelum tanggal mulai periode.',
  future: 'Tanggal berakhir tidak boleh di masa depan.',
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

  if (loadError) return <Text style={styles.error}>{loadError}</Text>;
  if (!data) return <Text style={styles.muted}>Memuat...</Text>;
  const { period, members, weeks, preview } = data;
  if (!period) return <Text style={styles.error}>Periode tidak ditemukan.</Text>;
  if (period.status === 'closed') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{period.name}</Text>
        <Text>Periode ini sudah berakhir{period.endDate ? ` pada ${formatDate(period.endDate)}` : ''}.</Text>
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
  const shown = preview.members.filter((m) => m.arrearsBefore > 0 || m.credit > 0);

  async function performClose() {
    setBusy(true);
    try {
      await repos.periods.close(periodId, endDate);
      // replace (not push): Back must not return to this screen, because the period has ended.
      router.replace({ pathname: '/periods/[id]', params: { id: periodId } });
    } catch (e) {
      setActionError(toIndonesian(e));
      setBusy(false);
      await reload();
    }
  }

  // Two steps, both with Alert.alert (the native dialog; it is not a web confirm() and has no text input).
  function confirmClose() {
    setActionError(null);
    Alert.alert(
      'Akhiri periode',
      `Akhiri "${periodName}" pada ${formatDate(endDate)}?\n\nTunggakan ${formatRupiah(preview.totalWriteoff)} dari ${preview.writeoffs.length} anggota akan dihapus dan ditanggung kas. Sisa kredit anggota tetap tersimpan.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Lanjut',
          onPress: () =>
            Alert.alert(
              'Yakin akhiri periode?',
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
        <View style={styles.blocker}>
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
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.section}>Ringkasan</Text>
        <Text>Anggota menunggak: {preview.membersInArrears}</Text>
        <Text>Total tunggakan sebelum kredit: {formatRupiah(preview.totalArrears)}</Text>
        <Text>Dilunasi dari kredit anggota: {formatRupiah(preview.totalSettledByCredit)}</Text>
        <Text style={styles.strong}>Tunggakan dihapus (ditanggung kas): {formatRupiah(preview.totalWriteoff)}</Text>
        <Text>
          Anggota memegang kredit: {preview.membersWithCredit} ({formatRupiah(preview.totalCredit)})
        </Text>
        <Text>Sisa kredit setelah dipakai: {formatRupiah(preview.totalCreditLeft)}</Text>
        <Text style={styles.hint}>
          Kredit anggota lebih dulu melunasi tunggakannya sendiri (pertemuan terlama dulu). Sisanya dihapus, satu catatan
          per anggota. Penghapusan tidak mengubah saldo kas. Sisa kredit dibawa ke periode berikutnya, atau dikembalikan
          lewat menu Kredit anggota.
        </Text>
      </View>

      <Text style={styles.section}>Per anggota</Text>
      {shown.length === 0 ? <Text style={styles.muted}>Tidak ada tunggakan dan tidak ada kredit.</Text> : null}
      {shown.map((m) => (
        <View key={m.memberId} style={styles.row}>
          <Text style={styles.weekTitle}>{nameOf(m.memberId)}</Text>
          <Text>
            Tunggakan {formatRupiah(m.arrearsBefore)}, kredit {formatRupiah(m.credit)}
          </Text>
          <Text style={m.writeoff > 0 ? styles.bad : styles.muted}>
            Dipakai dari kredit {formatRupiah(m.settledByCredit)}, dihapus {formatRupiah(m.writeoff)}, sisa kredit{' '}
            {formatRupiah(m.creditLeft)}
          </Text>
        </View>
      ))}

      <TextField
        label="Tanggal berakhir (TTTT-BB-HH)"
        value={endDate}
        onChangeText={setEndDate}
        keyboardType="numbers-and-punctuation"
        error={problem ? END_DATE_MESSAGE[problem] : null}
      />

      {actionError ? <Text style={styles.error}>{actionError}</Text> : null}
      <Button label={busy ? 'Memproses...' : 'Akhiri periode'} variant="danger" disabled={!canClose} onPress={confirmClose} />
      {!preview.canClose ? <Text style={styles.hint}>Tombol aktif setelah semua pertemuan ditutup dan semua tuan rumah dibayar.</Text> : null}
      <Button label="Batal" variant="secondary" onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10, paddingBottom: 48 },
  title: { fontSize: 22, fontWeight: '700' },
  section: { fontSize: 16, fontWeight: '700', marginTop: 8 },
  card: { padding: 12, borderRadius: 8, backgroundColor: '#f2f6f3', gap: 4 },
  row: { padding: 12, borderRadius: 8, backgroundColor: '#f7f7f7', gap: 2 },
  weekTitle: { fontWeight: '600' },
  strong: { fontWeight: '700' },
  blocker: { padding: 12, borderRadius: 8, backgroundColor: '#fdf1f0', gap: 4 },
  blockerTitle: { fontWeight: '700', color: '#b3261e' },
  blockerText: { color: '#b3261e' },
  hint: { color: '#666', fontSize: 13 },
  bad: { color: '#b3261e', fontWeight: '600' },
  error: { padding: 8, color: '#b3261e' },
  muted: { color: '#666' },
});
