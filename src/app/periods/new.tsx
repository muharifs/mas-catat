import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { isRealDate, previewMeetingDates } from '@/domain/schedule';
import type { MemberCarryOver } from '@/db/credits';
import { useRepos } from '@/db/provider';
import { Button } from '@/ui/components/Button';
import { EmptyState } from '@/ui/components/EmptyState';
import { TextField } from '@/ui/components/TextField';
import { formatDate, todayIso } from '@/ui/dates';
import { toIndonesian } from '@/ui/errors';
import { formatRupiah } from '@/ui/format';
import { useLoad } from '@/ui/useLoad';

// Create a period: name, date of meeting 1, members, preview of estimated dates, save.
// Hosts are NOT chosen here: they are picked per meeting later (current and next meeting only).
// N (the number of selected members) is fixed once saved.
export default function NewPeriodScreen() {
  const repos = useRepos();
  const load = useCallback(async () => {
    const [members, active, refundable] = await Promise.all([
      repos.members.list(),
      repos.periods.getActive(),
      repos.credits.listRefundable(),
    ]);
    return { members, active, refundable };
  }, [repos]);
  const { data, error: loadError } = useLoad(load);

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(todayIso());
  const [selected, setSelected] = useState<string[]>([]); // selected member ids
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [carry, setCarry] = useState<MemberCarryOver[]>([]);
  const [carryError, setCarryError] = useState<string | null>(null);

  // Preview of the credit that would be taken over from earlier periods. useEffect is the same hook as on the web;
  // the "server" here is the local database. The saved result is computed by the same domain function.
  useEffect(() => {
    if (selected.length === 0) return; // nothing selected: the preview is hidden below
    let cancelled = false;
    repos.periods.previewCarryOver(selected).then(
      (plans) => {
        if (cancelled) return;
        setCarry(plans.filter((p) => p.creditBefore > 0));
        setCarryError(null);
      },
      (e: unknown) => {
        if (!cancelled) setCarryError(toIndonesian(e));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [repos, selected]);

  if (loadError) return <Text style={styles.error}>{loadError}</Text>;
  if (!data) return <Text style={styles.muted}>Memuat...</Text>;

  const { members, active, refundable } = data;
  const nameOf = (memberId: string) => members.find((m) => m.id === memberId)?.name ?? '-';
  const shownCarry = selected.length === 0 ? [] : carry;
  const leftOut = refundable.filter((r) => !selected.includes(r.memberId));
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

      {shownCarry.length > 0 ? (
        <>
          <Text style={styles.section}>Kredit yang dibawa dari periode sebelumnya</Text>
          <Text style={styles.hint}>
            Kredit dipakai untuk iuran pertemuan terlama lebih dulu. Pertemuan terakhir yang tersentuh bisa terlunasi
            sebagian. Tidak ada uang yang bergerak: uangnya sudah masuk kas saat dibayar.
          </Text>
          {shownCarry.map((c) => (
            <View key={c.memberId} style={styles.carryRow}>
              <Text style={styles.strong}>{nameOf(c.memberId)}</Text>
              <Text>Kredit {formatRupiah(c.creditBefore)}</Text>
              {c.plan.applications.map((a, i) => (
                <Text key={`${a.fromPeriodId}-${a.week}-${i}`} style={styles.hint}>
                  Pertemuan {a.week}: {formatRupiah(a.amount)}
                </Text>
              ))}
              {c.plan.creditLeft > 0 ? (
                <Text style={styles.hint}>Sisa kredit {formatRupiah(c.plan.creditLeft)} melebihi iuran periode ini dan tetap tersedia.</Text>
              ) : null}
            </View>
          ))}
        </>
      ) : null}
      {carryError ? <Text style={styles.error}>{carryError}</Text> : null}
      {leftOut.length > 0 ? (
        <Text style={styles.hint}>
          Anggota yang punya kredit tetapi tidak dipilih:{' '}
          {leftOut.map((r) => `${nameOf(r.memberId)} (${formatRupiah(r.amount)})`).join(', ')}. Kreditnya tetap tersimpan
          dan bisa dikembalikan lewat menu Kredit anggota.
        </Text>
      ) : null}

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
  carryRow: { padding: 12, borderRadius: 8, backgroundColor: '#f2f6f3', gap: 2 },
  strong: { fontWeight: '700' },
  warning: { padding: 12, borderRadius: 8, backgroundColor: '#fff3cd', color: '#664d03' },
  error: { padding: 8, color: '#b3261e' },
  muted: { padding: 16, color: '#666' },
});
