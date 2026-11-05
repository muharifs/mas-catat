import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { isRealDate, selectableWeekNumbers } from '@/domain/schedule';
import { useRepos } from '@/db/provider';
import { Button } from '@/ui/components/Button';
import { TextField } from '@/ui/components/TextField';
import { formatDate, todayIso } from '@/ui/dates';
import { toIndonesian } from '@/ui/errors';
import { useLoad } from '@/ui/useLoad';

// Period detail: meeting schedule (host and date per meeting), payments entry, "Tutup pertemuan" and "Akhiri periode".
export default function PeriodDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const repos = useRepos();

  const load = useCallback(async () => {
    const [period, weeks, members] = await Promise.all([
      repos.periods.getById(id),
      repos.weeks.listByPeriod(id),
      repos.members.list(),
    ]);
    return { period, weeks, members };
  }, [repos, id]);
  const { data, error: loadError, reload } = useLoad(load);

  const [actionError, setActionError] = useState<string | null>(null);
  const [endDate, setEndDate] = useState(todayIso());

  if (loadError) return <Text style={styles.error}>{loadError}</Text>;
  if (!data) return <Text style={styles.muted}>Memuat...</Text>;
  if (!data.period) return <Text style={styles.error}>Periode tidak ditemukan.</Text>;

  const { period, weeks, members } = data;
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

  function confirmEnd() {
    if (!isRealDate(endDate)) {
      setActionError('Tanggal tidak valid. Gunakan format TTTT-BB-HH, misalnya 2026-01-04.');
      return;
    }
    Alert.alert('Akhiri periode', `Akhiri "${period.name}" pada ${formatDate(endDate)}? Ini tidak bisa dibatalkan.`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Akhiri',
        style: 'destructive',
        onPress: async () => {
          try {
            await repos.periods.close(period.id, endDate);
            setActionError(null);
            await reload();
          } catch (e) {
            setActionError(toIndonesian(e));
          }
        },
      },
    ]);
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
            {canPick ? (
              <Button
                label={w.hostMemberId ? 'Ubah' : 'Tentukan'}
                variant="secondary"
                onPress={() =>
                  router.push({ pathname: '/periods/[id]/meetings/[number]', params: { id: period.id, number: String(w.number) } })
                }
              />
            ) : null}
          </View>
        );
      })}

      {isActive ? (
        <View style={styles.box}>
          <Text style={styles.section}>Akhiri periode</Text>
          <Text style={styles.hint}>
            Periode hanya bisa diakhiri setelah semua pertemuan ditutup ({openWeeks} pertemuan masih terbuka). Penghapusan
            tunggakan dan sisa kredit anggota belum tersedia; itu dikerjakan di tahap berikutnya.
          </Text>
          <TextField label="Tanggal berakhir (TTTT-BB-HH)" value={endDate} onChangeText={setEndDate} />
          <Button label="Akhiri periode" variant="danger" onPress={confirmEnd} />
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
  weekTitle: { fontWeight: '600' },
  open: { color: '#1f6f50' },
  closed: { color: '#666' },
  box: { gap: 8, padding: 12, borderRadius: 8, backgroundColor: '#f7f7f7' },
  hint: { color: '#666', fontSize: 13 },
  error: { padding: 8, color: '#b3261e' },
  muted: { padding: 16, color: '#666' },
});
