import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { isRealDate, previewMeetingDates } from '@/domain/schedule';
import { useRepos } from '@/db/provider';
import { Button } from '@/ui/components/Button';
import { EmptyState } from '@/ui/components/EmptyState';
import { TextField } from '@/ui/components/TextField';
import { formatDate, todayIso } from '@/ui/dates';
import { toIndonesian } from '@/ui/errors';
import { useLoad } from '@/ui/useLoad';

// Create a period: name, date of meeting 1, members, preview of estimated dates, save.
// Hosts are NOT chosen here: they are picked per meeting later (current and next meeting only).
// N (the number of selected members) is fixed once saved.
export default function NewPeriodScreen() {
  const repos = useRepos();
  const load = useCallback(async () => {
    const [members, active] = await Promise.all([repos.members.list(), repos.periods.getActive()]);
    return { members, active };
  }, [repos]);
  const { data, error: loadError } = useLoad(load);

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(todayIso());
  const [selected, setSelected] = useState<string[]>([]); // selected member ids
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (loadError) return <Text style={styles.error}>{loadError}</Text>;
  if (!data) return <Text style={styles.muted}>Memuat...</Text>;

  const { members, active } = data;
  const dateOk = isRealDate(startDate);
  const preview = dateOk ? previewMeetingDates(startDate, selected.length) : [];
  const canSave = !active && !saving && name.trim().length > 0 && dateOk && selected.length > 0;

  function toggle(id: string) {
    setSelected((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function save() {
    setSaving(true);
    try {
      const period = await repos.periods.create({ name, startDate, memberIds: selected });
      router.replace({ pathname: '/periods/[id]', params: { id: period.id } });
    } catch (e) {
      setSaveError(toIndonesian(e));
      setSaving(false);
    }
  }

  if (members.length === 0) {
    return (
      <EmptyState
        title="Belum ada anggota"
        message="Tambahkan anggota dulu sebelum membuat periode."
        actionLabel="Tambah anggota"
        onAction={() => router.push('/members')}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {active ? (
        <Text style={styles.warning}>
          Periode &quot;{active.name}&quot; masih aktif. Akhiri dulu sebelum membuat periode baru.
        </Text>
      ) : null}

      <TextField label="Nama periode" placeholder="Contoh: Periode 1" value={name} onChangeText={setName} />
      <TextField
        label="Tanggal pertemuan 1 (TTTT-BB-HH)"
        value={startDate}
        onChangeText={setStartDate}
        placeholder="2026-01-04"
        keyboardType="numbers-and-punctuation"
        error={dateOk ? null : 'Tanggal tidak valid. Contoh: 2026-01-04'}
      />

      <Text style={styles.section}>Pilih anggota ({selected.length} dipilih)</Text>
      <Text style={styles.hint}>Jumlah anggota tidak bisa diubah setelah periode dibuat.</Text>
      <View style={styles.chips}>
        {members.map((m) => (
          <Button
            key={m.id}
            label={`${selected.includes(m.id) ? '[x] ' : '[ ] '}${m.name}`}
            variant={selected.includes(m.id) ? 'primary' : 'secondary'}
            onPress={() => toggle(m.id)}
          />
        ))}
      </View>

      {selected.length > 0 ? (
        <>
          <Text style={styles.section}>Perkiraan tanggal pertemuan</Text>
          <Text style={styles.hint}>
            Tuan rumah dan tanggal pasti dipilih nanti, per pertemuan: hanya untuk pertemuan saat ini dan pertemuan
            berikutnya.
          </Text>
          {preview.map((row) => (
            <Text key={row.week}>
              Pertemuan {row.week} - {formatDate(row.date)}{selected.length > 1 ? ' - Belum ditentukan' : ' - tuan rumah otomatis'}
            </Text>
          ))}
        </>
      ) : (
        <Text style={styles.hint}>Pilih minimal satu anggota untuk melihat perkiraan tanggal.</Text>
      )}

      {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
      <Button label={saving ? 'Menyimpan...' : 'Simpan periode'} onPress={save} disabled={!canSave} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  section: { fontSize: 16, fontWeight: '700', marginTop: 8 },
  hint: { color: '#666', fontSize: 13 },
  chips: { gap: 6 },
  warning: { padding: 12, borderRadius: 8, backgroundColor: '#fff3cd', color: '#664d03' },
  error: { padding: 8, color: '#b3261e' },
  muted: { padding: 16, color: '#666' },
});
