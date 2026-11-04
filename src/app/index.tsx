import { router } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRepos } from '@/db/provider';
import { Button } from '@/ui/components/Button';
import { EmptyState } from '@/ui/components/EmptyState';
import { formatDate } from '@/ui/dates';
import { useLoad } from '@/ui/useLoad';

// Home: summary of the active period and links to the other screens.
export default function HomeScreen() {
  const repos = useRepos();

  const load = useCallback(async () => {
    const [members, period] = await Promise.all([repos.members.list(), repos.periods.getActive()]);
    if (!period) return { memberCount: members.length, period: null, week: null, hostName: null };
    const weeks = await repos.weeks.listByPeriod(period.id);
    const week = weeks.find((w) => w.status === 'open') ?? null;
    const hostName = week ? (members.find((m) => m.id === week.hostMemberId)?.name ?? '-') : null;
    return { memberCount: members.length, period, week, hostName };
  }, [repos]);

  const { data, error } = useLoad(load);

  if (error) return <Text style={styles.error}>{error}</Text>;
  if (!data) return <Text style={styles.muted}>Memuat...</Text>;

  const { period, week, hostName, memberCount } = data;

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
  error: { padding: 16, color: '#b3261e' },
  muted: { padding: 16, color: '#666' },
});
