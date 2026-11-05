import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ACCOUNT_LABELS } from '@/domain/kas';
import { useRepos } from '@/db/provider';
import { Button } from '@/ui/components/Button';
import { CorrectionForm } from '@/ui/components/CorrectionForm';
import { formatDate } from '@/ui/dates';
import { formatRupiah } from '@/ui/format';
import { correctionRoute, flowText, showsNoPosWarning, TYPE_LABELS, visibleNote } from '@/ui/kasLabels';
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

  if (error) return <Text style={styles.error}>{error}</Text>;
  if (!data) return <Text style={styles.muted}>Memuat...</Text>;
  const { entry, period, member, related } = data;
  if (!entry) return <Text style={styles.error}>Catatan kas tidak ditemukan.</Text>;

  const route = correctionRoute(entry, period?.status === 'active');
  const note = visibleNote(entry);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{TYPE_LABELS[entry.type]}</Text>
      <View style={styles.card}>
        <Text style={styles.amount}>{formatRupiah(entry.amount)}</Text>
        <Text>Tanggal: {formatDate(entry.date)}</Text>
        <Text>
          Pos: {flowText(entry)}
          {entry.account && !entry.toAccount ? ` (${ACCOUNT_LABELS[entry.account]})` : ''}
        </Text>
        {member ? <Text>Anggota: {member.name}</Text> : null}
        {entry.week !== null ? <Text>Pertemuan: {entry.week}</Text> : null}
        {period ? <Text>Periode: {period.name}</Text> : null}
        {note ? <Text>Catatan: {note}</Text> : null}
        {showsNoPosWarning(entry) ? (
          <Text style={styles.warn}>
            Peringatan: catatan ini tanpa pos, jadi tidak dihitung di saldo. Catatan tidak diubah; kalau perlu, koreksi lalu catat ulang dengan pos yang benar.
          </Text>
        ) : null}
        {entry.type === 'reversal' ? (
          <>
            <Text style={styles.bad}>Ini adalah koreksi{related ? ` atas "${TYPE_LABELS[related.type]}" ${formatRupiah(related.amount)}` : ''}.</Text>
            <Text>Alasan: {entry.correctionReason}</Text>
          </>
        ) : null}
        {entry.reversedById ? (
          <Text style={styles.bad}>
            Sudah dikoreksi{related ? ` pada ${formatDate(related.date)}` : ''}. Alasan: {related?.correctionReason ?? '-'}
          </Text>
        ) : null}
      </View>

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
        <Text style={styles.hint}>Catatan ini tidak bisa dikoreksi. Penghapusan tunggakan dan pengembalian kredit bersifat final.</Text>
      ) : null}
      {route === 'is_reversal' ? <Text style={styles.hint}>Koreksi tidak bisa dikoreksi lagi. Untuk membetulkan, catat ulang transaksi yang benar.</Text> : null}
      {route === 'already_corrected' ? <Text style={styles.hint}>Untuk membetulkan, catat ulang transaksi yang benar lewat menu Kas.</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  card: { padding: 16, borderRadius: 12, backgroundColor: '#f2f6f3', gap: 4 },
  amount: { fontSize: 24, fontWeight: '700' },
  hint: { color: '#666', fontSize: 13 },
  bad: { color: '#b3261e', fontWeight: '600' },
  warn: { color: '#8a4b00', backgroundColor: '#fff4e0', padding: 8, borderRadius: 6 },
  error: { padding: 16, color: '#b3261e' },
  muted: { padding: 16, color: '#666' },
});
