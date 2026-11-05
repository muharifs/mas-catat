import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { selectableWeekNumbers } from '@/domain/schedule';
import { useRepos } from '@/db/provider';
import { Button } from '@/ui/components/Button';
import { formatDate } from '@/ui/dates';
import { toIndonesian } from '@/ui/errors';
import { useLoad } from '@/ui/useLoad';

// Period detail: meeting schedule (host and date per meeting), payments entry, "Tutup pertemuan" and the way to the
// pre-close screen ("Akhiri periode").
export default function PeriodDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const repos = useRepos();

  const load = useCallback(async () => {
    const [period, weeks, members] = await Promise.all([
      repos.periods.getById(id),
      repos.weeks.listByPeriod(id),
      repos.members.list(),
    ]);
    // Which meetings already have a host payout in force (a corrected payout does not count).
    const paidWeeks = new Set<number>();
    for (const w of weeks) {
      if (await repos.ledger.getWeekPayout(id, w.number)) paidWeeks.add(w.number);
    }
    return { period, weeks, members, paidWeeks };
  }, [repos, id]);
  const { data, error: loadError, reload } = useLoad(load);

  const [actionError, setActionError] = useState<string | null>(null);

  if (loadError) return <Text style={styles.error}>{loadError}</Text>;
  if (!data) return <Text style={styles.muted}>Memuat...</Text>;
  if (!data.period) return <Text style={styles.error}>Periode tidak ditemukan.</Text>;

  const { period, weeks, members, paidWeeks } = data;
  const nameOf = (memberId: string | null) =>
    memberId === null ? 'Belum ditentukan' : (members.find((m) => m.id === memberId)?.name ?? '-');
  const selectable = selectableWeekNumbers(weeks);
  const isActive = period.status === 'active';
  const openWeeks = weeks.filter((w) => w.status === 'open').length;

  const oldestOpen = weeks.find((w) => w.status === 'open');

  function confirmCloseWeek() {
    if (!oldestOpen) return;
    Alert.alert(
      `Tutup pertemuan ${oldestOpen.number}`,
      `Tutup pertemuan ${oldestOpen.number} (${formatDate(oldestOpen.date)})? Tuan rumah dan tanggal pertemuan ini tidak bisa diubah lagi dan penutupan tidak bisa dibatalkan.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Tutup pertemuan',
          style: 'destructive',
          onPress: async () => {
            try {
              await repos.weeks.closeOldest(period.id);
              setActionError(null);
              await reload();
            } catch (e) {
              setActionError(toIndonesian(e));
            }
          },
        },
      ],
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{period.name}</Text>
      <Text>
        {isActive ? 'Aktif' : 'Selesai'} - {period.memberCount} anggota - mulai {formatDate(period.startDate)}
        {period.endDate ? ` - berakhir ${formatDate(period.endDate)}` : ''}
      </Text>

      <Button
        label="Pembayaran"
        onPress={() => router.push({ pathname: '/periods/[id]/payments', params: { id: period.id } })}
      />

      {isActive && oldestOpen ? (
        <View style={styles.box}>
          <Text style={styles.section}>Tutup pertemuan</Text>
          <Text style={styles.hint}>
            Pertemuan yang ditutup selalu yang paling awal yang masih terbuka (pertemuan {oldestOpen.number}) dan harus
            sudah punya tuan rumah. Tunggakan dihitung sampai pertemuan ini. Saat libur (misalnya Ramadan) tidak ada iuran:
            cukup jangan tutup pertemuan.
          </Text>
          <Button
            label={`Tutup pertemuan ${oldestOpen.number}`}
            variant="danger"
            disabled={oldestOpen.hostMemberId === null}
            onPress={confirmCloseWeek}
          />
          {oldestOpen.hostMemberId === null ? (
            <Text style={styles.hint}>Tentukan tuan rumah pertemuan {oldestOpen.number} dulu.</Text>
          ) : null}
        </View>
      ) : null}

      <Text style={styles.section}>Jadwal</Text>
      {weeks.map((w) => {
        const canPick = isActive && w.status === 'open' && selectable.includes(w.number);
        const isPaid = paidWeeks.has(w.number);
        // Same rule as the repository: a host payout is possible for the current meeting or a closed one.
        const canPay = isActive && !isPaid && w.hostMemberId !== null && (w.status === 'closed' || w.number === oldestOpen?.number);
        return (
          <View key={w.number} style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.weekTitle}>
                Pertemuan {w.number} - {formatDate(w.date)}
                {w.status === 'open' && !w.hostMemberId && !canPick ? ' (perkiraan)' : ''}
              </Text>
              <Text style={w.hostMemberId ? undefined : styles.hint}>Tuan rumah: {nameOf(w.hostMemberId)}</Text>
              <Text style={w.status === 'open' ? styles.open : styles.closed}>
                {w.status === 'open' ? 'Terbuka' : 'Ditutup'}
              </Text>
            </View>
            <View style={styles.actions}>
              {canPick ? (
                <Button
                  label={w.hostMemberId ? 'Ubah' : 'Tentukan'}
                  variant="secondary"
                  onPress={() =>
                    router.push({ pathname: '/periods/[id]/meetings/[number]', params: { id: period.id, number: String(w.number) } })
                  }
                />
              ) : null}
              {canPay ? (
                <Button
                  label="Bayar tuan rumah"
                  onPress={() => router.push({ pathname: '/periods/[id]/payout', params: { id: period.id, week: String(w.number) } })}
                />
              ) : null}
              {isPaid && isActive ? (
                <Button
                  label="Sudah dibayar"
                  variant="secondary"
                  onPress={() => router.push({ pathname: '/periods/[id]/payout', params: { id: period.id, week: String(w.number) } })}
                />
              ) : null}
              {isPaid && !isActive ? <Text style={styles.open}>Sudah dibayar</Text> : null}
            </View>
          </View>
        );
      })}

      {isActive ? (
        <View style={styles.box}>
          <Text style={styles.section}>Akhiri periode</Text>
          <Text style={styles.hint}>
            Periode bisa diakhiri setelah semua pertemuan ditutup dan semua tuan rumah dibayar ({openWeeks} pertemuan
            masih terbuka). Layar berikutnya menunjukkan tunggakan yang akan dihapus dan kredit anggota sebelum Anda
            memastikan.
          </Text>
          <Button
            label="Akhiri periode"
            variant="danger"
            onPress={() => router.push({ pathname: '/periods/[id]/close', params: { id: period.id } })}
          />
        </View>
      ) : null}

      {actionError ? <Text style={styles.error}>{actionError}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  title: { fontSize: 22, fontWeight: '700' },
  section: { fontSize: 16, fontWeight: '700', marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 8, backgroundColor: '#f2f6f3' },
  flex: { flex: 1 },
  actions: { gap: 6 },
  weekTitle: { fontWeight: '600' },
  open: { color: '#1f6f50' },
  closed: { color: '#666' },
  box: { gap: 8, padding: 12, borderRadius: 8, backgroundColor: '#f7f7f7' },
  hint: { color: '#666', fontSize: 13 },
  error: { padding: 8, color: '#b3261e' },
  muted: { padding: 16, color: '#666' },
});
