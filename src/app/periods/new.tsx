import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { isRealDate, moveItem, previewSchedule } from '@/domain/schedule';
import { useRepos } from '@/db/provider';
import { Button } from '@/ui/components/Button';
import { EmptyState } from '@/ui/components/EmptyState';
import { TextField } from '@/ui/components/TextField';
import { formatDate, todayIso } from '@/ui/dates';
import { toIndonesian } from '@/ui/errors';
import { useLoad } from '@/ui/useLoad';

// Create a period: name, week-1 date, members, host order, preview, save.
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
  const [hostOrder, setHostOrder] = useState<string[]>([]); // selected member ids, in host order
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (loadError) return <Text style={styles.error}>{loadError}</Text>;
  if (!data) return <Text style={styles.muted}>Memuat...</Text>;

  const { members, active } = data;
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? '-';
  const dateOk = isRealDate(startDate);
  const preview = dateOk ? previewSchedule(startDate, hostOrder) : [];
  const canSave = !active && !saving && name.trim().length > 0 && dateOk && hostOrder.length > 0;

  function toggle(id: string) {
    setHostOrder((order) => (order.includes(id) ? order.filter((x) => x !== id) : [...order, id]));
  }

  async function save() {
    setSaving(true);
    try {
      const period = await repos.periods.create({ name, startDate, hostOrder });
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
        label="Tanggal minggu 1 (TTTT-BB-HH)"
        value={startDate}
        onChangeText={setStartDate}
        placeholder="2026-01-04"
        keyboardType="numbers-and-punctuation"
        error={dateOk ? null : 'Tanggal tidak valid. Contoh: 2026-01-04'}
      />

      <Text style={styles.section}>Pilih anggota ({hostOrder.length} dipilih)</Text>
      <Text style={styles.hint}>Jumlah anggota tidak bisa diubah setelah periode dibuat.</Text>
      <View style={styles.chips}>
        {members.map((m) => (
          <Button
            key={m.id}
            label={`${hostOrder.includes(m.id) ? '[x] ' : '[ ] '}${m.name}`}
            variant={hostOrder.includes(m.id) ? 'primary' : 'secondary'}
            onPress={() => toggle(m.id)}
          />
        ))}
      </View>

      {hostOrder.length > 0 ? (
        <>
          <Text style={styles.section}>Urutan tuan rumah</Text>
          {hostOrder.map((id, i) => (
            <View key={id} style={styles.orderRow}>
              <Text style={styles.orderName}>
                {i + 1}. {nameOf(id)}
              </Text>
              <Button label="Naik" variant="secondary" disabled={i === 0} onPress={() => setHostOrder((o) => moveItem(o, i, -1))} />
              <Button
                label="Turun"
                variant="secondary"
                disabled={i === hostOrder.length - 1}
                onPress={() => setHostOrder((o) => moveItem(o, i, 1))}
              />
            </View>
          ))}

          <Text style={styles.section}>Pratinjau jadwal</Text>
          {preview.map((row) => (
            <Text key={row.week}>
              Minggu {row.week} - {formatDate(row.date)} - {nameOf(row.memberId)}
            </Text>
          ))}
        </>
      ) : (
        <Text style={styles.hint}>Pilih minimal satu anggota untuk melihat jadwal.</Text>
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
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  orderName: { flex: 1, fontSize: 15 },
  warning: { padding: 12, borderRadius: 8, backgroundColor: '#fff3cd', color: '#664d03' },
  error: { padding: 8, color: '#b3261e' },
  muted: { padding: 16, color: '#666' },
});
