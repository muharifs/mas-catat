import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRepos } from '@/db/provider';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { EmptyState } from '@/ui/components/EmptyState';
import { ErrorState } from '@/ui/components/ErrorState';
import { ListRow, RowText } from '@/ui/components/ListRow';
import { Loading } from '@/ui/components/Loading';
import { Money } from '@/ui/components/Money';
import { Notice } from '@/ui/components/Notice';
import { firstRunChecklist } from '@/ui/checklist';
import { formatDate, todayIso } from '@/ui/dates';
import { toIndonesian } from '@/ui/errors';
import { closeWeekMessage, overdueNotice, toasts } from '@/ui/messages';
import { colors, spacing, type } from '@/ui/theme';
import { toast } from '@/ui/toast';
import { useLoad } from '@/ui/useLoad';

// Home, top to bottom: kas card, first-run checklist (until set up), the running meeting with ONE primary action,
// and links to the other screens. All numbers come from the repositories; nothing is computed here.
export default function HomeScreen() {
  const repos = useRepos();

  const load = useCallback(async () => {
    const [members, period, periods, balances, kasEntries] = await Promise.all([
      repos.members.list(),
      repos.periods.getActive(),
      repos.periods.list(),
      repos.ledger.getKasBalances(),
      repos.ledger.listKas(),
    ]);
    const hasOpeningBalance = kasEntries.some((e) => e.type === 'opening_balance' && !e.reversedById);
    const hasEndedPeriod = periods.some((p) => p.status === 'closed');
    if (!period) {
      return { members, period: null, week: null, hostName: null, arrears: null, hostPaid: false, balances, periods, hasEndedPeriod, hasOpeningBalance, weeks: [] };
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
    return { members, period, week, hostName, arrears, hostPaid: Boolean(paid), balances, periods, hasEndedPeriod, hasOpeningBalance, weeks };
  }, [repos]);

  const { data, error, reload } = useLoad(load);
  const [actionError, setActionError] = useState<string | null>(null);

  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  if (!data) return <Loading />;

  const { period, week, hostName, members, arrears, hostPaid, balances, periods, hasEndedPeriod, hasOpeningBalance, weeks } = data;
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
        <Text style={styles.cardLabel}>Total kas</Text>
        <Money amount={balances.actual} size="display" />
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
                  <Button
                    label={hostPaid ? 'Tuan rumah sudah dibayar' : 'Bayar tuan rumah'}
                    variant="secondary"
                    onPress={() => router.push({ pathname: '/periods/[id]/payout', params: { id: period.id, week: String(week.number) } })}
                  />
                  <Button label={`Tutup pertemuan ${week.number}`} variant="dangerOutline" onPress={confirmCloseWeek} />
                  <ListRow title="Ubah tuan rumah / tanggal" tone="alt" onPress={() => goMeeting(period.id, week.number)} />
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

      <View style={styles.links}>
        <ListRow title="Anggota" tone="alt" onPress={() => router.push('/members')} right={<RowText>{memberCount} anggota</RowText>} />
        <ListRow title="Kas" tone="alt" onPress={() => router.push('/kas')} />
        <ListRow title="Laporan" tone="alt" onPress={() => router.push('/reports')} />
        <ListRow title="Titipan anggota" tone="alt" onPress={() => router.push('/credits')} />
        <ListRow title="Periode" tone="alt" onPress={() => router.push('/periods')} />
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

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg },
  cardLabel: { ...type.label, color: colors.textMuted },
  posRow: { flexDirection: 'row', gap: spacing.lg },
  pos: { flex: 1, gap: spacing.xs },
  heading: { ...type.heading, color: colors.text },
  title: { ...type.title, color: colors.text },
  body: { ...type.body, color: colors.text },
  ok: { color: colors.primary, fontWeight: '600' },
  flex: { flex: 1 },
  arrearsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkItem: { ...type.body, color: colors.text },
  checkDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
  links: { gap: spacing.sm },
});
