import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AMOUNT_FORMAT_HINT, parseRupiahInput, type PaymentPreview } from '@/domain/payment-preview';
import { useRepos } from '@/db/provider';
import { AmountField } from '@/ui/components/AmountField';
import { Button } from '@/ui/components/Button';
import { TextField } from '@/ui/components/TextField';
import { formatDate, todayIso } from '@/ui/dates';
import { toIndonesian } from '@/ui/errors';
import { formatRupiah } from '@/ui/format';
import { useLoad } from '@/ui/useLoad';

type Account = 'tunai' | 'debit';
const ACCOUNT_LABEL: Record<Account, string> = { tunai: 'Tunai', debit: 'Debit' };

/** "pertemuan 2", "pertemuan 1 sampai 3", or "pertemuan 1, 3" when the meetings are not consecutive. */
function describeWeeks(weeks: readonly number[]): string {
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  if (first === undefined || last === undefined) return '';
  if (weeks.length === 1) return `pertemuan ${first}`;
  const consecutive = last - first + 1 === weeks.length;
  return consecutive ? `pertemuan ${first} sampai ${last}` : `pertemuan ${weeks.join(', ')}`;
}

/** Confirmation text. Every number comes from the preview; nothing is calculated here. */
function confirmMessage(name: string, date: string, account: Account, preview: PaymentPreview): string {
  const lines = [`${name} membayar ${formatRupiah(preview.amount)} pada ${formatDate(date)}, masuk ke ${ACCOUNT_LABEL[account]}.`];
  if (preview.weekCount > 0) lines.push(`Menyentuh ${preview.weekCount} pertemuan.`);
  if (preview.settledWeeks.length > 0) lines.push(`Akan melunasi ${describeWeeks(preview.settledWeeks)}.`);
  if (preview.partialWeek !== null) lines.push(`Pertemuan ${preview.partialWeek} baru terbayar sebagian.`);
  if (preview.creditAmount > 0) {
    lines.push(
      preview.allocatedAmount === 0
        ? `Seluruh pembayaran ini (${formatRupiah(preview.creditAmount)}) menjadi kredit anggota karena semua pertemuan sudah lunas.`
        : `${formatRupiah(preview.creditAmount)} dari pembayaran ini menjadi kredit anggota.`,
    );
  }
  lines.push('Kalau salah, pembayaran bisa dikoreksi dari halaman anggota (dengan alasan).');
  return lines.join('\n\n');
}

// Record-payment form. The preview and the saved result come from the same function, so what the
// confirmation says is exactly what gets stored.
export default function PayScreen() {
  const { id, memberId } = useLocalSearchParams<{ id: string; memberId: string }>();
  const repos = useRepos();

  const load = useCallback(async () => repos.members.getById(memberId), [repos, memberId]);
  const { data: member, error: loadError } = useLoad(load);

  const [date, setDate] = useState(todayIso());
  const [amountText, setAmountText] = useState('');
  const [account, setAccount] = useState<Account>('tunai');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loadError) return <Text style={styles.error}>{loadError}</Text>;
  if (!member) return <Text style={styles.muted}>Memuat...</Text>;
  const memberName = member.name;

  async function save(amount: number) {
    setBusy(true);
    try {
      await repos.payments.record({ periodId: id, memberId, date, amount, account });
      router.back();
    } catch (e) {
      setError(toIndonesian(e));
      setBusy(false);
    }
  }

  async function submit() {
    setError(null);
    const amount = parseRupiahInput(amountText);
    if (amount === null) {
      setError(amountText.trim().length === 0 ? 'Isi jumlah pembayaran, misalnya 15000.' : AMOUNT_FORMAT_HINT);
      return;
    }
    setBusy(true);
    try {
      const preview = await repos.payments.preview({ periodId: id, memberId, date, amount });
      setBusy(false);
      Alert.alert(
        preview.creditAmount > 0
          ? `Sebagian menjadi kredit - ${formatRupiah(preview.amount)}`
          : `Konfirmasi pembayaran ${formatRupiah(preview.amount)}`,
        confirmMessage(memberName, date, account, preview),
        [
          { text: 'Batal', style: 'cancel' },
          { text: 'Simpan', onPress: () => void save(amount) },
        ],
      );
    } catch (e) {
      setError(toIndonesian(e));
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Catat pembayaran</Text>
        <Text style={styles.name}>{memberName}</Text>

        <TextField label="Tanggal bayar (TTTT-BB-HH)" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" />
        <AmountField label="Jumlah (kelipatan Rp15.000)" value={amountText} onChangeText={setAmountText} placeholder="15000" />

        <Text style={styles.label}>Uang masuk ke</Text>
        <View style={styles.accounts}>
          {(['tunai', 'debit'] as const).map((a) => (
            <Button
              key={a}
              label={ACCOUNT_LABEL[a]}
              variant={account === a ? 'primary' : 'secondary'}
              style={styles.flex}
              onPress={() => setAccount(a)}
            />
          ))}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button label="Lanjut" disabled={busy} onPress={() => void submit()} />
        <Button label="Batal" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 16, gap: 12, paddingBottom: 48 },
  title: { fontSize: 22, fontWeight: '700' },
  name: { fontSize: 16, fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '600' },
  accounts: { flexDirection: 'row', gap: 8 },
  error: { color: '#b3261e' },
  muted: { padding: 16, color: '#666' },
});
