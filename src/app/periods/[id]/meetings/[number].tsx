import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, Text, View } from 'react-native';
import { showDialog } from '@/ui/dialog';
import { sortByName } from '@/domain/sort';
import {
  defaultMeetingDate,
  eligibleHostIds,
  meetingDateProblem,
  selectableWeekNumbers,
} from '@/domain/schedule';
import { useRepos } from '@/db/provider';
import { Badge } from '@/ui/components/Badge';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { CorrectionForm } from '@/ui/components/CorrectionForm';
import { DateField } from '@/ui/components/DateField';
import { ErrorState } from '@/ui/components/ErrorState';
import { Loading } from '@/ui/components/Loading';
import { Notice } from '@/ui/components/Notice';
import { OptionRow } from '@/ui/components/OptionRow';
import { SearchField } from '@/ui/components/SearchField';
import { SectionHeader } from '@/ui/components/SectionHeader';
import { formatDate } from '@/ui/dates';
import { toIndonesian } from '@/ui/errors';
import { filterByQuery, shouldShowMemberSearch } from '@/ui/memberSearch';
import { describeDateProblem } from '@/ui/meetingDate';
import { toasts } from '@/ui/messages';
import {
  shouldLoadSkipPreview,
  SKIP_CARD_HELP,
  skipCard,
  skipCardTitle,
  SKIP_PERIOD_ENDED_TEXT,
  SKIPPED_SCREEN_TEXT,
  skippedTurnNotice,
  skipUndoneNote,
  unskipDialogMessage,
  unskipFormTexts,
  unskipTitle,
} from '@/ui/skipMeeting';
import { colors, spacing, type } from '@/ui/theme';
import { toast } from '@/ui/toast';
import { useLoad } from '@/ui/useLoad';
import { useSkipMeeting } from '@/ui/useSkipMeeting';

// Pick the host and the date of ONE meeting (only the current and the next open meeting are allowed).
// Route params: in expo-router the file name [number] becomes a string param, like a React Router :number.
export default function MeetingHostScreen() {
  const { id, number: numberParam } = useLocalSearchParams<{ id: string; number: string }>();
  const number = Number(numberParam);
  const repos = useRepos();

  const load = useCallback(async () => {
    const [period, weeks, periodMembers, members] = await Promise.all([
      repos.periods.getById(id),
      repos.weeks.listByPeriod(id),
      repos.periods.getMembers(id),
      repos.members.list(),
    ]);
    const standingPayoutWeeks = await repos.weeks.standingPayoutWeeks(id);
    // The skip card (decision 33) exists only while this is the last meeting and the oldest open one.
    const oldestOpenNumber = weeks.find((w) => w.status === 'open')?.number ?? null;
    const skipPreview =
      period &&
      number === period.memberCount &&
      shouldLoadSkipPreview({ periodActive: period.status === 'active', memberCount: period.memberCount, oldestOpenNumber })
        ? await repos.weeks.previewSkip(id)
        : null;
    const [skipHistory, skippedTurn] = await Promise.all([repos.weeks.listSkipHistory(id), repos.weeks.skippedTurn()]);
    return { period, weeks, memberIds: periodMembers.map((m) => m.memberId), members, standingPayoutWeeks, skipPreview, skipHistory, skippedTurn };
  }, [repos, id, number]);
  const { data, error: loadError, reload } = useLoad(load);

  // null = the owner has not touched the field yet, so the default (computed from loaded data) is shown.
  const [pickedHost, setPickedHost] = useState<string | null>(null);
  const [dateInput, setDateInput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false); // the "Batalkan pelewatan" form is open
  const skip = useSkipMeeting(id);
  const [query, setQuery] = useState(''); // local search word; declared before the early returns

  if (loadError) return <ErrorState message={loadError} onRetry={() => void reload()} />;
  if (!data) return <Loading />;
  const { period, weeks, memberIds, members, standingPayoutWeeks, skipPreview, skipHistory, skippedTurn } = data;
  const found = weeks.find((w) => w.number === number);
  if (!period || !found) return <ErrorState title="Data tidak ditemukan" message="Pertemuan tidak ditemukan. Kembali lalu pilih lagi." />;

  const week = found; // const copy: TypeScript keeps the narrowing (not undefined) inside the functions below
  const nameOf = (memberId: string | null) =>
    memberId === null ? 'Belum ditentukan' : (members.find((m) => m.id === memberId)?.name ?? '-');
  const canEdit = period.status === 'active' && week.status === 'open' && selectableWeekNumbers(weeks).includes(number);
  // A standing host payout locks the host (correct the payout first). The list comes from the repository.
  const payoutStands = week.hostMemberId !== null && standingPayoutWeeks.includes(number);
  if (week.status === 'skipped') {
    // Host and date are not shown at all (not disabled fields): the sentence says why they cannot change.
    const texts = unskipFormTexts(number);
    return (
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Pertemuan {number}</Text>
        <Badge label="Dilewati" tone="neutral" />
        <Text style={styles.body}>{SKIPPED_SCREEN_TEXT}</Text>
        {period.status !== 'active' ? (
          <Text style={styles.hint}>{SKIP_PERIOD_ENDED_TEXT}</Text>
        ) : cancelling ? (
          <CorrectionForm
            title={unskipTitle(number)}
            message={unskipDialogMessage(number)}
            submitLabel="Batalkan pelewatan"
            explain={texts.explain}
            reasonLabel={texts.reasonLabel}
            placeholder={texts.placeholder}
            requiredText={texts.requiredText}
            errorContext="unskip_week"
            onCancel={() => setCancelling(false)}
            onSubmit={async (reason) => {
              await repos.weeks.undoSkip(id, reason);
              toast(toasts.skipCancelled(number));
              setCancelling(false);
              await reload(); // the screen becomes the normal "Atur pertemuan" of an open meeting
            }}
          />
        ) : (
          <Button label="Batalkan pelewatan" variant="secondary" onPress={() => setCancelling(true)} />
        )}
        <Button label="Kembali" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    );
  }
  if (!canEdit) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Pertemuan {number}</Text>
        <Text style={styles.body}>
          Tuan rumah dan tanggal hanya bisa diatur untuk pertemuan saat ini dan pertemuan berikutnya yang belum ditutup.
        </Text>
        <Button label="Kembali" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  // With a standing payout the host is locked (same host re-sent) and only the date can change (owner decision 2026-11-10).
  const host = payoutStands ? week.hostMemberId : (pickedHost ?? week.hostMemberId);
  const date = dateInput ?? (week.hostMemberId ? week.date : defaultMeetingDate(weeks, number));
  const problem = meetingDateProblem(weeks, number, date);
  const eligible = sortByName(eligibleHostIds(weeks, memberIds), (memberId) => nameOf(memberId));
  // Search only hides rows. The picked host stays visible.
  const searchShown = shouldShowMemberSearch(eligible.length);
  const foundHosts = filterByQuery(eligible, (memberId) => nameOf(memberId), searchShown ? query : '', (memberId) => memberId === host);
  // The picked member may already hold another open meeting: saving then exchanges the two hosts.
  const holder = host ? weeks.find((w) => w.status === 'open' && w.number !== number && w.hostMemberId === host) : undefined;
  const canSave = !busy && host !== null && problem === null;
  const skipView = skipCard(skipPreview);
  // Hint (not a choice): the member whose turn was lost to a skip in the previous period. Shown while that member can still be picked.
  const turnMember = skippedTurn && eligible.includes(skippedTurn.memberId) && !weeks.some((w) => w.hostMemberId === skippedTurn.memberId) ? skippedTurn : null;
  const lastUndo = [...skipHistory].reverse().find((h) => h.week === number && h.undoReason !== null);

  async function save() {
    if (!host) return;
    setBusy(true);
    try {
      await repos.weeks.assignHost(id, number, host, date);
      toast(toasts.host(number, nameOf(host)));
      router.back();
    } catch (e) {
      setError(toIndonesian(e));
      setBusy(false);
    }
  }

  function submit() {
    setError(null);
    if (!host) return;
    const summary = `Pertemuan ${number}: ${nameOf(host)}, ${formatDate(date)}.`;
    if (!holder) {
      void save();
      return;
    }
    const swapNote =
      week.hostMemberId === null
        ? `${nameOf(host)} sekarang tuan rumah pertemuan ${holder.number}; pertemuan itu akan menjadi belum ditentukan.`
        : `${nameOf(host)} sekarang tuan rumah pertemuan ${holder.number}; kedua pertemuan saling bertukar (pertemuan ${holder.number} jadi ${nameOf(week.hostMemberId)}).`;
    showDialog({
      title: 'Tukar tuan rumah',
      message: `${summary}\n\n${swapNote}`,
      buttons: [
        { label: 'Batal', role: 'cancel' },
        { label: 'Simpan', onPress: () => void save() },
      ],
    });
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Pertemuan {number}</Text>
      <Text style={styles.hint}>Tuan rumah saat ini: {nameOf(week.hostMemberId)}</Text>
      {lastUndo?.undoReason ? <Text style={styles.hint}>{skipUndoneNote(lastUndo.undoReason)}</Text> : null}

      <SectionHeader title="Tuan rumah" />
      {turnMember && !payoutStands ? (
        <Notice tone="info">{skippedTurnNotice(nameOf(turnMember.memberId), turnMember.periodName, turnMember.week)}</Notice>
      ) : null}
      {payoutStands ? (
        <>
          <Text style={styles.body}>{nameOf(week.hostMemberId)}</Text>
          <Text style={styles.hint}>
            Tuan rumah sudah dibayar, jadi tidak bisa diganti. Tanggal masih bisa diubah. Uang tidak berubah.
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.hint}>Hanya anggota yang belum pernah jadi tuan rumah di pertemuan yang sudah ditutup.</Text>
          {searchShown ? (
            <SearchField value={query} onChangeText={setQuery} matchCount={foundHosts.matchCount} totalCount={eligible.length} />
          ) : null}
          <View style={styles.list}>
            {foundHosts.items.map((memberId) => (
              <OptionRow
                key={memberId}
                mode="radio"
                label={nameOf(memberId)}
                selected={host === memberId}
                onPress={() => {
                  setPickedHost(memberId);
                  Keyboard.dismiss();
                }}
              />
            ))}
          </View>
        </>
      )}
      {holder ? (
        <Notice tone="warn">
          {`${nameOf(host)} sudah tuan rumah pertemuan ${holder.number}. Jika disimpan, tuan rumah kedua pertemuan ditukar.`}
        </Notice>
      ) : null}

      <DateField
        label={`Tanggal pertemuan ${number}`}
        value={date}
        onChange={setDateInput}
        error={problem ? describeDateProblem(problem) : null}
      />
      <Text style={styles.hint}>
        Pertemuan berikutnya yang belum ditentukan diperkirakan jatuh pada hari Selasa terdekat, sekitar 7 hari setelah tanggal terakhir yang dipilih.
      </Text>

      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Button label={busy ? 'Menyimpan...' : 'Simpan'} disabled={!canSave} onPress={submit} />
      <Button label="Batal" variant="secondary" onPress={() => router.back()} />

      {skipView ? (
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
              // Unsaved host/date input is ignored: the meeting is skipped as it is stored.
              if (skipPreview) skip.ask({ number: skipView.number, preview: skipPreview, onSkipped: () => router.back() });
            }}
          />
          {skip.error ? <Notice tone="danger">{skip.error}</Notice> : null}
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  title: { ...type.titleL, color: colors.text },
  body: { ...type.body, color: colors.text },
  cardTitle: { ...type.titleM, color: colors.text },
  hint: { ...type.secondary, color: colors.textSecondary },
  list: { gap: spacing.sm },
});
