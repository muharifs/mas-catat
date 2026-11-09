import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { selectableWeekNumbers } from '@/domain/schedule';
import { useRepos } from '@/db/provider';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { ErrorState } from '@/ui/components/ErrorState';
import { Loading } from '@/ui/components/Loading';
import { Notice } from '@/ui/components/Notice';
import { SectionHeader } from '@/ui/components/SectionHeader';
import { formatDate } from '@/ui/dates';
import { HOST_PAYOUT_STANDS_TEXT, toIndonesian } from '@/ui/errors';
import { closeWeekMessage, toasts } from '@/ui/messages';
import { colors, radius, spacing, type } from '@/ui/theme';
import { toast } from '@/ui/toast';
import { useLoad } from '@/ui/useLoad';

// Period detail: meeting schedule (host and date per meeting), payments entry, "Tutup pertemuan" and the way to the
// pre-close screen ("Akhiri periode").
export default function PeriodDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const repos = useRepos();

  const load = useCallback(async () => {
    const [period, weeks, members] = await Promise.all([
      repos.periods.getById(id),
      repos.weeks.listByPeriod(id),
      repos.members.list(),
    ]);
    // Which meetings already have a host payout in force (a corrected payout does not count).
    const paidWeeks = new Set<number>();
    for (const w of weeks) {
      if (await repos.ledger.getWeekPayout(id, w.number)) paidWeeks.add(w.number);
    }
    // Arrears through the current meeting, for the warning in the "Tutup pertemuan" dialog.
    const arrears = period && period.status === 'active' ? await repos.payments.getArrearsSummary(id) : null;
    return { period, weeks, members, paidWeeks, arrears };
  }, [repos, id]);
  const { data, error: loadError, reload } = useLoad(load);

  const [actionError, setActionError] = useState<string | null>(null);

  if (loadError) return <ErrorState message={loadError} onRetry={() => void reload()} />;
  if (!data) return <Loading />;
  if (!data.period) return <ErrorState message="Periode tidak ditemukan." />;

  const { period, weeks, members, paidWeeks, arrears } = data;
  const nameOf = (memberId: string | null) =>
    memberId === null ? 'Belum ditentukan' : (members.find((m) => m.id === memberId)?.name ?? '-');
  const selectable = selectableWeekNumbers(weeks);
  const isActive = period.status === 'active';
  const openWeeks = weeks.filter((w) => w.status === 'open').length;

  const oldestOpen = weeks.find((w) => w.status === 'open');

  function confirmCloseWeek() {
    if (!oldestOpen) return;
    const number = oldestOpen.number;
    Alert.alert(`Tutup pertemuan ${number}`, closeWeekMessage(number, oldestOpen.date, arrears), [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Tutup pertemuan',
        style: 'destructive',
        onPress: async () => {
          try {
            await repos.weeks.closeOldest(period.id);
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

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{period.name}</Text>
      <Text style={styles.body}>
        {isActive ? 'Aktif' : 'Selesai'} - {period.memberCount} anggota - mulai {formatDate(period.startDate)}
        {period.endDate ? ` - berakhir ${formatDate(period.endDate)}` : ''}
      </Text>

      <Button
        label="Pembayaran"
        onPress={() => router.push({ pathname: '/periods/[id]/payments', params: { id: period.id } })}
      />

      {isActive && oldestOpen ? (
        <Card tone="alt">
          <Text style={styles.cardTitle}>Tutup pertemuan</Text>
          <Text style={styles.hint}>
            Pertemuan yang ditutup selalu yang paling awal yang masih terbuka (pertemuan {oldestOpen.number}) dan harus
            sudah punya tuan rumah. Tunggakan dihitung sampai pertemuan ini. Saat libur (misalnya Ramadan) tidak ada iuran:
            cukup jangan tutup pertemuan.
          </Text>
          <Button
            label={`Tutup pertemuan ${oldestOpen.number}`}
            variant="dangerOutline"
            disabled={oldestOpen.hostMemberId === null}
            onPress={confirmCloseWeek}
          />
          {oldestOpen.hostMemberId === null ? (
            <Text style={styles.hint}>Tentukan tuan rumah pertemuan {oldestOpen.number} dulu.</Text>
          ) : null}
        </Card>
      ) : null}

      <SectionHeader title="Jadwal" />
      {weeks.map((w) => {
        const canPick = isActive && w.status === 'open' && selectable.includes(w.number);
        const isPaid = paidWeeks.has(w.number);
        // Same rule as the repository: a host payout is possible for the current meeting or a closed one.
        const canPay = isActive && !isPaid && w.hostMemberId !== null && (w.status === 'closed' || w.number === oldestOpen?.number);
        return (
          <View key={w.number} style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.weekTitle}>
                Pertemuan {w.number} - {formatDate(w.date)}
                {w.status === 'open' && !w.hostMemberId && !canPick ? ' (perkiraan)' : ''}
              </Text>
              <Text style={w.hostMemberId ? styles.body : styles.hint}>Tuan rumah: {nameOf(w.hostMemberId)}</Text>
              <Text style={w.status === 'open' ? styles.open : styles.closed}>
                {w.status === 'open' ? 'Terbuka' : 'Ditutup'}
              </Text>
              {canPick && isPaid && w.hostMemberId ? <Text style={styles.hint}>{HOST_PAYOUT_STANDS_TEXT}</Text> : null}
            </View>
            <View style={styles.actions}>
              {canPick && !(isPaid && w.hostMemberId) ? (
                <Button
                  label={w.hostMemberId ? 'Ubah' : 'Tentukan'}
                  variant="secondary"
                  compact
                  onPress={() =>
                    router.push({ pathname: '/periods/[id]/meetings/[number]', params: { id: period.id, number: String(w.number) } })
                  }
                />
              ) : null}
              {canPay ? (
                <Button
                  label="Bayar tuan rumah"
                  compact
                  onPress={() => router.push({ pathname: '/periods/[id]/payout', params: { id: period.id, week: String(w.number) } })}
                />
              ) : null}
              {isPaid && isActive ? (
                <Button
                  label="Sudah dibayar"
                  variant="secondary"
                  compact
                  onPress={() => router.push({ pathname: '/periods/[id]/payout', params: { id: period.id, week: String(w.number) } })}
                />
              ) : null}
              {isPaid && !isActive ? <Text style={styles.open}>Sudah dibayar</Text> : null}
            </View>
          </View>
        );
      })}

      {isActive ? (
        <Card tone="alt">
          <Text style={styles.cardTitle}>Akhiri periode</Text>
          <Text style={styles.hint}>
            Periode bisa diakhiri setelah semua pertemuan ditutup dan semua tuan rumah dibayar ({openWeeks} pertemuan
            masih terbuka). Layar berikutnya menunjukkan tunggakan yang akan dihapus dan titipan anggota sebelum Anda
            memastikan.
          </Text>
          <Button
            label="Akhiri periode"
            variant="dangerOutline"
            onPress={() => router.push({ pathname: '/periods/[id]/close', params: { id: period.id } })}
          />
        </Card>
      ) : null}

      {actionError ? <Notice tone="danger">{actionError}</Notice> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  title: { ...type.titleL, color: colors.text },
  body: { ...type.body, color: colors.text },
  cardTitle: { ...type.titleM, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.bgCard },
  flex: { flex: 1 },
  actions: { gap: spacing.sm },
  weekTitle: { ...type.bodyStrong, color: colors.text },
  open: { ...type.body, color: colors.brandStrong },
  closed: { ...type.body, color: colors.textSecondary },
  hint: { ...type.secondary, color: colors.textSecondary },
});
