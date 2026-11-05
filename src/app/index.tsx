import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRepos } from '@/db/provider';
import { Button } from '@/ui/components/Button';
import { EmptyState } from '@/ui/components/EmptyState';
import { formatDate } from '@/ui/dates';
import { toIndonesian } from '@/ui/errors';
import { formatRupiah } from '@/ui/format';
import { useLoad } from '@/ui/useLoad';

// Home: summary of the active period and links to the other screens.
export default function HomeScreen() {
  const repos = useRepos();

  const load = useCallback(async () => {
    const [members, period] = await Promise.all([repos.members.list(), repos.periods.getActive()]);
    if (!period) return { memberCount: members.length, period: null, week: null, hostName: null, arrears: null };
    const weeks = await repos.weeks.listByPeriod(period.id);
    const week = weeks.find((w) => w.status === 'open') ?? null;
    const hostName = week ? (members.find((m) => m.id === week.hostMemberId)?.name ?? '-') : null;
    const arrears = await repos.payments.getArrearsSummary(period.id);
    return { memberCount: members.length, period, week, hostName, arrears };
  }, [repos]);

  const { data, error, reload } = useLoad(load);
  const [actionError, setActionError] = useState<string | null>(null);

  if (error) return <Text style={styles.error}>{error}</Text>;
  if (!data) return <Text style={styles.muted}>Memuat...</Text>;

  const { period, week, hostName, memberCount, arrears } = data;

  function confirmCloseWeek() {
    if (!period || !week) return;
    const periodId = period.id;
    Alert.alert(
      `Tutup minggu ${week.number}`,
      `Tutup minggu ${week.number} (${formatDate(week.date)})? Tuan rumah minggu ini tidak bisa diganti lagi dan penutupan tidak bisa dibatalkan.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Tutup minggu',
          style: 'destructive',
          onPress: async () => {
            try {
              await repos.weeks.closeOldest(periodId);
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
    <ScrollView contentContainerStyle={styles.container}>
      {period ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{period.name}</Text>
          <Text>Jumlah anggota: {period.memberCount}</Text>
          {week ? (
            <>
              <Text>
                Minggu ke-{week.number} ({formatDate(week.date)})
              </Text>
              <Text>Tuan rumah: {hostName}</Text>
            </>
          ) : (
            <Text>Semua minggu sudah ditutup.</Text>
          )}
          {arrears ? (
            <Text style={arrears.membersInArrears > 0 ? styles.arrears : undefined}>
              {arrears.membersInArrears > 0
                ? `Menunggak sampai minggu ${arrears.throughWeek}: ${arrears.membersInArrears} anggota, total ${formatRupiah(arrears.totalArrears)}`
                : `Tidak ada tunggakan sampai minggu ${arrears.throughWeek}.`}
            </Text>
          ) : null}
          <Button
            label="Pembayaran"
            onPress={() => router.push({ pathname: '/periods/[id]/payments', params: { id: period.id } })}
          />
          {week ? <Button label={`Tutup minggu ${week.number}`} variant="danger" onPress={confirmCloseWeek} /> : null}
          {actionError ? <Text style={styles.error}>{actionError}</Text> : null}
          <Button
            label="Lihat jadwal"
            variant="secondary"
            onPress={() => router.push({ pathname: '/periods/[id]', params: { id: period.id } })}
          />
        </View>
      ) : memberCount === 0 ? (
        <EmptyState
          title="Belum ada anggota"
          message="Mulai dengan menambahkan anggota kelompok, lalu buat periode."
          actionLabel="Tambah anggota"
          onAction={() => router.push('/members')}
        />
      ) : (
        <EmptyState
          title="Belum ada periode aktif"
          message="Buat periode baru untuk mulai mencatat."
          actionLabel="Buat periode"
          onAction={() => router.push('/periods/new')}
        />
      )}

      <View style={styles.links}>
        <Button label="Anggota" variant="secondary" onPress={() => router.push('/members')} />
        <Button label="Periode" variant="secondary" onPress={() => router.push('/periods')} />
        <Button label="Buat Periode" onPress={() => router.push('/periods/new')} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16 },
  card: { padding: 16, borderRadius: 12, backgroundColor: '#f2f6f3', gap: 6 },
  cardTitle: { fontSize: 20, fontWeight: '700' },
  links: { gap: 10 },
  arrears: { color: '#b3261e', fontWeight: '600' },
  error: { padding: 16, color: '#b3261e' },
  muted: { padding: 16, color: '#666' },
});
