import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRepos } from '@/db/provider';
import { EmptyState } from '@/ui/components/EmptyState';
import { formatRupiah } from '@/ui/format';
import { useLoad } from '@/ui/useLoad';

// Payment list of a period: every member with arrears (through the current week), prepaid and credit.
// All numbers come from the repository; this screen only displays them.
export default function PeriodPaymentsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const repos = useRepos();

  const load = useCallback(async () => {
    const [period, balances, members] = await Promise.all([
      repos.periods.getById(id),
      repos.payments.listBalances(id),
      repos.members.list(),
    ]);
    return { period, balances, members };
  }, [repos, id]);
  const { data, error } = useLoad(load);

  if (error) return <Text style={styles.error}>{error}</Text>;
  if (!data) return <Text style={styles.muted}>Memuat...</Text>;
  if (!data.period) return <Text style={styles.error}>Periode tidak ditemukan.</Text>;

  const { balances, members } = data;
  const nameOf = (memberId: string) => members.find((m) => m.id === memberId)?.name ?? '-';
  const throughWeek = balances[0]?.throughWeek;

  return (
    <FlatList
      data={balances}
      keyExtractor={(b) => b.memberId}
      contentContainerStyle={styles.container}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>{data.period.name}</Text>
          {throughWeek ? <Text style={styles.muted}>Tunggakan dihitung sampai pertemuan {throughWeek}.</Text> : null}
        </View>
      }
      ListEmptyComponent={<EmptyState title="Belum ada anggota di periode ini" />}
      renderItem={({ item }) => (
        <Pressable
          style={[styles.row, item.arrears > 0 && styles.rowArrears]}
          onPress={() =>
            router.push({
              pathname: '/periods/[id]/members/[memberId]',
              params: { id: data.period?.id ?? id, memberId: item.memberId },
            })
          }
        >
          <View style={styles.head}>
            <Text style={styles.name}>{nameOf(item.memberId)}</Text>
            {item.arrears > 0 ? <Text style={styles.flag}>Menunggak</Text> : <Text style={styles.ok}>Lancar</Text>}
          </View>
          <Text>Tunggakan: {formatRupiah(item.arrears)}</Text>
          {item.prepaid > 0 ? <Text>Bayar di muka: {formatRupiah(item.prepaid)}</Text> : null}
          {item.credit > 0 ? <Text>Kredit: {formatRupiah(item.credit)}</Text> : null}
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8 },
  header: { gap: 4, marginBottom: 4 },
  title: { fontSize: 20, fontWeight: '700' },
  row: { padding: 12, borderRadius: 8, backgroundColor: '#f2f6f3', gap: 2 },
  rowArrears: { backgroundColor: '#fdecea', borderWidth: 1, borderColor: '#b3261e' },
  head: { flexDirection: 'row', justifyContent: 'space-between' },
  name: { fontSize: 16, fontWeight: '600' },
  flag: { color: '#b3261e', fontWeight: '700' },
  ok: { color: '#1f6f50', fontWeight: '600' },
  error: { padding: 16, color: '#b3261e' },
  muted: { color: '#666' },
});
