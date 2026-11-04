import { router } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRepos } from '@/db/provider';
import { EmptyState } from '@/ui/components/EmptyState';
import { formatDate } from '@/ui/dates';
import { useLoad } from '@/ui/useLoad';

export default function PeriodsScreen() {
  const repos = useRepos();
  const load = useCallback(() => repos.periods.list(), [repos]);
  const { data: periods, error } = useLoad(load);

  if (error) return <Text style={styles.error}>{error}</Text>;
  if (!periods) return <Text style={styles.muted}>Memuat...</Text>;

  return (
    <FlatList
      data={periods}
      keyExtractor={(p) => p.id}
      contentContainerStyle={styles.container}
      ListEmptyComponent={
        <EmptyState
          title="Belum ada periode"
          message="Buat periode pertama dari menu Buat Periode."
          actionLabel="Buat periode"
          onAction={() => router.push('/periods/new')}
        />
      }
      renderItem={({ item }) => (
        <Pressable
          style={styles.row}
          onPress={() => router.push({ pathname: '/periods/[id]', params: { id: item.id } })}
        >
          <View style={styles.head}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={item.status === 'active' ? styles.active : styles.closed}>
              {item.status === 'active' ? 'Aktif' : 'Selesai'}
            </Text>
          </View>
          <Text>
            {item.memberCount} anggota, mulai {formatDate(item.startDate)}
            {item.endDate ? `, berakhir ${formatDate(item.endDate)}` : ''}
          </Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8 },
  row: { padding: 12, borderRadius: 8, backgroundColor: '#f2f6f3', gap: 4 },
  head: { flexDirection: 'row', justifyContent: 'space-between' },
  name: { fontSize: 16, fontWeight: '600' },
  active: { color: '#1f6f50', fontWeight: '600' },
  closed: { color: '#666' },
  error: { padding: 16, color: '#b3261e' },
  muted: { padding: 16, color: '#666' },
});
