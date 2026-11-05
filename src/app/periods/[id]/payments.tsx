import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRepos } from '@/db/provider';
import { sortByName } from '@/domain/sort';
import { canSwipePay, SWIPE_PAYMENT_AMOUNT } from '@/domain/swipe-pay';
import { EmptyState } from '@/ui/components/EmptyState';
import { ErrorState } from '@/ui/components/ErrorState';
import { Loading } from '@/ui/components/Loading';
import { Money } from '@/ui/components/Money';
import { SwipeRow } from '@/ui/components/SwipeRow';
import { todayIso } from '@/ui/dates';
import { toIndonesian } from '@/ui/errors';
import { formatRupiah } from '@/ui/format';
import { swipePaymentToast } from '@/ui/messages';
import { colors, MIN_TOUCH, radius, spacing, type } from '@/ui/theme';
import { toast } from '@/ui/toast';
import { useLoad } from '@/ui/useLoad';

// Payment list of a period: every member (A-Z) with arrears (through the current week), prepaid and credit.
// Tap a row for the member detail and the full payment form. Swipe a row to the right to record ONE meeting of dues
// (Rp15.000, into Tunai, dated today) without a dialog; it is only offered while the member has arrears.
// All numbers come from the repository and the domain; this screen only displays them.
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
  const { data, error, reload } = useLoad(load);
  const sortedBalances = useMemo(() => {
    if (!data) return [];
    const names = new Map(data.members.map((m) => [m.id, m.name]));
    return sortByName(data.balances, (b) => names.get(b.memberId) ?? '');
  }, [data]);

  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  if (!data) return <Loading />;
  if (!data.period) return <ErrorState message="Periode tidak ditemukan." />;

  const { balances, members, period } = data;
  const nameOf = (memberId: string) => members.find((m) => m.id === memberId)?.name ?? '-';
  const throughWeek = balances[0]?.throughWeek;
  const periodActive = period.status === 'active';

  // Preview first (same domain function as record) so the toast can name exactly what was settled.
  async function swipePay(memberId: string) {
    const name = nameOf(memberId);
    const input = { periodId: period.id, memberId, date: todayIso(), amount: SWIPE_PAYMENT_AMOUNT };
    try {
      const preview = await repos.payments.preview(input);
      await repos.payments.record({ ...input, account: 'tunai' });
      toast(swipePaymentToast(name, preview));
    } catch (e) {
      Alert.alert('Pembayaran gagal', toIndonesian(e));
    }
    await reload();
  }

  return (
    <FlatList
      data={sortedBalances}
      keyExtractor={(b) => b.memberId}
      contentContainerStyle={styles.container}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>{period.name}</Text>
          {throughWeek ? <Text style={styles.muted}>Tunggakan dihitung sampai pertemuan {throughWeek}.</Text> : null}
          {periodActive ? (
            <Text style={styles.muted}>
              Geser baris ke kanan untuk mencatat {formatRupiah(SWIPE_PAYMENT_AMOUNT)} (Tunai, hari ini) bagi anggota yang menunggak. Ketuk baris untuk detail dan form lengkap.
            </Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={<EmptyState title="Belum ada anggota di periode ini" />}
      renderItem={({ item }) => {
        const inArrears = item.arrears > 0;
        const name = nameOf(item.memberId);
        return (
          <SwipeRow
            enabled={canSwipePay({ arrears: item.arrears, periodActive })}
            label={`Bayar ${formatRupiah(SWIPE_PAYMENT_AMOUNT)}`}
            onSwipe={() => swipePay(item.memberId)}
          >
            <View style={[styles.row, inArrears && styles.rowArrears]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${name}, ${inArrears ? `menunggak ${formatRupiah(item.arrears)}` : 'lancar'}. Buka detail`}
                style={({ pressed }) => [styles.main, pressed && styles.pressed]}
                onPress={() =>
                  router.push({ pathname: '/periods/[id]/members/[memberId]', params: { id: period.id, memberId: item.memberId } })
                }
              >
                <View style={styles.flex}>
                  <Text style={styles.name}>{name}</Text>
                  <Text style={inArrears ? styles.flag : styles.ok}>{inArrears ? 'Menunggak' : 'Lancar'}</Text>
                  {item.prepaid > 0 ? <Text style={styles.muted}>Bayar di muka: {formatRupiah(item.prepaid)}</Text> : null}
                  {item.credit > 0 ? <Text style={styles.muted}>Titipan: {formatRupiah(item.credit)}</Text> : null}
                </View>
                <Money amount={item.arrears} size="heading" tone={inArrears ? 'negative' : 'neutral'} style={styles.amount} />
              </Pressable>
            </View>
          </SwipeRow>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.sm },
  header: { gap: spacing.xs, marginBottom: spacing.xs },
  title: { ...type.title, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, paddingLeft: spacing.md, borderRadius: radius.row, backgroundColor: colors.surface },
  rowArrears: { backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.danger },
  main: { flex: 1, minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pressed: { opacity: 0.75 },
  flex: { flex: 1 },
  name: { ...type.body, fontWeight: '600', color: colors.text },
  amount: { textAlign: 'right' },
  flag: { ...type.label, color: colors.danger },
  ok: { ...type.label, color: colors.primary },
  muted: { ...type.caption, color: colors.textMuted },
});
