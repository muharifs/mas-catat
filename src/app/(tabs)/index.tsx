import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { Section } from '@/ui/components/Section';
import { BALANCE_MASK, balanceToggleLabel, toggleBalanceHidden, useBalanceHidden } from '@/ui/balanceVisibilityStore';
import { firstRunChecklist } from '@/ui/checklist';
import { formatDate, todayIso } from '@/ui/dates';
import { toIndonesian } from '@/ui/errors';
import { resetHistoryFilter, setHistoryMonth } from '@/ui/historyFilterStore';
import { closeWeekMessage, overdueNotice, toasts } from '@/ui/messages';
import { paidTodayView } from '@/ui/paidToday';
import { quickActionReasons } from '@/ui/quickActions';
import { homeReminders, type Reminder } from '@/ui/reminders';
import { SEP } from '@/ui/separator';
import { readLastShared } from '@/ui/shareFile';
import { colors, fonts, ICON, MIN_TOUCH, radius, spacing, TABULAR, type } from '@/ui/theme';
import { toast } from '@/ui/toast';
import { useLoad } from '@/ui/useLoad';

const NO_PERIOD_REASON = 'Buat periode dulu.';

// Home, top to bottom: kas card (Total kas row: amount, the eye right after it and the "Pindah saldo" button at the
// right edge; Tunai, Debit, and ONE pill with this month's Pengeluaran that opens Riwayat for the month), first-run checklist (until set
// up), Pengingat (what to do now, from the pure homeReminders), the running meeting with its actions, the quick-action
// grid, who paid today, and the last three entries. All numbers come from the repositories; nothing is computed here.
// The eye hides every balance amount: Total kas, Tunai, Debit and the Pengeluaran pill. Pemasukan, Piutang and Titipan
// are no longer on this screen (Riwayat, Laporan, and the Pinjaman and Titipan screens show them). Every other screen
// is reachable from the grid or the Menu tab.
export default function HomeScreen() {
  const repos = useRepos();
  const balanceHidden = useBalanceHidden();

  const load = useCallback(async () => {
    const [members, period, periods, kasReport, kasEntries] = await Promise.all([
      repos.members.list(),
      repos.periods.getActive(),
      repos.periods.list(),
      // Same numbers as the Laporan tab: balances (Tunai, Debit).
      repos.reports.getKasReport(),
      repos.ledger.listKas(),
    ]);
    const balances = kasReport.balances;
    const names = new Map(members.map((m) => [m.id, m.name]));
    const hasOpeningBalance = kasEntries.some((e) => e.type === 'opening_balance' && !e.reversedById);
    const hasEndedPeriod = periods.some((p) => p.status === 'closed');
    // Nothing to remind about while the database holds no data at all.
    const backup = backupReminder(readLastShared(), new Date(), members.length > 0 || kasEntries.length > 0);
    const common = { members, balances, kasEntries, names, periods, hasEndedPeriod, hasOpeningBalance, backup };
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

  const { period, week, hostName, members, arrears, hostPaid, paidPayoutWeeks, paidTodayIds, balances, kasEntries, names, periods, hasEndedPeriod, hasOpeningBalance, weeks, backup } = data;
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
  // Pengeluaran pill: the same summarizeMonth as Riwayat, on the entries already loaded (all of them, so corrections cancel).
  const thisMonth = monthOfDate(today);
  const showMonth = periods.length > 0 && kasEntries.length > 0;
  const monthOut = showMonth ? summarizeMonth(kasEntries, thisMonth).moneyOut : null;
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
  // "Akhiri periode" lives on the period card (once per screen), so its reminder row is not shown here.
  const visibleReminders = reminders.filter((r) => r.kind !== 'close_period');
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
      <Card style={styles.kasCard}>
        <Text style={styles.cardLabel}>Total kas</Text>
        <View style={styles.totalRow}>
          {balanceHidden ? (
            <Text maxFontSizeMultiplier={1.3} numberOfLines={1} accessibilityLabel="Saldo disembunyikan" style={[styles.totalMask, styles.shrink]}>
              <Text style={styles.maskPrefix}>{BALANCE_MASK.slice(0, 2)}</Text>
              {BALANCE_MASK.slice(2)}
            </Text>
          ) : (
            <Money amount={balances.actual} size="hero" smallPrefix fit style={styles.shrink} />
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={balanceToggleLabel(balanceHidden)}
            onPress={toggleBalanceHidden}
            style={({ pressed }) => [styles.eye, pressed && styles.eyePressed]}
          >
            <Ionicons name={balanceHidden ? 'eye-off-outline' : 'eye-outline'} size={ICON.md} color={colors.textSecondary} />
          </Pressable>
          {/* Owner 2026-11-13: "Pindah saldo" sits right of the eye on the same row; the amount shrinks (fit) to make room. */}
          <View style={styles.totalAction}>
            <Button
              label="Pindah saldo"
              variant="secondary"
              compact
              disabled={!hasAnyPeriod}
              disabledReason={NO_PERIOD_REASON}
              onPress={() => router.push({ pathname: '/kas/new', params: { kind: 'transfer' } })}
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
        {monthOut !== null ? (
          <View style={styles.startAligned}>
            <PillLink
              label="Pengeluaran"
              spokenLabel="Pengeluaran bulan ini"
              amount={monthOut}
              hidden={balanceHidden}
              hint="Buka riwayat bulan ini"
              onPress={openMonthInRiwayat}
            />
          </View>
        ) : null}
      </Card>

      {checklist.visible ? (
        <Card tone="alt">
          <Text style={styles.heading}>Langkah awal</Text>
          {checklist.items.map((item, index) => (
            <Text
              key={item.key}
              accessible
              accessibilityLabel={`Langkah ${index + 1}: ${item.label}, ${item.done ? 'selesai' : 'belum'}`}
              style={[styles.checkItem, item.done && styles.checkDone]}
            >
              {item.done ? '✓' : '○'} {index + 1}. {item.label}
            </Text>
          ))}
        </Card>
      ) : null}

      {visibleReminders.length > 0 || (period && week) ? (
        <Section title={visibleReminders.length > 0 ? `Pengingat (${visibleReminders.length})` : 'Pengingat'}>
          <Card>
            {visibleReminders.length === 0 ? (
              <View style={styles.allClear}>
                <Ionicons name="checkmark-circle-outline" size={ICON.md} color={colors.moneyIn} />
                <Text style={styles.allClearText}>Semua beres. Tidak ada yang perlu dikerjakan sekarang.</Text>
              </View>
            ) : (
              visibleReminders.map((r, index) => (
                <View key={r.key}>
                  {index > 0 ? <View style={styles.reminderDivider} /> : null}
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
        </Section>
      ) : null}

      {period ? (
        <Card>
          <Text style={styles.cardLabel}>{period.name}</Text>
          {week ? (
            <>
              <Text style={styles.title}>
                Pertemuan {week.number}{SEP}{formatDate(week.date)}
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
                  <Button label="Pembayaran" variant="secondary" onPress={() => goPayments(period.id)} />
                </>
              ) : (
                <>
                  <Button label="Pembayaran" onPress={() => goPayments(period.id)} />
                  <ListRow
                    title={hostPaid ? 'Lihat pembayaran tuan rumah' : 'Bayar tuan rumah'}
                    tone="alt"
                    right={hostPaid ? <RowText tone="ok">Sudah dibayar</RowText> : undefined}
                    onPress={() => goPayout(period.id, week.number)}
                  />
                  <ListRow title={hostPaid ? 'Ubah tanggal' : 'Ubah tuan rumah / tanggal'} tone="alt" onPress={() => goMeeting(period.id, week.number)} />
                  {/* Set apart from the rows above (8 gap + 12 margin = 20dp); no chevron because it opens a dialog, not a screen. */}
                  <View style={styles.closeWeek}>
                    <ListRow title={`Tutup pertemuan ${week.number}`} tone="alt" destructive chevron={false} onPress={confirmCloseWeek} />
                  </View>
                </>
              )}
            </>
          ) : (
            <>
              <Text style={styles.title}>Semua pertemuan sudah ditutup</Text>
              <Button
                label="Akhiri periode"
                variant="dangerOutline"
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
          <QuickAction label="Pembayaran" icon="cash-outline" disabledReason={reasons.iuran} onPress={() => period && goPayments(period.id)} />
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
        <Section title={paidView.summary} actionLabel="Lihat" onAction={() => goPayments(period.id)}>
          <Card>
            <InitialsRow view={paidView} onPress={() => goPayments(period.id)} />
          </Card>
        </Section>
      ) : null}

      <Section title="Terakhir" actionLabel="Lihat semua riwayat" onAction={() => router.push('/riwayat')}>
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
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  cardLabel: { ...type.label, color: colors.textSecondary },
  kasCard: { gap: spacing.md },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  shrink: { flexShrink: 1 },
  // The button keeps its width and sits at the right edge; the amount gives way.
  totalAction: { flexShrink: 0, marginLeft: 'auto' },
  // A real 48x48 touch target (no hitSlop), so it never overlaps the amount.
  eye: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  eyePressed: { backgroundColor: colors.bgMute },
  totalMask: { ...type.hero, ...TABULAR, color: colors.text },
  maskPrefix: { fontSize: type.amountL.fontSize, fontFamily: fonts.bold },
  startAligned: { alignSelf: 'flex-start' },
  divider: { height: 1, backgroundColor: colors.divider },
  // Between reminders: md of air above and below the line so it does not touch the button or icon next to it.
  reminderDivider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.md },
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
  closeWeek: { marginTop: spacing.md },
  allClear: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  allClearText: { ...type.body, color: colors.text, flex: 1 },
});
