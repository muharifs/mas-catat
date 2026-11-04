import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { isRealDate } from '@/domain/schedule';
import { useRepos } from '@/db/provider';
import { Button } from '@/ui/components/Button';
import { TextField } from '@/ui/components/TextField';
import { formatDate, todayIso } from '@/ui/dates';
import { toIndonesian } from '@/ui/errors';
import { useLoad } from '@/ui/useLoad';

// Period detail: schedule per week, host change (swap of two open weeks) and "Akhiri periode".
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

  const [swapMode, setSwapMode] = useState(false);
  const [picked, setPicked] = useState<number[]>([]); // selected week numbers, max 2
  const [actionError, setActionError] = useState<string | null>(null);
  const [endDate, setEndDate] = useState(todayIso());

  if (loadError) return <Text style={styles.error}>{loadError}</Text>;
  if (!data) return <Text style={styles.muted}>Memuat...</Text>;
  if (!data.period) return <Text style={styles.error}>Periode tidak ditemukan.</Text>;

  const { period, weeks, members } = data;
  const nameOf = (memberId: string) => members.find((m) => m.id === memberId)?.name ?? '-';
  const label = (n: number) => `Minggu ${n} (${nameOf(weeks.find((w) => w.number === n)?.hostMemberId ?? '')})`;
  const isActive = period.status === 'active';
  const openWeeks = weeks.filter((w) => w.status === 'open').length;

  function pick(n: number) {
    setActionError(null);
    setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : p.length >= 2 ? [p[1] as number, n] : [...p, n]));
  }

  function cancelSwap() {
    setSwapMode(false);
    setPicked([]);
  }

  function confirmSwap() {
    const [a, b] = picked;
    if (a === undefined || b === undefined) return;
    Alert.alert('Ganti tuan rumah', `${label(a)} <-> ${label(b)}`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Tukar',
        onPress: async () => {
          try {
            await repos.weeks.swapHosts(period.id, a, b);
            cancelSwap();
            setActionError(null);
            await reload();
          } catch (e) {
            setActionError(toIndonesian(e));
          }
        },
      },
    ]);
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

  const [pa, pb] = picked;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{period.name}</Text>
      <Text>
        {isActive ? 'Aktif' : 'Selesai'} - {period.memberCount} anggota - mulai {formatDate(period.startDate)}
        {period.endDate ? ` - berakhir ${formatDate(period.endDate)}` : ''}
      </Text>

      <Text style={styles.section}>Jadwal</Text>
      {weeks.map((w) => {
        const selectable = swapMode && w.status === 'open';
        const selected = picked.includes(w.number);
        return (
          <View key={w.number} style={[styles.row, selected && styles.rowSelected]}>
            <View style={styles.flex}>
              <Text style={styles.weekTitle}>
                Minggu {w.number} - {formatDate(w.date)}
              </Text>
              <Text>Tuan rumah: {nameOf(w.hostMemberId)}</Text>
              <Text style={w.status === 'open' ? styles.open : styles.closed}>
                {w.status === 'open' ? 'Terbuka' : 'Ditutup'}
              </Text>
            </View>
            {swapMode ? (
              <Button
                label={selected ? 'Dipilih' : 'Pilih'}
                variant={selected ? 'primary' : 'secondary'}
                disabled={!selectable}
                onPress={() => pick(w.number)}
              />
            ) : null}
          </View>
        );
      })}

      {isActive && !swapMode ? (
        <Button label="Ganti tuan rumah" variant="secondary" disabled={openWeeks < 2} onPress={() => setSwapMode(true)} />
      ) : null}
      {swapMode ? (
        <View style={styles.box}>
          <Text>Pilih dua minggu yang masih terbuka untuk saling ditukar.</Text>
          {pa !== undefined && pb !== undefined ? (
            <Text style={styles.weekTitle}>
              {label(pa)} {'<->'} {label(pb)}
            </Text>
          ) : null}
          <Button label="Tukar" disabled={picked.length !== 2} onPress={confirmSwap} />
          <Button label="Batal" variant="secondary" onPress={cancelSwap} />
        </View>
      ) : null}

      {isActive ? (
        <View style={styles.box}>
          <Text style={styles.section}>Akhiri periode</Text>
          <Text style={styles.hint}>
            Periode hanya bisa diakhiri setelah semua minggu ditutup ({openWeeks} minggu masih terbuka). Penghapusan
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
  rowSelected: { borderWidth: 2, borderColor: '#1f6f50' },
  flex: { flex: 1 },
  weekTitle: { fontWeight: '600' },
  open: { color: '#1f6f50' },
  closed: { color: '#666' },
  box: { gap: 8, padding: 12, borderRadius: 8, backgroundColor: '#f7f7f7' },
  hint: { color: '#666', fontSize: 13 },
  error: { padding: 8, color: '#b3261e' },
  muted: { padding: 16, color: '#666' },
});
