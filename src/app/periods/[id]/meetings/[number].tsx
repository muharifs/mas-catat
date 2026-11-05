import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { sortByName } from '@/domain/sort';
import {
  defaultMeetingDate,
  eligibleHostIds,
  meetingDateProblem,
  selectableWeekNumbers,
} from '@/domain/schedule';
import { useRepos } from '@/db/provider';
import { Button } from '@/ui/components/Button';
import { DateField } from '@/ui/components/DateField';
import { ErrorState } from '@/ui/components/ErrorState';
import { Loading } from '@/ui/components/Loading';
import { Notice } from '@/ui/components/Notice';
import { OptionRow } from '@/ui/components/OptionRow';
import { MEETING_SHORTCUTS } from '@/ui/dateInput';
import { formatDate } from '@/ui/dates';
import { toIndonesian } from '@/ui/errors';
import { describeDateProblem } from '@/ui/meetingDate';
import { toasts } from '@/ui/messages';
import { colors, spacing, type } from '@/ui/theme';
import { toast } from '@/ui/toast';
import { useLoad } from '@/ui/useLoad';

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
    return { period, weeks, memberIds: periodMembers.map((m) => m.memberId), members };
  }, [repos, id]);
  const { data, error: loadError, reload } = useLoad(load);

  // null = the owner has not touched the field yet, so the default (computed from loaded data) is shown.
  const [pickedHost, setPickedHost] = useState<string | null>(null);
  const [dateInput, setDateInput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loadError) return <ErrorState message={loadError} onRetry={() => void reload()} />;
  if (!data) return <Loading />;
  const { period, weeks, memberIds, members } = data;
  const found = weeks.find((w) => w.number === number);
  if (!period || !found) return <ErrorState message="Pertemuan tidak ditemukan." />;

  const week = found; // const copy: TypeScript keeps the narrowing (not undefined) inside the functions below
  const nameOf = (memberId: string | null) =>
    memberId === null ? 'Belum ditentukan' : (members.find((m) => m.id === memberId)?.name ?? '-');
  const canEdit = period.status === 'active' && week.status === 'open' && selectableWeekNumbers(weeks).includes(number);
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

  const host = pickedHost ?? week.hostMemberId;
  const date = dateInput ?? (week.hostMemberId ? week.date : defaultMeetingDate(weeks, number));
  const problem = meetingDateProblem(weeks, number, date);
  const eligible = sortByName(eligibleHostIds(weeks, memberIds), (memberId) => nameOf(memberId));
  // The picked member may already hold another open meeting: saving then exchanges the two hosts.
  const holder = host ? weeks.find((w) => w.status === 'open' && w.number !== number && w.hostMemberId === host) : undefined;
  const canSave = !busy && host !== null && problem === null;

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
    Alert.alert('Tukar tuan rumah', `${summary}\n\n${swapNote}`, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Simpan', onPress: () => void save() },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Pertemuan {number}</Text>
      <Text style={styles.hint}>Tuan rumah saat ini: {nameOf(week.hostMemberId)}</Text>

      <Text style={styles.section}>Tuan rumah</Text>
      <Text style={styles.hint}>Hanya anggota yang belum pernah jadi tuan rumah di pertemuan yang sudah ditutup.</Text>
      <View style={styles.list}>
        {eligible.map((memberId) => (
          <OptionRow
            key={memberId}
            mode="radio"
            label={nameOf(memberId)}
            selected={host === memberId}
            onPress={() => setPickedHost(memberId)}
          />
        ))}
      </View>
      {holder ? (
        <Notice tone="warn">
          {`${nameOf(host)} sudah tuan rumah pertemuan ${holder.number}. Jika disimpan, tuan rumah kedua pertemuan ditukar.`}
        </Notice>
      ) : null}

      <DateField
        label={`Tanggal pertemuan ${number}`}
        value={date}
        onChange={setDateInput}
        shortcuts={MEETING_SHORTCUTS}
        error={problem ? describeDateProblem(problem) : null}
      />
      <Text style={styles.hint}>
        Pertemuan berikutnya yang belum ditentukan diperkirakan tiap 7 hari setelah tanggal terakhir yang dipilih.
      </Text>

      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Button label={busy ? 'Menyimpan...' : 'Simpan'} disabled={!canSave} onPress={submit} />
      <Button label="Batal" variant="secondary" onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  title: { ...type.title, color: colors.text },
  section: { ...type.heading, color: colors.text, marginTop: spacing.sm },
  body: { ...type.body, color: colors.text },
  hint: { ...type.caption, color: colors.textMuted },
  list: { gap: spacing.sm },
});
