import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ACCOUNT_LABELS } from '@/domain/kas';
import type { RefundableCredit } from '@/db/credits';
import { useRepos } from '@/db/provider';
import { Button } from '@/ui/components/Button';
import { TextField } from '@/ui/components/TextField';
import { formatDate, todayIso } from '@/ui/dates';
import { toIndonesian } from '@/ui/errors';
import { formatRupiah } from '@/ui/format';
import { useLoad } from '@/ui/useLoad';

type CashPos = 'tunai' | 'debit';
const POS: readonly CashPos[] = ['tunai', 'debit'];

// Member credit from ended periods. It is used automatically when a new period with that member is created; this
// screen is for the member who does NOT join the next period: "Kembalikan uang" pays back ALL of the remaining
// credit with ONE cash-out entry. The amount is never typed. A refund cannot be corrected, so the confirmation shows
// pos and date clearly.
export default function CreditsScreen() {
  const repos = useRepos();

  const load = useCallback(async () => {
    const [items, members] = await Promise.all([repos.credits.listRefundable(), repos.members.list()]);
    return { items, members };
  }, [repos]);
  const { data, error: loadError, reload } = useLoad(load);

  const [selected, setSelected] = useState<RefundableCredit | null>(null);
  const [date, setDate] = useState(todayIso());
  const [account, setAccount] = useState<CashPos>('tunai');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loadError) return <Text style={styles.error}>{loadError}</Text>;
  if (!data) return <Text style={styles.muted}>Memuat...</Text>;
  const { items, members } = data;
  const nameOf = (memberId: string) => members.find((m) => m.id === memberId)?.name ?? '-';

  async function submit(item: RefundableCredit) {
    setError(null);
    setBusy(true);
    try {
      const preview = await repos.credits.previewRefund(item.periodId, item.memberId, date, account);
      setBusy(false);
      const lines = [
        `${nameOf(item.memberId)} menerima ${formatRupiah(preview.entry.amount)}, seluruh sisa kredit dari ${item.periodName}.`,
        `Uang keluar dari: ${ACCOUNT_LABELS[account]}`,
        `Tanggal: ${formatDate(date)}`,
        `Saldo ${ACCOUNT_LABELS[account]} sesudahnya: ${formatRupiah(preview.after[account])}.`,
      ];
      if (preview.negativeAccounts.length > 0) {
        lines.push(`Peringatan: saldo ${ACCOUNT_LABELS[account]} akan menjadi minus. Tetap bisa disimpan.`);
      }
      lines.push('Pengembalian ini TIDAK bisa dikoreksi atau dibatalkan. Periksa pos dan tanggalnya.');
      Alert.alert(`Kembalikan uang ${formatRupiah(preview.entry.amount)}`, lines.join('\n\n'), [
        { text: 'Batal', style: 'cancel' },
        { text: 'Kembalikan uang', style: 'destructive', onPress: () => void save(item) },
      ]);
    } catch (e) {
      setError(toIndonesian(e));
      setBusy(false);
    }
  }

  async function save(item: RefundableCredit) {
    setBusy(true);
    try {
      await repos.credits.refund(item.periodId, item.memberId, date, account);
      setSelected(null);
      setBusy(false);
      await reload();
    } catch (e) {
      setError(toIndonesian(e));
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.hint}>
        Kredit adalah uang yang dibayar anggota melebihi iuran periodenya. Saat periode baru dibuat, kredit anggota yang
        ikut otomatis dipakai untuk iuran pertemuan terlama. Kembalikan uang hanya untuk anggota yang tidak ikut periode
        berikutnya.
      </Text>
      {items.length === 0 ? <Text style={styles.muted}>Tidak ada anggota yang memegang kredit dari periode yang sudah berakhir.</Text> : null}
      {items.map((item) => {
        const key = `${item.periodId}:${item.memberId}`;
        const isSelected = selected !== null && `${selected.periodId}:${selected.memberId}` === key;
        return (
          <View key={key} style={styles.row}>
            <Text style={styles.weekTitle}>{nameOf(item.memberId)}</Text>
            <Text>
              Kredit {formatRupiah(item.amount)} dari {item.periodName}
            </Text>
            {isSelected ? (
              <>
                <TextField label="Tanggal (TTTT-BB-HH)" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" />
                <Text style={styles.label}>Uang keluar dari</Text>
                <View style={styles.posRow}>
                  {POS.map((a) => (
                    <Button key={a} label={ACCOUNT_LABELS[a]} variant={account === a ? 'primary' : 'secondary'} style={styles.flex} onPress={() => setAccount(a)} />
                  ))}
                </View>
                <Text style={styles.hint}>Jumlah otomatis seluruh sisa kredit, tidak bisa diketik.</Text>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Button label="Lanjut" disabled={busy} onPress={() => void submit(item)} />
                <Button label="Batal" variant="secondary" onPress={() => setSelected(null)} />
              </>
            ) : (
              <Button
                label="Kembalikan uang"
                variant="secondary"
                onPress={() => {
                  setError(null);
                  setSelected(item);
                }}
              />
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10, paddingBottom: 48 },
  row: { padding: 12, borderRadius: 8, backgroundColor: '#f7f7f7', gap: 8 },
  flex: { flex: 1 },
  posRow: { flexDirection: 'row', gap: 8 },
  weekTitle: { fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '600' },
  hint: { color: '#666', fontSize: 13 },
  error: { color: '#b3261e' },
  muted: { color: '#666' },
});
