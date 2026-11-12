import { router } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { useRepos } from '@/db/provider';
import { EmptyState } from '@/ui/components/EmptyState';
import { ErrorState } from '@/ui/components/ErrorState';
import { ListRow, RowText } from '@/ui/components/ListRow';
import { Loading } from '@/ui/components/Loading';
import { formatDate } from '@/ui/dates';
import { spacing } from '@/ui/theme';
import { useLoad } from '@/ui/useLoad';

export default function PeriodsScreen() {
  const repos = useRepos();
  const load = useCallback(() => repos.periods.list(), [repos]);
  const { data: periods, error, reload } = useLoad(load);

  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  if (!periods) return <Loading />;

  return (
    <FlatList
      data={periods}
      keyExtractor={(p) => p.id}
      contentContainerStyle={styles.container}
      ListEmptyComponent={
        <EmptyState
          title="Belum ada periode"
          message="Buat periode pertama dengan tombol di bawah."
          actionLabel="Buat periode"
          onAction={() => router.push('/periods/new')}
        />
      }
      renderItem={({ item }) => (
        <ListRow
          title={item.name}
          onPress={() => router.push({ pathname: '/periods/[id]', params: { id: item.id } })}
          right={<RowText tone={item.status === 'active' ? 'ok' : 'muted'}>{item.status === 'active' ? 'Aktif' : 'Berakhir'}</RowText>}
        >
          <RowText>
            {item.memberCount} anggota, mulai {formatDate(item.startDate)}
            {item.endDate ? `, berakhir ${formatDate(item.endDate)}` : ''}
          </RowText>
        </ListRow>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.sm },
});
