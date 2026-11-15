import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { showMessage } from '@/ui/dialog';
import { useRepos } from '@/db/provider';
import { sortByName } from '@/domain/sort';
import { canSwipePay, SWIPE_PAYMENT_AMOUNT } from '@/domain/swipe-pay';
import { EmptyState } from '@/ui/components/EmptyState';
import { ErrorState } from '@/ui/components/ErrorState';
import { Loading } from '@/ui/components/Loading';
import { Money } from '@/ui/components/Money';
import { SearchField } from '@/ui/components/SearchField';
import { SwipeRow } from '@/ui/components/SwipeRow';
import { todayIso } from '@/ui/dates';
import { toIndonesian } from '@/ui/errors';
import { formatRupiah } from '@/ui/format';
import { filterByQuery, shouldShowMemberSearch } from '@/ui/memberSearch';
import { swipePaymentToast } from '@/ui/messages';
import { skippedPaymentsLine } from '@/ui/skipMeeting';
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
  // Local search word only (declared before the early returns to keep the hook order). Survives opening a member and coming back.
  const [query, setQuery] = useState('');

  // Members with a valid payment dated today, as last read from the database. A ref (not state) on purpose: the swipe
  // handler must see it synchronously. It is replaced on every load and extended right after a swipe is saved, so the
  // lock never waits for the list to re-render (the row's own enabled flag lags one render behind a reload).
  const paidTodayRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    const [period, balances, members, paidIds, weeks] = await Promise.all([
      repos.periods.getById(id),
      repos.payments.listBalances(id),
      repos.members.list(),
      repos.payments.listMemberIdsPaidOn(id, todayIso()),
      repos.weeks.listByPeriod(id),
    ]);
    const paidToday = new Set(paidIds);
    paidTodayRef.current = paidToday;
    return { period, balances, members, paidToday, skippedNumbers: weeks.filter((w) => w.status === 'skipped').map((w) => w.number) };
  }, [repos, id]);
  const { data, error, reload } = useLoad(load);
  const sortedBalances = useMemo(() => {
    if (!data) return [];
    const names = new Map(data.members.map((m) => [m.id, m.name]));
    return sortByName(data.balances, (b) => names.get(b.memberId) ?? '');
  }, [data]);

  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  if (!data) return <Loading />;
  if (!data.period) return <ErrorState title="Data tidak ditemukan" message="Periode tidak ditemukan. Kembali lalu pilih lagi." />;

  const { balances, members, period, paidToday, skippedNumbers } = data;
  const paidTodayCount = balances.filter((b) => paidToday.has(b.memberId)).length;
  const nameOf = (memberId: string) => members.find((m) => m.id === memberId)?.name ?? '-';
  const throughWeek = balances[0]?.throughWeek;
  const periodActive = period.status === 'active';
  const searchShown = shouldShowMemberSearch(balances.length);
  const found = filterByQuery(sortedBalances, (b) => nameOf(b.memberId), searchShown ? query : '');

  // Preview first (same domain function as record) so the toast can name exactly what was settled.
  async function swipePay(memberId: string) {
    if (paidTodayRef.current.has(memberId)) return; // already paid today (or a swipe is being saved): use the form
    paidTodayRef.current.add(memberId); // lock first, before any await
    const name = nameOf(memberId);
    const input = { periodId: period.id, memberId, date: todayIso(), amount: SWIPE_PAYMENT_AMOUNT };
    try {
      const preview = await repos.payments.preview(input);
      await repos.payments.record({ ...input, account: 'tunai' });
      toast(swipePaymentToast(name, preview));
    } catch (e) {
      paidTodayRef.current.delete(memberId); // nothing was saved: release the lock
      showMessage('Pembayaran gagal', toIndonesian(e));
    }
    await reload();
  }

  return (
    <View style={styles.flex}>
      {searchShown ? (
        <View style={styles.searchWrap}>
          <SearchField value={query} onChangeText={setQuery} matchCount={found.matchCount} totalCount={balances.length} />
        </View>
      ) : null}
      <FlatList
        data={found.items}
        keyExtractor={(b) => b.memberId}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>{period.name}</Text>
            {throughWeek ? <Text style={styles.muted}>Tunggakan dihitung sampai pertemuan {throughWeek}.</Text> : null}
            {throughWeek && skippedPaymentsLine(throughWeek, skippedNumbers) ? (
              <Text style={styles.muted}>{skippedPaymentsLine(throughWeek, skippedNumbers)}</Text>
            ) : null}
            {periodActive ? (
              <>
                <Text style={styles.summary}>
                  Sudah bayar hari ini: {paidTodayCount} dari {balances.length}
                </Text>
                <Text style={styles.muted}>
                  Geser baris ke kanan untuk mencatat {formatRupiah(SWIPE_PAYMENT_AMOUNT)} (Tunai, hari ini) bagi anggota yang menunggak dan belum bayar hari ini. Pembayaran kedua di hari yang sama dicatat lewat halaman anggota: ketuk baris, lalu Catat pembayaran.
                </Text>
              </>
            ) : null}
          </View>
        }
        ListEmptyComponent={balances.length === 0 ? <EmptyState title="Belum ada anggota di periode ini" /> : undefined}
        renderItem={({ item }) => {
          const inArrears = item.arrears > 0;
          const name = nameOf(item.memberId);
          const paidNow = paidToday.has(item.memberId);
          return (
            <SwipeRow
              enabled={canSwipePay({ arrears: item.arrears, periodActive, paidToday: paidNow })}
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
                    {paidNow ? <Text style={styles.paidToday}>Sudah bayar hari ini</Text> : null}
                    {item.prepaid > 0 ? <Text style={styles.muted}>Dibayar di muka: {formatRupiah(item.prepaid)}</Text> : null}
                    {item.credit > 0 ? <Text style={styles.muted}>Titipan: {formatRupiah(item.credit)}</Text> : null}
                  </View>
                  <Money amount={item.arrears} size="heading" tone={inArrears ? 'negative' : 'neutral'} style={styles.amount} />
                </Pressable>
              </View>
            </SwipeRow>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  searchWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm, backgroundColor: colors.bgPage },
  container: { padding: spacing.lg, gap: spacing.sm },
  header: { gap: spacing.xs, marginBottom: spacing.xs },
  title: { ...type.titleL, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, paddingLeft: spacing.md, borderRadius: radius.md, backgroundColor: colors.bgCard },
  rowArrears: { backgroundColor: colors.errorTint, borderWidth: 1, borderColor: colors.error },
  main: { flex: 1, minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pressed: { opacity: 0.75 },
  name: { ...type.bodyStrong, color: colors.text },
  amount: { textAlign: 'right' },
  flag: { ...type.label, color: colors.error },
  ok: { ...type.label, color: colors.moneyIn },
  paidToday: { ...type.label, color: colors.moneyIn },
  summary: { ...type.titleM, color: colors.text },
  muted: { ...type.secondary, color: colors.textSecondary },
});
