import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { showDialog } from '@/ui/dialog';
import { selectableWeekNumbers } from '@/domain/schedule';
import { skippedTurnMember } from '@/domain/week-skip';
import { useRepos } from '@/db/provider';
import { Badge } from '@/ui/components/Badge';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { ErrorState } from '@/ui/components/ErrorState';
import { Loading } from '@/ui/components/Loading';
import { Notice } from '@/ui/components/Notice';
import { Section } from '@/ui/components/Section';
import { formatDate } from '@/ui/dates';
import { HOST_PAYOUT_STANDS_TEXT, toIndonesian } from '@/ui/errors';
import { closeWeekMessage, toasts } from '@/ui/messages';
import {
  shouldLoadSkipPreview,
  SKIP_CARD_HELP,
  skipCard,
  skipCardTitle,
  skippedClosePrefix,
  skippedRowHelp,
} from '@/ui/skipMeeting';
import { colors, ICON, radius, spacing, type } from '@/ui/theme';
import { toast } from '@/ui/toast';
import { useLoad } from '@/ui/useLoad';
import { useSkipMeeting } from '@/ui/useSkipMeeting';
import { SEP } from '@/ui/separator';

// Period detail: meeting schedule (host and date per meeting), payments entry, "Tutup pertemuan" and the way to the
// pre-close screen ("Akhiri periode").
export default function PeriodDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const repos = useRepos();

  const load = useCallback(async () => {
    const [period, weeks, members, periodMembers] = await Promise.all([
      repos.periods.getById(id),
      repos.weeks.listByPeriod(id),
      repos.members.list(),
      repos.periods.getMembers(id),
    ]);
    // Which meetings already have a host payout in force (a corrected payout does not count).
    const paidWeeks = new Set<number>();
    for (const w of weeks) {
      if (await repos.ledger.getWeekPayout(id, w.number)) paidWeeks.add(w.number);
    }
    // Arrears through the current meeting, for the warning in the "Tutup pertemuan" dialog.
    const arrears = period && period.status === 'active' ? await repos.payments.getArrearsSummary(id) : null;
    // The skip card only exists while the LAST meeting is the oldest open one; previewSkip gives its numbers and blocker.
    const oldestOpenNumber = weeks.find((w) => w.status === 'open')?.number ?? null;
    const skipPreview =
      period && shouldLoadSkipPreview({ periodActive: period.status === 'active', memberCount: period.memberCount, oldestOpenNumber })
        ? await repos.weeks.previewSkip(id)
        : null;
    return { period, weeks, members, periodMembers, paidWeeks, arrears, skipPreview };
  }, [repos, id]);
  const { data, error: loadError, reload } = useLoad(load);

  const [actionError, setActionError] = useState<string | null>(null);
  const skip = useSkipMeeting(id);

  if (loadError) return <ErrorState message={loadError} onRetry={() => void reload()} />;
  if (!data) return <Loading />;
  if (!data.period) return <ErrorState title="Data tidak ditemukan" message="Periode tidak ditemukan. Kembali lalu pilih lagi." />;

  const { period, weeks, members, periodMembers, paidWeeks, arrears, skipPreview } = data;
  const nameOf = (memberId: string | null) =>
    memberId === null ? 'Belum ditentukan' : (members.find((m) => m.id === memberId)?.name ?? '-');
  const selectable = selectableWeekNumbers(weeks);
  const isActive = period.status === 'active';
  const openWeeks = weeks.filter((w) => w.status === 'open').length;

  const oldestOpen = weeks.find((w) => w.status === 'open');
  const skippedNumbers = weeks.filter((w) => w.status === 'skipped').map((w) => w.number);
  const skipView = skipCard(skipPreview);
  // Name of the member whose turn moved to the next period (null when it cannot be told: the generic sentence is used).
  const turnId = skippedTurnMember(
    periodMembers.map((m) => m.memberId),
    weeks.map((w) => ({ hostMemberId: w.hostMemberId, skipped: w.status === 'skipped' })),
  );
  const turnName = turnId ? (members.find((m) => m.id === turnId)?.name ?? null) : null;

  function confirmCloseWeek() {
    if (!oldestOpen) return;
    const number = oldestOpen.number;
    showDialog({
      title: `Tutup pertemuan ${number}`,
      message: closeWeekMessage(number, oldestOpen.date, arrears),
      buttons: [
        { label: 'Batal', role: 'cancel' },
        {
          label: 'Tutup pertemuan',
          role: 'destructive',
          onPress: async () => {
            try {
              await repos.weeks.closeOldest(period.id);
              setActionError(null);
              toast(toasts.weekClosed(number));
              await reload();
            } catch (e) {
              setActionError(toIndonesian(e, 'close_week'));
            }
          },
        },
      ],
    });
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{period.name}</Text>
      <Text style={styles.body}>
        {isActive ? 'Aktif' : 'Berakhir'}{SEP}{period.memberCount} anggota{SEP}mulai {formatDate(period.startDate)}
        {period.endDate ? `${SEP}sampai ${formatDate(period.endDate)}` : ''}
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
            <Text style={styles.hint}>
              Tentukan tuan rumah pertemuan {oldestOpen.number} dulu{skipView ? ', atau lewati pertemuan ini' : ''}.
            </Text>
          ) : null}
        </Card>
      ) : null}

      {isActive && skipView ? (
        <Card tone="alt">
          <Text style={styles.cardTitle}>{skipCardTitle(skipView.number)}</Text>
          <Text style={styles.hint}>{SKIP_CARD_HELP}</Text>
          <Button
            label={skipCardTitle(skipView.number)}
            variant="secondary"
            disabled={!skipView.enabled}
            loading={skip.busy}
            disabledReason={skipView.reason ?? undefined}
            onPress={() => {
              if (skipPreview) skip.ask({ number: skipView.number, preview: skipPreview, onSkipped: reload });
            }}
          />
          {skip.error ? <Notice tone="danger">{skip.error}</Notice> : null}
        </Card>
      ) : null}

      <Section title="Jadwal" contentGap={spacing.md}>
      {weeks.map((w) => {
        // A skipped meeting (status 'skipped') is neither open nor closed: no host, date, payout or close actions.
        const isSkipped = w.status === 'skipped';
        const canPick = isActive && w.status === 'open' && selectable.includes(w.number);
        const isPaid = paidWeeks.has(w.number);
        // Same rule as the repository: a host payout is possible for the current meeting or a closed one.
        const canPay = isActive && !isPaid && w.hostMemberId !== null && !isSkipped && (w.status === 'closed' || w.number === oldestOpen?.number);
        const canViewPayout = isPaid && isActive;
        const hasActions = canPick || canPay || canViewPayout || (isSkipped && isActive);
        // J4: a closed and paid meeting of the active period is one tap area (no extra button) with a chevron.
        const wholeCardTap = canViewPayout && w.status === 'closed';
        const openPayout = () =>
          router.push({ pathname: '/periods/[id]/payout', params: { id: period.id, week: String(w.number) } });
        // J2: the current meeting gets a 4dp accent line on the left (no words; the colour only supports).
        const isCurrent = isActive && oldestOpen?.number === w.number;
        const texts = (
          <View style={[styles.texts, wholeCardTap && styles.textsFlex]}>
            <Text style={styles.weekTitle}>
              Pertemuan {w.number}{SEP}{formatDate(w.date)}
              {w.status === 'open' && !w.hostMemberId && !canPick ? ' (perkiraan)' : ''}
            </Text>
            {/* A skipped meeting shows no host: a name there would read as if a payout happened. */}
            <Text style={w.hostMemberId && !isSkipped ? styles.body : styles.hint}>
              Tuan rumah: {isSkipped ? 'tidak ada' : nameOf(w.hostMemberId)}
            </Text>
            {w.status === 'open' ? (
              <Badge label="Terbuka" tone="brand" />
            ) : isSkipped ? (
              <Badge label="Dilewati" tone="neutral" />
            ) : (
              <Badge label="Ditutup" tone="neutral" />
            )}
            {isSkipped ? <Text style={styles.hint}>{skippedRowHelp(turnName)}</Text> : null}
            {/* With the "Lihat pembayaran tuan rumah" button (open meeting, active period) the paid state is obvious;
                otherwise the status line stays. */}
            {isPaid && (!canViewPayout || wholeCardTap) ? <Text style={styles.closed}>Pembayaran tuan rumah: sudah dibayar</Text> : null}
            {canPick && isPaid && w.hostMemberId ? <Text style={styles.hint}>{HOST_PAYOUT_STANDS_TEXT}</Text> : null}
          </View>
        );
        if (wholeCardTap) {
          return (
            // Pressable is the RN tappable view; accessibilityRole="button" is what TalkBack reads as actionable.
            <Pressable
              key={w.number}
              accessibilityRole="button"
              accessibilityLabel={`Pertemuan ${w.number}, ${nameOf(w.hostMemberId)}, Ditutup, Lihat pembayaran tuan rumah, sudah dibayar`}
              onPress={openPayout}
              style={({ pressed }) => [styles.row, styles.rowTap, pressed && styles.rowPressed]}
            >
              {texts}
              <View accessibilityElementsHidden importantForAccessibility="no">
                <Ionicons name="chevron-forward" size={ICON.sm} color={colors.textTertiary} />
              </View>
            </Pressable>
          );
        }
        return (
          <View key={w.number} style={[styles.row, isCurrent && styles.rowCurrent]}>
            {texts}
            {hasActions ? (
            <View style={styles.actions}>
              {canPick ? (
                <Button
                  label={isPaid && w.hostMemberId ? 'Ubah tanggal' : w.hostMemberId ? 'Ubah' : 'Tentukan'}
                  accessibilityLabel={isPaid && w.hostMemberId ? 'Ubah tanggal pertemuan' : undefined}
                  variant="secondary"
                  onPress={() =>
                    router.push({ pathname: '/periods/[id]/meetings/[number]', params: { id: period.id, number: String(w.number) } })
                  }
                />
              ) : null}
              {canPay ? (
                <Button
                  label="Bayar tuan rumah"
                  onPress={() => router.push({ pathname: '/periods/[id]/payout', params: { id: period.id, week: String(w.number) } })}
                />
              ) : null}
              {isSkipped && isActive ? (
                <Button
                  label="Batalkan pelewatan"
                  accessibilityLabel={`Batalkan pelewatan pertemuan ${w.number}`}
                  variant="secondary"
                  onPress={() =>
                    router.push({ pathname: '/periods/[id]/meetings/[number]', params: { id: period.id, number: String(w.number) } })
                  }
                />
              ) : null}
              {canViewPayout ? (
                <Button
                  label="Lihat pembayaran tuan rumah"
                  accessibilityLabel="Lihat pembayaran tuan rumah, sudah dibayar"
                  variant="secondary"
                  onPress={openPayout}
                />
              ) : null}
            </View>
            ) : null}
          </View>
        );
      })}
      </Section>

      {isActive ? (
        <Card tone="alt">
          <Text style={styles.cardTitle}>Akhiri periode</Text>
          <Text style={styles.hint}>
            {skippedClosePrefix(skippedNumbers)}Periode bisa diakhiri setelah semua pertemuan ditutup dan semua tuan rumah dibayar ({openWeeks} pertemuan
            masih terbuka). Halaman berikutnya menunjukkan tunggakan yang akan dihapus dan titipan anggota sebelum periode
            benar-benar diakhiri.
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
  container: { padding: spacing.lg, gap: spacing.lg },
  title: { ...type.titleL, color: colors.text },
  body: { ...type.body, color: colors.text },
  cardTitle: { ...type.titleM, color: colors.text },
  // Text on top, buttons below at full card width (never beside the text, so long labels wrap instead of being clipped).
  row: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.sm, padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.bgCard },
  rowTap: { flexDirection: 'row', alignItems: 'center' },
  rowPressed: { backgroundColor: colors.bgMute },
  rowCurrent: { borderLeftWidth: 4, borderLeftColor: colors.brand },
  texts: { gap: spacing.xs },
  textsFlex: { flex: 1 },
  actions: { gap: spacing.sm, alignSelf: 'stretch' },
  weekTitle: { ...type.bodyStrong, color: colors.text },
  closed: { ...type.body, color: colors.textSecondary },
  hint: { ...type.secondary, color: colors.textSecondary },
});
