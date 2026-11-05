import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { ACCOUNT_LABELS } from '@/domain/kas';
import { useRepos } from '@/db/provider';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { CorrectionForm } from '@/ui/components/CorrectionForm';
import { ErrorState } from '@/ui/components/ErrorState';
import { Loading } from '@/ui/components/Loading';
import { Money } from '@/ui/components/Money';
import { formatDate } from '@/ui/dates';
import { formatRupiah } from '@/ui/format';
import { amountSign, correctionRoute, flowText, showsNoPosWarning, TYPE_LABELS, visibleNote } from '@/ui/kasLabels';
import { colors, spacing, type } from '@/ui/theme';
import { useLoad } from '@/ui/useLoad';

// Detail of one ledger entry and its correction. The ledger is append-only: "Koreksi" adds a reversal entry (the
// original stays, marked as corrected). The right entry is then re-entered through the normal form.
export default function KasEntryScreen() {
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  const repos = useRepos();

  const load = useCallback(async () => {
    const entry = await repos.ledger.getEntry(entryId);
    if (!entry) return { entry: null, period: null, member: null, related: null };
    const [period, member, related] = await Promise.all([
      repos.periods.getById(entry.periodId),
      entry.memberId ? repos.members.getById(entry.memberId) : Promise.resolve(null),
      // The entry that this one cancels, or the reversal that cancelled it.
      entry.reversesEntryId
        ? repos.ledger.getEntry(entry.reversesEntryId)
        : entry.reversedById
          ? repos.ledger.getEntry(entry.reversedById)
          : Promise.resolve(null),
    ]);
    return { entry, period, member, related };
  }, [repos, entryId]);
  const { data, error, reload } = useLoad(load);
  const [correcting, setCorrecting] = useState(false);

  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  if (!data) return <Loading />;
  const { entry, period, member, related } = data;
  if (!entry) return <ErrorState message="Catatan kas tidak ditemukan." />;

  const route = correctionRoute(entry, period?.status === 'active');
  const note = visibleNote(entry);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{TYPE_LABELS[entry.type]}</Text>
      <Card>
        <Money amount={entry.amount} size="display" sign={amountSign(entry)} />
        <Text style={styles.body}>Tanggal: {formatDate(entry.date)}</Text>
        <Text style={styles.body}>
          Pos: {flowText(entry)}
          {entry.account && !entry.toAccount ? ` (${ACCOUNT_LABELS[entry.account]})` : ''}
        </Text>
        {member ? <Text style={styles.body}>Anggota: {member.name}</Text> : null}
        {entry.week !== null ? <Text style={styles.body}>Pertemuan: {entry.week}</Text> : null}
        {period ? <Text style={styles.body}>Periode: {period.name}</Text> : null}
        {note ? <Text style={styles.body}>Catatan: {note}</Text> : null}
        {showsNoPosWarning(entry) ? (
          <Text style={styles.warn}>
            Peringatan: catatan ini tanpa pos, jadi tidak dihitung di saldo. Catatan tidak diubah; kalau perlu, koreksi lalu catat ulang dengan pos yang benar.
          </Text>
        ) : null}
        {entry.type === 'reversal' ? (
          <>
            <Text style={styles.bad}>Ini adalah koreksi{related ? ` atas "${TYPE_LABELS[related.type]}" ${formatRupiah(related.amount)}` : ''}.</Text>
            <Text style={styles.body}>Alasan: {entry.correctionReason}</Text>
          </>
        ) : null}
        {entry.reversedById ? (
          <Text style={styles.bad}>
            Sudah dikoreksi{related ? ` pada ${formatDate(related.date)}` : ''}. Alasan: {related?.correctionReason ?? '-'}
          </Text>
        ) : null}
      </Card>

      {related ? (
        <Button
          label={entry.type === 'reversal' ? 'Lihat catatan asli' : 'Lihat koreksinya'}
          variant="secondary"
          onPress={() => router.push({ pathname: '/kas/[entryId]', params: { entryId: related.id } })}
        />
      ) : null}

      {route === 'direct' && !correcting ? <Button label="Koreksi" variant="danger" onPress={() => setCorrecting(true)} /> : null}
      {route === 'direct' && correcting ? (
        <CorrectionForm
          title={`Koreksi ${TYPE_LABELS[entry.type].toLowerCase()} ${formatRupiah(entry.amount)}`}
          message="Catatan asli tidak diubah. Aplikasi menambah catatan koreksi yang membatalkan efeknya pada saldo. Setelah itu catat ulang transaksi yang benar lewat menu Kas. Koreksi tidak bisa dibatalkan."
          onCancel={() => setCorrecting(false)}
          onSubmit={async (reason) => {
            await repos.ledger.reverseEntry(entry.id, reason);
            setCorrecting(false);
            await reload();
          }}
        />
      ) : null}

      {route === 'payment' ? (
        <>
          <Text style={styles.hint}>Pembayaran anggota dikoreksi dari halaman anggota, karena pelunasan pertemuannya ikut dibatalkan.</Text>
          {entry.memberId ? (
            <Button
              label="Buka halaman anggota"
              variant="secondary"
              onPress={() => router.push({ pathname: '/periods/[id]/members/[memberId]', params: { id: entry.periodId, memberId: entry.memberId as string } })}
            />
          ) : null}
        </>
      ) : null}
      {route === 'payout' ? (
        <>
          <Text style={styles.hint}>Pembayaran tuan rumah dan potongannya dikoreksi bersamaan dari halaman bayar tuan rumah.</Text>
          {entry.week !== null ? (
            <Button
              label="Buka halaman bayar tuan rumah"
              variant="secondary"
              onPress={() => router.push({ pathname: '/periods/[id]/payout', params: { id: entry.periodId, week: String(entry.week) } })}
            />
          ) : null}
        </>
      ) : null}
      {route === 'period_ended' ? <Text style={styles.hint}>Periode sudah berakhir, jadi catatan ini tidak bisa dikoreksi.</Text> : null}
      {route === 'not_correctable' ? (
        <Text style={styles.hint}>Catatan ini tidak bisa dikoreksi. Penghapusan tunggakan dan pengembalian titipan bersifat final.</Text>
      ) : null}
      {route === 'is_reversal' ? <Text style={styles.hint}>Koreksi tidak bisa dikoreksi lagi. Untuk membetulkan, catat ulang transaksi yang benar.</Text> : null}
      {route === 'already_corrected' ? <Text style={styles.hint}>Untuk membetulkan, catat ulang transaksi yang benar lewat menu Kas.</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  title: { ...type.title, color: colors.text },
  body: { ...type.body, color: colors.text },
  hint: { ...type.caption, color: colors.textMuted },
  bad: { ...type.body, color: colors.danger, fontWeight: '600' },
  warn: { ...type.body, color: colors.warn, backgroundColor: colors.warnSoft, padding: spacing.sm, borderRadius: 6 },
});
