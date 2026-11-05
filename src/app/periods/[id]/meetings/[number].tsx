import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  defaultMeetingDate,
  eligibleHostIds,
  meetingDateProblem,
  selectableWeekNumbers,
} from '@/domain/schedule';
import { useRepos } from '@/db/provider';
import { Button } from '@/ui/components/Button';
import { TextField } from '@/ui/components/TextField';
import { formatDate } from '@/ui/dates';
import { toIndonesian } from '@/ui/errors';
import { describeDateProblem } from '@/ui/meetingDate';
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
  const { data, error: loadError } = useLoad(load);

  // null = the owner has not touched the field yet, so the default (computed from loaded data) is shown.
  const [pickedHost, setPickedHost] = useState<string | null>(null);
  const [dateInput, setDateInput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loadError) return <Text style={styles.error}>{loadError}</Text>;
  if (!data) return <Text style={styles.muted}>Memuat...</Text>;
  const { period, weeks, memberIds, members } = data;
  const found = weeks.find((w) => w.number === number);
  if (!period || !found) return <Text style={styles.error}>Pertemuan tidak ditemukan.</Text>;

  const week = found; // const copy: TypeScript keeps the narrowing (not undefined) inside the functions below
  const nameOf = (memberId: string | null) =>
    memberId === null ? 'Belum ditentukan' : (members.find((m) => m.id === memberId)?.name ?? '-');
  const canEdit = period.status === 'active' && week.status === 'open' && selectableWeekNumbers(weeks).includes(number);
  if (!canEdit) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Pertemuan {number}</Text>
        <Text>
          Tuan rumah dan tanggal hanya bisa diatur untuk pertemuan saat ini dan pertemuan berikutnya yang belum ditutup.
        </Text>
        <Button label="Kembali" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  const host = pickedHost ?? week.hostMemberId;
  const date = dateInput ?? (week.hostMemberId ? week.date : defaultMeetingDate(weeks, number));
  const problem = meetingDateProblem(weeks, number, date);
  const eligible = eligibleHostIds(weeks, memberIds);
  // The picked member may already hold another open meeting: saving then exchanges the two hosts.
  const holder = host ? weeks.find((w) => w.status === 'open' && w.number !== number && w.hostMemberId === host) : undefined;
  const canSave = !busy && host !== null && problem === null;

  async function save() {
    if (!host) return;
    setBusy(true);
    try {
      await repos.weeks.assignHost(id, number, host, date);
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
      <View style={styles.chips}>
        {eligible.map((memberId) => (
          <Button
            key={memberId}
            label={`${host === memberId ? '[x] ' : '[ ] '}${nameOf(memberId)}`}
            variant={host === memberId ? 'primary' : 'secondary'}
            onPress={() => setPickedHost(memberId)}
          />
        ))}
      </View>
      {holder ? (
        <Text style={styles.warning}>
          {nameOf(host)} sudah tuan rumah pertemuan {holder.number}. Jika disimpan, tuan rumah kedua pertemuan ditukar.
        </Text>
      ) : null}

      <TextField
        label={`Tanggal pertemuan ${number} (TTTT-BB-HH)`}
        value={date}
        onChangeText={setDateInput}
        keyboardType="numbers-and-punctuation"
        placeholder="2026-01-04"
        error={problem ? describeDateProblem(problem) : null}
      />
      <Text style={styles.hint}>
        Pertemuan berikutnya yang belum ditentukan diperkirakan tiap 7 hari setelah tanggal terakhir yang dipilih.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button label={busy ? 'Menyimpan...' : 'Simpan'} disabled={!canSave} onPress={submit} />
      <Button label="Batal" variant="secondary" onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10, paddingBottom: 48 },
  title: { fontSize: 22, fontWeight: '700' },
  section: { fontSize: 16, fontWeight: '700', marginTop: 8 },
  hint: { color: '#666', fontSize: 13 },
  chips: { gap: 6 },
  warning: { padding: 12, borderRadius: 8, backgroundColor: '#fff3cd', color: '#664d03' },
  error: { padding: 8, color: '#b3261e' },
  muted: { padding: 16, color: '#666' },
});
