import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { isRealDate, isStartDateFarAway, nearestMeetingDayOnOrAfter, previewMeetingDates } from '@/domain/schedule';
import { sortByName } from '@/domain/sort';
import type { MemberCarryOver } from '@/db/credits';
import { useRepos } from '@/db/provider';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { DateField } from '@/ui/components/DateField';
import { EmptyState } from '@/ui/components/EmptyState';
import { ErrorState } from '@/ui/components/ErrorState';
import { Loading } from '@/ui/components/Loading';
import { Notice } from '@/ui/components/Notice';
import { OptionRow } from '@/ui/components/OptionRow';
import { TextField } from '@/ui/components/TextField';
import { SectionHeader } from '@/ui/components/SectionHeader';
import { formatDate, todayIso } from '@/ui/dates';
import { toIndonesian } from '@/ui/errors';
import { formatRupiah } from '@/ui/format';
import { toasts } from '@/ui/messages';
import { colors, spacing, type } from '@/ui/theme';
import { toast } from '@/ui/toast';
import { useLoad } from '@/ui/useLoad';
import { SEP } from '@/ui/separator';

const NO_IDS: string[] = [];

// Create a period: name, date of meeting 1, members, preview of estimated dates, save.
// Hosts are NOT chosen here: they are picked per meeting later (current and next meeting only).
// N (the number of selected members) is fixed once saved.
export default function NewPeriodScreen() {
  const repos = useRepos();
  const load = useCallback(async () => {
    const [members, active, refundable, periods] = await Promise.all([
      repos.members.listActive(), // archived members cannot join a new period
      repos.periods.getActive(),
      repos.credits.listRefundable(),
      repos.periods.list(),
    ]);
    // periods.list() is newest first. The members of the latest period are pre-selected (the owner can change that).
    const latest = periods[0];
    const latestMembers = latest ? await repos.periods.getMembers(latest.id) : [];
    return {
      members,
      active,
      refundable,
      defaultName: `Periode ${periods.length + 1}`,
      defaultSelected: latestMembers.map((m) => m.memberId),
    };
  }, [repos]);
  const { data, error: loadError, reload } = useLoad(load);

  // null = the owner has not touched the field yet, so the default (computed from loaded data) is shown.
  const [nameInput, setNameInput] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(() => nearestMeetingDayOnOrAfter(todayIso()));
  const [selectedInput, setSelectedInput] = useState<string[] | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [carry, setCarry] = useState<MemberCarryOver[]>([]);
  const [carryError, setCarryError] = useState<string | null>(null);

  const selected = useMemo(() => selectedInput ?? data?.defaultSelected ?? NO_IDS, [selectedInput, data]);

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
        if (!cancelled) setCarryError(toIndonesian(e, 'load'));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [repos, selected]);

  if (loadError) return <ErrorState message={loadError} onRetry={() => void reload()} />;
  if (!data) return <Loading />;

  const { active, refundable } = data;
  const members = sortByName(data.members, (m) => m.name); // display order only; the order of selection is kept as is
  const name = nameInput ?? data.defaultName;
  const nameOf = (memberId: string) => members.find((m) => m.id === memberId)?.name ?? '-';
  const shownCarry = selected.length === 0 ? [] : sortByName(carry, (c) => nameOf(c.memberId));
  const leftOut = sortByName(
    refundable.filter((r) => !selected.includes(r.memberId)),
    (r) => nameOf(r.memberId),
  );
  const dateOk = isRealDate(startDate);
  const preview = dateOk ? previewMeetingDates(startDate, selected.length) : [];
  const canSave = !active && !saving && name.trim().length > 0 && dateOk && selected.length > 0;

  function toggle(id: string) {
    setSelectedInput((ids) => {
      const current = ids ?? selected;
      return current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    });
  }

  async function save() {
    setSaving(true);
    try {
      const period = await repos.periods.create({ name, startDate, memberIds: selected });
      toast(toasts.periodSaved(name.trim()));
      if (selected.length > 1) {
        // Next step is choosing the host of meeting 1. replace: Back from there returns to where the owner came from.
        router.replace({ pathname: '/periods/[id]/meetings/[number]', params: { id: period.id, number: '1' } });
      } else {
        router.dismissTo('/'); // one member: the only meeting is assigned automatically
      }
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
        <Notice tone="warn">{`Periode "${active.name}" masih aktif. Akhiri dulu sebelum membuat periode baru.`}</Notice>
      ) : null}

      <TextField label="Nama periode" placeholder="Contoh: Periode 1" value={name} onChangeText={setNameInput} />
      <DateField label="Tanggal pertemuan 1" value={startDate} onChange={setStartDate} />
      {dateOk && isStartDateFarAway(startDate, todayIso()) ? (
        <Notice tone="warn">
          Tanggal pertemuan 1 lebih dari 14 hari dari hari ini. Pastikan tanggalnya benar. Periode tetap bisa disimpan.
        </Notice>
      ) : null}

      <SectionHeader title={`Pilih anggota (${selected.length} dipilih)`} />
      <Text style={styles.hint}>Jumlah anggota tidak bisa diubah setelah periode dibuat.</Text>
      <View style={styles.bulk}>
        <Button label="Pilih semua" variant="secondary" style={styles.flex} onPress={() => setSelectedInput(data.members.map((m) => m.id))} />
        <Button label="Kosongkan" variant="secondary" style={styles.flex} onPress={() => setSelectedInput([])} />
      </View>
      <View style={styles.list}>
        {members.map((m) => (
          <OptionRow key={m.id} label={m.name} selected={selected.includes(m.id)} onPress={() => toggle(m.id)} />
        ))}
      </View>

      {selected.length > 0 ? (
        <>
          <SectionHeader title="Perkiraan tanggal pertemuan" />
          <Text style={styles.hint}>
            Tuan rumah dan tanggal pasti dipilih nanti, per pertemuan: hanya untuk pertemuan saat ini dan pertemuan
            berikutnya.
          </Text>
          {preview.map((row) => (
            <Text key={row.week} style={styles.body}>
              Pertemuan {row.week}{SEP}{formatDate(row.date)}
              {selected.length > 1 ? `${SEP}Belum ditentukan` : `${SEP}tuan rumah otomatis`}
            </Text>
          ))}
        </>
      ) : (
        <Text style={styles.hint}>Pilih minimal satu anggota untuk melihat perkiraan tanggal.</Text>
      )}

      {shownCarry.length > 0 ? (
        <>
          <SectionHeader title="Titipan yang dibawa dari periode sebelumnya" />
          <Text style={styles.hint}>
            Titipan dipakai untuk iuran pertemuan terlama lebih dulu. Pertemuan terakhir yang terisi bisa lunas
            sebagian. Tidak ada uang yang bergerak: uangnya sudah masuk kas saat dibayar.
          </Text>
          {shownCarry.map((c) => (
            <Card key={c.memberId} tone="alt">
              <Text style={styles.strong}>{nameOf(c.memberId)}</Text>
              <Text style={styles.body}>Titipan {formatRupiah(c.creditBefore)}</Text>
              {c.plan.applications.map((a, i) => (
                <Text key={`${a.fromPeriodId}-${a.week}-${i}`} style={styles.hint}>
                  Pertemuan {a.week}: {formatRupiah(a.amount)}
                </Text>
              ))}
              {c.plan.creditLeft > 0 ? (
                <Text style={styles.hint}>
                  Sisa titipan {formatRupiah(c.plan.creditLeft)} melebihi iuran periode ini dan tetap tersedia.
                </Text>
              ) : null}
            </Card>
          ))}
        </>
      ) : null}
      {carryError ? <Notice tone="danger">{carryError}</Notice> : null}
      {leftOut.length > 0 ? (
        <Text style={styles.hint}>
          Anggota yang punya titipan tetapi tidak dipilih:{' '}
          {leftOut.map((r) => `${nameOf(r.memberId)} (${formatRupiah(r.amount)})`).join(', ')}. Titipannya tetap tersimpan
          dan bisa dikembalikan lewat Menu {'>'} Titipan anggota.
        </Text>
      ) : null}

      {saveError ? <Notice tone="danger">{saveError}</Notice> : null}
      <Button label={saving ? 'Menyimpan...' : 'Simpan periode'} onPress={save} disabled={!canSave} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  hint: { ...type.secondary, color: colors.textSecondary },
  body: { ...type.body, color: colors.text },
  strong: { ...type.bodyStrong, color: colors.text },
  bulk: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  list: { gap: spacing.sm },
});
