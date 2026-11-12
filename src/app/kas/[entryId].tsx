import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ACCOUNT_LABELS } from '@/domain/kas';
import { useRepos } from '@/db/provider';
import { Badge } from '@/ui/components/Badge';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { CorrectionForm } from '@/ui/components/CorrectionForm';
import { ErrorState } from '@/ui/components/ErrorState';
import { ListRow, RowText } from '@/ui/components/ListRow';
import { Loading } from '@/ui/components/Loading';
import { Money } from '@/ui/components/Money';
import { Notice } from '@/ui/components/Notice';
import { SectionHeader } from '@/ui/components/SectionHeader';
import { formatDate } from '@/ui/dates';
import { createdDate, entryStatus, loanMemberOf, paidMeetingRows } from '@/ui/entryDetail';
import { formatRupiah } from '@/ui/format';
import { amountSign, correctionRoute, entryTitle, flowText, showsNoPosWarning, TYPE_LABELS, visibleNote } from '@/ui/kasLabels';
import { colors, spacing, type } from '@/ui/theme';
import { useLoad } from '@/ui/useLoad';

// Detail of one ledger entry and its correction. The ledger is append-only: "Koreksi" adds a reversal entry (the
// original stays, marked as corrected). The right entry is then re-entered through the normal form.
export default function KasEntryScreen() {
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  const repos = useRepos();

  const load = useCallback(async () => {
    const entry = await repos.ledger.getEntry(entryId);
    if (!entry) return null;
    // The other end of the correction: the entry that this one cancels, or the reversal that cancelled it.
    const relatedId = entry.reversesEntryId ?? entry.reversedById;
    const related = relatedId ? await repos.ledger.getEntry(relatedId) : null;
    // The original is the entry that was cancelled, whichever side we are looking from.
    const original = entry.type === 'reversal' ? related : entry;
    const loanMemberId = loanMemberOf(entry, original);
    const [period, member, loan, paid] = await Promise.all([
      repos.periods.getById(entry.periodId),
      entry.memberId ? repos.members.getById(entry.memberId) : Promise.resolve(null),
      loanMemberId ? repos.ledger.getLoanBalance(loanMemberId) : Promise.resolve(null),
      entry.type === 'member_payment' ? repos.payments.getByLedgerEntry(entry.id) : Promise.resolve(null),
    ]);
    return { entry, period, member, related, loan, paid };
  }, [repos, entryId]);
  const { data, error, reload } = useLoad(load);
  const [correcting, setCorrecting] = useState(false);

  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  if (!data) return <Loading />;
  if (!data.entry) return <ErrorState message="Catatan kas tidak ditemukan." />;
  const { entry, period, member, related, loan, paid } = data;

  const route = correctionRoute(entry, period?.status === 'active');
  const note = visibleNote(entry);
  const status = entryStatus(entry);
  const corrected = Boolean(entry.reversedById);
  const openEntry = (id: string) => router.push({ pathname: '/kas/[entryId]', params: { entryId: id } });
  // Chain: original first, then its reversal. Whichever one this screen shows is marked "Catatan ini".
  const original = entry.type === 'reversal' ? related : entry;
  const reversal = entry.type === 'reversal' ? entry : related;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card>
        <Badge label={status.label} tone={status.tone} />
        <Text style={[styles.title, corrected && styles.strike]}>{entryTitle(entry)}</Text>
        <Money amount={entry.amount} size="display" sign={amountSign(entry)} />
        <Text style={styles.flow}>{flowText(entry)}</Text>
      </Card>

      {showsNoPosWarning(entry) ? (
        <Notice tone="warn">
          Catatan ini belum ada tempat uangnya, jadi tidak dihitung di saldo. Catatan tidak diubah; jika perlu, koreksi lalu catat ulang dengan tempat uang yang benar.
        </Notice>
      ) : null}

      <SectionHeader title="Rincian" />
      <Card>
        <DetailRow label="Tanggal" value={formatDate(entry.date)} />
        <DetailRow label="Dicatat pada" value={formatDate(createdDate(entry.createdAt))} />
        <DetailRow label="Tempat uang" value={posText(entry)} />
        {member ? <DetailRow label="Anggota" value={member.name} /> : null}
        {entry.week !== null ? <DetailRow label="Pertemuan" value={String(entry.week)} /> : null}
        {period ? <DetailRow label="Periode" value={period.name} /> : null}
        {note ? <DetailRow label="Catatan" value={note} /> : null}
        {entry.correctionReason ? <DetailRow label="Alasan" value={entry.correctionReason} /> : null}
      </Card>

      {loan ? (
        <>
          <SectionHeader title="Sisa pinjaman" />
          <Card>
            <Text style={styles.flow}>{`Sisa pinjaman ${member?.name ?? 'anggota'} sekarang (semua periode)`}</Text>
            <Money amount={loan.remaining} size="large" tone={loan.remaining > 0 ? 'negative' : 'neutral'} />
            <DetailRow label="Dipinjam" value={formatRupiah(loan.lent)} />
            <DetailRow label="Sudah dibayar" value={formatRupiah(loan.repaid)} />
            {loan.remaining < 0 ? <Text style={styles.flow}>{`Kelebihan bayar ${formatRupiah(loan.overpaid)} (data lama).`}</Text> : null}
            <Button
              label="Buka rincian pinjaman"
              variant="secondary"
              onPress={() => router.push({ pathname: '/loans/[memberId]', params: { memberId: loan.memberId } })}
            />
          </Card>
        </>
      ) : null}

      {paid ? (
        <>
          <SectionHeader title="Pertemuan yang dibayar" />
          <Card>
            {paid.reversed ? <Notice tone="warn">Pembayaran ini sudah dikoreksi, jadi pertemuan di bawah tidak lagi terhitung lunas.</Notice> : null}
            {paidMeetingRows(paid.allocations).map((row) => (
              <View key={row.week} style={styles.detailRow}>
                <Text style={[styles.detailLabel, paid.reversed && styles.strike]}>{row.label}</Text>
                <Money amount={row.amount} size="body" tone="neutral" style={paid.reversed ? styles.strike : undefined} />
              </View>
            ))}
            {paid.allocations.length === 0 && !paid.reversed ? <Text style={styles.flow}>Tidak ada pertemuan yang dibayar.</Text> : null}
            {paid.credit > 0 ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Menjadi titipan</Text>
                <Money amount={paid.credit} size="body" tone="neutral" />
              </View>
            ) : null}
          </Card>
        </>
      ) : null}

      {related ? (
        <>
          <SectionHeader title="Riwayat koreksi" />
          <View style={styles.chain}>
            {original ? (
              <ChainRow
                title={`Catatan asli: ${TYPE_LABELS[original.type]}`}
                detail={`${formatDate(original.date)} - ${formatRupiah(original.amount)}`}
                current={original.id === entry.id}
                onPress={() => openEntry(original.id)}
              />
            ) : null}
            {reversal ? (
              <ChainRow
                title="Koreksi"
                detail={`${formatDate(reversal.date)} - Alasan: ${reversal.correctionReason ?? '-'}`}
                current={reversal.id === entry.id}
                onPress={() => openEntry(reversal.id)}
              />
            ) : null}
          </View>
        </>
      ) : null}

      {route === 'direct' && !correcting ? <Button label="Koreksi" variant="danger" onPress={() => setCorrecting(true)} /> : null}
      {route === 'direct' && correcting ? (
        <CorrectionForm
          title={`Koreksi ${TYPE_LABELS[entry.type].toLowerCase()} ${formatRupiah(entry.amount)}`}
          message="Catatan asli tidak diubah. Aplikasi menambah catatan koreksi yang membatalkan efeknya pada saldo. Setelah itu catat ulang transaksi yang benar lewat Catat kas. Koreksi tidak bisa dibatalkan."
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
      {route === 'already_corrected' ? <Text style={styles.hint}>Untuk membetulkan, catat ulang transaksi yang benar lewat Catat kas.</Text> : null}
    </ScrollView>
  );
}

function posText(entry: Parameters<typeof flowText>[0]): string {
  // Only the name of the place: the direction (in or out) is already in the card above.
  return entry.account && !entry.toAccount ? ACCOUNT_LABELS[entry.account] : flowText(entry);
}

// Label at the left, value at the right. The value wraps when long (a note), the label never shrinks.
function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function ChainRow({ title, detail, current, onPress }: { title: string; detail: string; current: boolean; onPress: () => void }) {
  return (
    <ListRow title={title} onPress={current ? undefined : onPress} right={current ? <Badge label="Catatan ini" tone="brand" /> : undefined}>
      <RowText>{detail}</RowText>
    </ListRow>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  title: { ...type.titleL, color: colors.text },
  strike: { textDecorationLine: 'line-through' },
  flow: { ...type.secondary, color: colors.textSecondary },
  hint: { ...type.secondary, color: colors.textSecondary },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md },
  detailLabel: { ...type.secondary, color: colors.textSecondary },
  detailValue: { ...type.bodyStrong, color: colors.text, flex: 1, textAlign: 'right' },
  chain: { gap: spacing.sm },
});
