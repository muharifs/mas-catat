import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { backupReminder } from '@/domain/backup';
import { useRepos } from '@/db/provider';
import { monthOfDate, summarizeMonth } from '@/domain/flow';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { EmptyState } from '@/ui/components/EmptyState';
import { ErrorState } from '@/ui/components/ErrorState';
import { HistoryRow } from '@/ui/components/HistoryRow';
import { InitialsRow } from '@/ui/components/InitialsRow';
import { ListRow, RowText } from '@/ui/components/ListRow';
import { Loading } from '@/ui/components/Loading';
import { Money } from '@/ui/components/Money';
import { Notice } from '@/ui/components/Notice';
import { PillLink } from '@/ui/components/PillLink';
import { QuickAction } from '@/ui/components/QuickAction';
import { ReminderRow } from '@/ui/components/ReminderRow';
import { SectionHeader } from '@/ui/components/SectionHeader';
import { BALANCE_MASK, balanceToggleLabel, toggleBalanceHidden, useBalanceHidden } from '@/ui/balanceVisibilityStore';
import { firstRunChecklist } from '@/ui/checklist';
import { formatDate, todayIso } from '@/ui/dates';
import { toIndonesian } from '@/ui/errors';
import { resetHistoryFilter, setHistoryMonth } from '@/ui/historyFilterStore';
import { closeWeekMessage, overdueNotice, toasts } from '@/ui/messages';
import { monthSummaryLabel, monthSummaryTitle } from '@/ui/monthSummary';
import { paidTodayView } from '@/ui/paidToday';
import { quickActionReasons } from '@/ui/quickActions';
import { homeReminders, type Reminder } from '@/ui/reminders';
import { readLastShared } from '@/ui/shareFile';
import { colors, fonts, ICON, MIN_TOUCH, radius, spacing, TABULAR, type } from '@/ui/theme';
import { toast } from '@/ui/toast';
import { useLoad } from '@/ui/useLoad';

const NO_PERIOD_REASON = 'Buat periode dulu.';

// Home, top to bottom: kas header (total, Tunai, Debit, Piutang and Titipan pills, "Bulan ini" summary, two side actions), first-run checklist
// (until set up), Pengingat (what to do now, from the pure homeReminders), the running meeting with ONE primary action,
// the quick-action grid, who paid today, and the last three entries. All numbers come from the repositories; nothing is
// computed here. The eye hides every balance amount: Total kas, Tunai, Debit, the Piutang/Titipan pills and the Bulan ini amounts. Every other screen is reachable from the grid or the Menu tab.
export default function HomeScreen() {
  const repos = useRepos();
  const balanceHidden = useBalanceHidden();
  const { fontScale } = useWindowDimensions();

  const load = useCallback(async () => {
    const [members, period, periods, kasReport, kasEntries] = await Promise.all([
      repos.members.list(),
      repos.periods.getActive(),
      repos.periods.list(),
      // Same numbers as the Laporan tab: balances (Tunai, Debit, Piutang) and the Titipan line (credit held).
      repos.reports.getKasReport(),
      repos.ledger.listKas(),
    ]);
    const balances = kasReport.balances;
    const creditHeld = kasReport.expected.creditHeld;
    const names = new Map(members.map((m) => [m.id, m.name]));
    const hasOpeningBalance = kasEntries.some((e) => e.type === 'opening_balance' && !e.reversedById);
    const hasEndedPeriod = periods.some((p) => p.status === 'closed');
    // Nothing to remind about while the database holds no data at all.
    const backup = backupReminder(readLastShared(), new Date(), members.length > 0 || kasEntries.length > 0);
    const common = { members, balances, creditHeld, kasEntries, names, periods, hasEndedPeriod, hasOpeningBalance, backup };
    if (!period) {
      return { ...common, period: null, week: null, hostName: null, arrears: null, hostPaid: false, paidPayoutWeeks: new Set<number>(), paidTodayIds: [] as string[], weeks: [] };
    }
    const weeks = await repos.weeks.listByPeriod(period.id);
    const week = weeks.find((w) => w.status === 'open') ?? null;
    const hostName = week
      ? week.hostMemberId === null
        ? 'Belum ditentukan'
        : (names.get(week.hostMemberId) ?? '-')
      : null;
    // One payout lookup per meeting that has a host (open or closed): Pengingat needs to know which are unpaid.
    const [arrears, payouts, paidTodayIds] = await Promise.all([
      repos.payments.getArrearsSummary(period.id),
      Promise.all(
        weeks.filter((w) => w.hostMemberId !== null).map(async (w) => [w.number, await repos.ledger.getWeekPayout(period.id, w.number)] as const),
      ),
      week ? repos.payments.listMemberIdsPaidOn(period.id, todayIso()) : Promise.resolve([] as string[]),
    ]);
    const paidPayoutWeeks = new Set(payouts.filter(([, payout]) => payout !== null).map(([number]) => number));
    const hostPaid = week ? paidPayoutWeeks.has(week.number) : false;
    return { ...common, period, week, hostName, arrears, hostPaid, paidPayoutWeeks, paidTodayIds, weeks };
  }, [repos]);

  const { data, error, reload } = useLoad(load);
  const [actionError, setActionError] = useState<string | null>(null);

  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  if (!data) return <Loading />;

  const { period, week, hostName, members, arrears, hostPaid, paidPayoutWeeks, paidTodayIds, balances, creditHeld, kasEntries, names, periods, hasEndedPeriod, hasOpeningBalance, weeks, backup } = data;
  const memberCount = members.filter((m) => !m.archivedAt).length; // archived members do not count as "has members"
  const checklist = firstRunChecklist({
    memberCount,
    hasOpeningBalance,
    periodCount: periods.length,
    hasEndedPeriod,
    activePeriod: period
      ? {
          hasClosedMeeting: weeks.some((w) => w.status === 'closed'),
          firstMeetingHasHost: weeks.find((w) => w.number === 1)?.hostMemberId != null,
        }
      : null,
  });
  const today = todayIso();
  // "Bulan ini": the same summarizeMonth as Riwayat, on the entries already loaded (all of them, so corrections cancel).
  const thisMonth = monthOfDate(today);
  const showMonth = periods.length > 0 && kasEntries.length > 0;
  const monthSummary = showMonth ? summarizeMonth(kasEntries, thisMonth) : null;
  const stackMonth = fontScale >= 1.4;
  const hasAnyPeriod = periods.length > 0;
  const lastEntries = kasEntries.slice(0, 3);
  const entriesById = new Map(kasEntries.map((e) => [e.id, e]));
  const reminders = homeReminders({
    today,
    hasActivePeriod: period !== null,
    weeks,
    paidPayoutWeeks,
    currentHostName: week?.hostMemberId != null ? (names.get(week.hostMemberId) ?? null) : null,
    membersInArrears: arrears?.membersInArrears ?? 0,
    backup,
  });
  const reasons = quickActionReasons({ hasActivePeriod: period !== null, hasAnyPeriod, currentWeek: week });
  const paidView = paidTodayView(
    paidTodayIds.map((id) => ({ id, name: names.get(id) ?? '-' })),
    period?.memberCount ?? 0,
  );
  const overdue = week ? overdueNotice(week.number, week.date, today) : null;

  function confirmCloseWeek() {
    if (!period || !week) return;
    const periodId = period.id;
    const number = week.number;
    Alert.alert(`Tutup pertemuan ${number}`, closeWeekMessage(number, week.date, arrears), [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Tutup pertemuan',
        style: 'destructive',
        onPress: async () => {
          try {
            await repos.weeks.closeOldest(periodId);
            setActionError(null);
            toast(toasts.weekClosed(number));
            await reload();
          } catch (e) {
            setActionError(toIndonesian(e, 'close_week'));
          }
        },
      },
    ]);
  }

  function openMonthInRiwayat() {
    // Riwayat is a tab that stays mounted, so its old chip/filter would survive: clear them so the list matches the summary.
    resetHistoryFilter();
    setHistoryMonth(thisMonth);
    router.push('/riwayat');
  }

  const goPayments = (id: string) => router.push({ pathname: '/periods/[id]/payments', params: { id } });
  const goMeeting = (id: string, number: number) =>
    router.push({ pathname: '/periods/[id]/meetings/[number]', params: { id, number: String(number) } });
  const goPayout = (id: string, number: number) =>
    router.push({ pathname: '/periods/[id]/payout', params: { id, week: String(number) } });

  // The button of a Pengingat row opens the same screen or dialog as the matching button elsewhere on this screen.
  function runReminder(r: Reminder) {
    if (r.kind === 'backup') {
      router.push('/backup');
      return;
    }
    if (!period) return;
    switch (r.kind) {
      case 'pay_host':
        goPayout(period.id, r.week as number);
        break;
      case 'choose_host':
        goMeeting(period.id, r.week as number);
        break;
      case 'close_week':
        confirmCloseWeek();
        break;
      case 'close_period':
        router.push({ pathname: '/periods/[id]/close', params: { id: period.id } });
        break;
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card>
        <View style={styles.headerRow}>
          <View style={styles.total}>
            <View style={styles.totalLabelRow}>
              <Text style={styles.cardLabel}>Total kas</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={balanceToggleLabel(balanceHidden)}
                hitSlop={spacing.sm}
                onPress={toggleBalanceHidden}
                style={({ pressed }) => [styles.eye, pressed && styles.eyePressed]}
              >
                <Ionicons name={balanceHidden ? 'eye-off-outline' : 'eye-outline'} size={ICON.md} color={colors.textSecondary} />
              </Pressable>
            </View>
            {balanceHidden ? (
              <Text maxFontSizeMultiplier={1.3} numberOfLines={1} accessibilityLabel="Saldo disembunyikan" style={styles.totalMask}>
                {BALANCE_MASK}
              </Text>
            ) : (
              <Money amount={balances.actual} size="hero" fit />
            )}
          </View>
          <View style={styles.sideActions}>
            <Button
              label="Pindah saldo"
              variant="secondary"
              compact
              disabled={!hasAnyPeriod}
              disabledReason={NO_PERIOD_REASON}
              onPress={() => router.push({ pathname: '/kas/new', params: { kind: 'transfer' } })}
            />
            <Button
              label="Catat kas"
              variant="secondary"
              compact
              disabled={!hasAnyPeriod}
              disabledReason={NO_PERIOD_REASON}
              onPress={() => router.push('/kas')}
            />
          </View>
        </View>
        <View style={styles.posRow}>
          <View style={styles.pos}>
            <Text style={styles.cardLabel}>Tunai</Text>
            {balanceHidden ? (
              <Text maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={styles.monthMask}>
                {BALANCE_MASK}
              </Text>
            ) : (
              <Money amount={balances.tunai} size="large" fit />
            )}
          </View>
          <View style={styles.pos}>
            <Text style={styles.cardLabel}>Debit</Text>
            {balanceHidden ? (
              <Text maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={styles.monthMask}>
                {BALANCE_MASK}
              </Text>
            ) : (
              <Money amount={balances.debit} size="large" fit />
            )}
          </View>
        </View>
        <View style={styles.pills}>
          <PillLink
            label="Piutang (dipinjam anggota)"
            amount={balances.piutang}
            hidden={balanceHidden}
            hint="Buka daftar pinjaman"
            onPress={() => router.push('/loans')}
          />
          <PillLink
            label="Titipan"
            amount={creditHeld}
            hidden={balanceHidden}
            hint="Buka daftar titipan anggota"
            onPress={() => router.push('/credits')}
          />
        </View>
        {monthSummary ? (
          <>
            <View style={styles.divider} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={monthSummaryLabel(thisMonth, monthSummary.moneyIn, monthSummary.moneyOut, balanceHidden)}
              accessibilityHint="Buka riwayat bulan ini"
              onPress={openMonthInRiwayat}
              style={({ pressed }) => [styles.monthBlock, pressed && styles.monthPressed]}
            >
              <View style={styles.monthTitleRow}>
                <Text maxFontSizeMultiplier={1.3} style={styles.monthTitle}>
                  {monthSummaryTitle(thisMonth)}
                </Text>
                <Ionicons name="chevron-forward" size={ICON.sm} color={colors.textSecondary} />
              </View>
              <View style={stackMonth ? styles.monthColsStacked : styles.monthCols}>
                <View style={styles.monthCol}>
                  <Text maxFontSizeMultiplier={1.3} style={styles.cardLabel}>
                    Pemasukan
                  </Text>
                  {balanceHidden ? (
                    <Text maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={styles.monthMask}>
                      {BALANCE_MASK}
                    </Text>
                  ) : (
                    <Money amount={monthSummary.moneyIn} size="large" sign={monthSummary.moneyIn > 0 ? '+' : ''} fit />
                  )}
                </View>
                <View style={styles.monthCol}>
                  <Text maxFontSizeMultiplier={1.3} style={styles.cardLabel}>
                    Pengeluaran
                  </Text>
                  {balanceHidden ? (
                    <Text maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={styles.monthMask}>
                      {BALANCE_MASK}
                    </Text>
                  ) : (
                    <Money amount={monthSummary.moneyOut} size="large" sign={monthSummary.moneyOut > 0 ? '-' : ''} fit />
                  )}
                </View>
              </View>
            </Pressable>
          </>
        ) : null}
      </Card>

      {checklist.visible ? (
        <Card tone="alt">
          <Text style={styles.heading}>Langkah awal</Text>
          {checklist.items.map((item, index) => (
            <Text key={item.key} style={[styles.checkItem, item.done && styles.checkDone]}>
              {item.done ? '✓' : '○'} {index + 1}. {item.label}
            </Text>
          ))}
        </Card>
      ) : null}

      {reminders.length > 0 || period ? (
        <>
          <SectionHeader title={reminders.length > 0 ? `Pengingat (${reminders.length})` : 'Pengingat'} />
          <Card>
            {reminders.length === 0 ? (
              <View style={styles.allClear}>
                <Ionicons name="checkmark-circle-outline" size={ICON.md} color={colors.moneyIn} />
                <Text style={styles.allClearText}>Semua beres. Tidak ada yang perlu dikerjakan sekarang.</Text>
              </View>
            ) : (
              reminders.map((r, index) => (
                <View key={r.key}>
                  {index > 0 ? <View style={styles.divider} /> : null}
                  <ReminderRow
                    kind={r.kind}
                    title={r.title}
                    detail={r.detail}
                    actionLabel={r.actionLabel}
                    urgent={r.urgent}
                    onAction={() => runReminder(r)}
                  />
                </View>
              ))
            )}
          </Card>
          {actionError ? <Notice tone="danger">{actionError}</Notice> : null}
        </>
      ) : null}

      {period ? (
        <Card>
          <Text style={styles.cardLabel}>{period.name}</Text>
          {week ? (
            <>
              <Text style={styles.title}>
                Pertemuan {week.number} - {formatDate(week.date)}
              </Text>
              <Text style={styles.body}>Tuan rumah: {hostName}</Text>
              {arrears ? (
                <View style={styles.arrearsRow}>
                  <Text style={[styles.body, styles.flex, arrears.membersInArrears === 0 && styles.ok]}>
                    {arrears.membersInArrears > 0
                      ? `${arrears.membersInArrears} anggota menunggak sampai pertemuan ${arrears.throughWeek}`
                      : `Tidak ada tunggakan sampai pertemuan ${arrears.throughWeek}`}
                  </Text>
                  {arrears.membersInArrears > 0 ? <Money amount={arrears.totalArrears} size="heading" tone="negative" /> : null}
                </View>
              ) : null}
              {overdue ? <Notice tone="warn">{overdue}</Notice> : null}

              {week.hostMemberId === null ? (
                <>
                  <Button label={`Tentukan tuan rumah pertemuan ${week.number}`} onPress={() => goMeeting(period.id, week.number)} />
                  <Button label="Catat pembayaran" variant="secondary" onPress={() => goPayments(period.id)} />
                </>
              ) : (
                <>
                  <Button label="Catat pembayaran" onPress={() => goPayments(period.id)} />
                  <ListRow
                    title={hostPaid ? 'Lihat pembayaran tuan rumah' : 'Bayar tuan rumah'}
                    tone="alt"
                    right={hostPaid ? <RowText tone="ok">Sudah dibayar</RowText> : undefined}
                    onPress={() => goPayout(period.id, week.number)}
                  />
                  <ListRow title={hostPaid ? 'Ubah tanggal' : 'Ubah tuan rumah / tanggal'} tone="alt" onPress={() => goMeeting(period.id, week.number)} />
                  <ListRow title={`Tutup pertemuan ${week.number}`} tone="alt" destructive onPress={confirmCloseWeek} />
                </>
              )}
            </>
          ) : (
            <>
              <Text style={styles.title}>Semua pertemuan sudah ditutup</Text>
              <Button
                label="Akhiri periode"
                onPress={() => router.push({ pathname: '/periods/[id]/close', params: { id: period.id } })}
              />
            </>
          )}
        </Card>
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

      <Card>
        <View style={styles.gridRow}>
          <QuickAction label="Iuran" icon="cash-outline" disabledReason={reasons.iuran} onPress={() => period && goPayments(period.id)} />
          <QuickAction
            label="Bayar tuan rumah"
            icon="home-outline"
            disabledReason={reasons.tuanRumah}
            onPress={() => period && week && goPayout(period.id, week.number)}
          />
          <QuickAction label="Catat kas" icon="create-outline" disabledReason={reasons.catatKas} onPress={() => router.push('/kas')} />
          <QuickAction label="Anggota" icon="people-outline" onPress={() => router.push('/members')} />
        </View>
        <View style={styles.gridRow}>
          <QuickAction label="Pinjaman" icon="arrow-redo-outline" onPress={() => router.push('/loans')} />
          <QuickAction label="Titipan" icon="wallet-outline" onPress={() => router.push('/credits')} />
          <QuickAction
            label="Jadwal"
            icon="calendar-number-outline"
            disabledReason={reasons.jadwal}
            onPress={() => period && router.push({ pathname: '/periods/[id]', params: { id: period.id } })}
          />
          <QuickAction label="Lihat semua" icon="grid-outline" onPress={() => router.push('/menu')} />
        </View>
      </Card>

      {period && week ? (
        <>
          <SectionHeader title={paidView.summary} actionLabel="Lihat" onAction={() => goPayments(period.id)} />
          <Card>
            <InitialsRow view={paidView} onPress={() => goPayments(period.id)} />
          </Card>
        </>
      ) : null}

      <SectionHeader title="Terakhir" actionLabel="Lihat semua riwayat" onAction={() => router.push('/riwayat')} />
      <Card>
        {lastEntries.length === 0 ? (
          <Text style={styles.body}>Belum ada catatan.</Text>
        ) : (
          lastEntries.map((entry, index) => (
            <View key={entry.id}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <HistoryRow flat entry={entry} byId={entriesById} memberName={entry.memberId ? (names.get(entry.memberId) ?? '') : ''} />
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  cardLabel: { ...type.label, color: colors.textSecondary },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  total: { flex: 1, gap: spacing.xs },
  totalLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  // 24dp icon + 4dp padding on each side = 32dp, plus hitSlop 8 on each side = 48dp touch target.
  eye: { padding: spacing.xs, borderRadius: radius.pill },
  eyePressed: { backgroundColor: colors.bgMute },
  totalMask: { ...type.hero, ...TABULAR, color: colors.text },
  sideActions: { width: 128, gap: spacing.sm },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  divider: { height: 1, backgroundColor: colors.divider },
  monthBlock: { minHeight: MIN_TOUCH, gap: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.md },
  monthPressed: { backgroundColor: colors.bgMute },
  monthTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  monthTitle: { ...type.label, color: colors.text, flexShrink: 1 },
  monthCols: { flexDirection: 'row', gap: spacing.lg },
  monthColsStacked: { gap: spacing.sm },
  monthCol: { flex: 1, gap: spacing.xs },
  monthMask: { ...type.amountL, ...TABULAR, color: colors.text },
  posRow: { flexDirection: 'row', gap: spacing.lg },
  pos: { flex: 1, gap: spacing.xs },
  heading: { ...type.titleM, color: colors.text },
  title: { ...type.titleL, color: colors.text },
  body: { ...type.body, color: colors.text },
  ok: { color: colors.moneyIn, fontFamily: fonts.bold },
  flex: { flex: 1 },
  arrearsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkItem: { ...type.body, color: colors.text },
  checkDone: { color: colors.textSecondary, textDecorationLine: 'line-through' },
  gridRow: { flexDirection: 'row', gap: spacing.xs },
  allClear: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  allClearText: { ...type.body, color: colors.text, flex: 1 },
});
