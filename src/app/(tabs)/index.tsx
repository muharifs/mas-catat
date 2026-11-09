import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { backupReminder } from '@/domain/backup';
import { useRepos } from '@/db/provider';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { EmptyState } from '@/ui/components/EmptyState';
import { ErrorState } from '@/ui/components/ErrorState';
import { ListRow, RowText } from '@/ui/components/ListRow';
import { Loading } from '@/ui/components/Loading';
import { Money } from '@/ui/components/Money';
import { HistoryRow } from '@/ui/components/HistoryRow';
import { Notice } from '@/ui/components/Notice';
import { PillLink } from '@/ui/components/PillLink';
import { SectionHeader } from '@/ui/components/SectionHeader';
import { reminderText } from '@/ui/backupLabels';
import { firstRunChecklist } from '@/ui/checklist';
import { formatDate, todayIso } from '@/ui/dates';
import { toIndonesian } from '@/ui/errors';
import { readLastShared } from '@/ui/shareFile';
import { closeWeekMessage, overdueNotice, toasts } from '@/ui/messages';
import { colors, spacing, type } from '@/ui/theme';
import { toast } from '@/ui/toast';
import { useLoad } from '@/ui/useLoad';

// Home, top to bottom: kas header (total, Tunai, Debit, Piutang and Titipan pills, two side actions), backup reminder,
// first-run checklist (until set up), the running meeting with ONE primary action, the last three entries, and links. All numbers come from the repositories; nothing is computed here.
export default function HomeScreen() {
  const repos = useRepos();

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
    const reminder = backupReminder(readLastShared(), new Date(), members.length > 0 || kasEntries.length > 0);
    if (!period) {
      return { members, period: null, week: null, hostName: null, arrears: null, hostPaid: false, balances, creditHeld, kasEntries, names, periods, hasEndedPeriod, hasOpeningBalance, weeks: [], reminder };
    }
    const weeks = await repos.weeks.listByPeriod(period.id);
    const week = weeks.find((w) => w.status === 'open') ?? null;
    const hostName = week
      ? week.hostMemberId === null
        ? 'Belum ditentukan'
        : (members.find((m) => m.id === week.hostMemberId)?.name ?? '-')
      : null;
    const [arrears, paid] = await Promise.all([
      repos.payments.getArrearsSummary(period.id),
      week ? repos.ledger.getWeekPayout(period.id, week.number) : Promise.resolve(null),
    ]);
    return { members, period, week, hostName, arrears, hostPaid: Boolean(paid), balances, creditHeld, kasEntries, names, periods, hasEndedPeriod, hasOpeningBalance, weeks, reminder };
  }, [repos]);

  const { data, error, reload } = useLoad(load);
  const [actionError, setActionError] = useState<string | null>(null);

  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  if (!data) return <Loading />;

  const { period, week, hostName, members, arrears, hostPaid, balances, creditHeld, kasEntries, names, periods, hasEndedPeriod, hasOpeningBalance, weeks, reminder } = data;
  const memberCount = members.length;
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
  const hasAnyPeriod = periods.length > 0;
  const lastEntries = kasEntries.slice(0, 3);
  const entriesById = new Map(kasEntries.map((e) => [e.id, e]));
  const overdue = week ? overdueNotice(week.date, todayIso()) : null;

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
            setActionError(toIndonesian(e));
          }
        },
      },
    ]);
  }

  const goPayments = (id: string) => router.push({ pathname: '/periods/[id]/payments', params: { id } });
  const goMeeting = (id: string, number: number) =>
    router.push({ pathname: '/periods/[id]/meetings/[number]', params: { id, number: String(number) } });

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card>
        <View style={styles.headerRow}>
          <View style={styles.total}>
            <Text style={styles.cardLabel}>Total kas</Text>
            <Money amount={balances.actual} size="hero" fit />
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
            <Money amount={balances.tunai} size="large" />
          </View>
          <View style={styles.pos}>
            <Text style={styles.cardLabel}>Debit</Text>
            <Money amount={balances.debit} size="large" />
          </View>
        </View>
        <View style={styles.pills}>
          <PillLink label="Piutang" amount={balances.piutang} hint="Buka daftar pinjaman" onPress={() => router.push('/loans')} />
          <PillLink label="Titipan" amount={creditHeld} hint="Buka daftar titipan anggota" onPress={() => router.push('/credits')} />
        </View>
      </Card>

      {reminder.due ? (
        <Card tone="alt">
          <Notice tone="warn">{reminderText(reminder)}</Notice>
          <Button label="Buka Cadangan dan ekspor" variant="secondary" onPress={() => router.push('/backup')} />
        </Card>
      ) : null}

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
                    title={hostPaid ? 'Tuan rumah sudah dibayar' : 'Bayar tuan rumah'}
                    tone="alt"
                    onPress={() => router.push({ pathname: '/periods/[id]/payout', params: { id: period.id, week: String(week.number) } })}
                  />
                  <ListRow title="Ubah tuan rumah / tanggal" tone="alt" onPress={() => goMeeting(period.id, week.number)} />
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
          {actionError ? <Notice tone="danger">{actionError}</Notice> : null}
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

      <View style={styles.links}>
        <ListRow title="Anggota" tone="alt" onPress={() => router.push('/members')} right={<RowText>{memberCount} anggota</RowText>} />
        <ListRow title="Kas" tone="alt" onPress={() => router.push('/kas')} />
        <ListRow title="Pinjaman anggota" tone="alt" onPress={() => router.push('/loans')} />
        <ListRow title="Laporan" tone="alt" onPress={() => router.push('/laporan')} />
        <ListRow title="Titipan anggota" tone="alt" onPress={() => router.push('/credits')} />
        <ListRow title="Periode" tone="alt" onPress={() => router.push('/periods')} />
        <ListRow title="Cadangan dan ekspor" tone="alt" onPress={() => router.push('/backup')} />
        {period ? (
          <ListRow
            title="Jadwal periode"
            tone="alt"
            onPress={() => router.push({ pathname: '/periods/[id]', params: { id: period.id } })}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

const NO_PERIOD_REASON = 'Buat periode dulu.';

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg },
  cardLabel: { ...type.label, color: colors.textMuted },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  total: { flex: 1, gap: spacing.xs },
  sideActions: { width: 128, gap: spacing.sm },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  divider: { height: 1, backgroundColor: colors.divider },
  posRow: { flexDirection: 'row', gap: spacing.lg },
  pos: { flex: 1, gap: spacing.xs },
  heading: { ...type.heading, color: colors.text },
  title: { ...type.title, color: colors.text },
  body: { ...type.body, color: colors.text },
  ok: { color: colors.moneyIn, fontWeight: '600' },
  flex: { flex: 1 },
  arrearsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkItem: { ...type.body, color: colors.text },
  checkDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
  links: { gap: spacing.sm },
});
