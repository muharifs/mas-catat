import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AMOUNT_FORMAT_HINT, parseRupiahInput, paymentChoices, type PaymentPreview } from '@/domain/payment-preview';
import { useRepos } from '@/db/provider';
import { AmountField } from '@/ui/components/AmountField';
import { Button } from '@/ui/components/Button';
import { Chip } from '@/ui/components/Chip';
import { DateField } from '@/ui/components/DateField';
import { ErrorState } from '@/ui/components/ErrorState';
import { Loading } from '@/ui/components/Loading';
import { Notice } from '@/ui/components/Notice';
import { formatDate, todayIso } from '@/ui/dates';
import { toIndonesian } from '@/ui/errors';
import { formatRupiah } from '@/ui/format';
import { arrearsRemainderNote, describeWeeks, paymentChoiceLabel, toasts } from '@/ui/messages';
import { colors, spacing, type } from '@/ui/theme';
import { toast } from '@/ui/toast';
import { useLoad } from '@/ui/useLoad';

// Member dues always go into Tunai. Moving money to Debit is a transfer on the Kas screen.
const RECEIVING_ACCOUNT = 'tunai';

/** Confirmation text. Every number comes from the preview; nothing is calculated here. */
function confirmMessage(name: string, date: string, preview: PaymentPreview): string {
  const lines = [`${name} membayar ${formatRupiah(preview.amount)} pada ${formatDate(date)}, masuk ke Tunai.`];
  if (preview.weekCount > 0) lines.push(`Menyentuh ${preview.weekCount} pertemuan.`);
  if (preview.settledWeeks.length > 0) lines.push(`Akan melunasi ${describeWeeks(preview.settledWeeks)}.`);
  if (preview.partialWeek !== null) lines.push(`Pertemuan ${preview.partialWeek} baru terbayar sebagian.`);
  if (preview.creditAmount > 0) {
    lines.push(
      preview.allocatedAmount === 0
        ? `Seluruh pembayaran ini (${formatRupiah(preview.creditAmount)}) menjadi titipan anggota karena semua pertemuan sudah lunas.`
        : `${formatRupiah(preview.creditAmount)} dari pembayaran ini menjadi titipan anggota.`,
    );
  }
  lines.push('Kalau salah, pembayaran bisa dikoreksi dari halaman anggota (dengan alasan).');
  return lines.join('\n\n');
}

// Record-payment form. The preview and the saved result come from the same function, so what the
// confirmation says is exactly what gets stored. The quick-amount chips come from the domain (paymentChoices),
// which only offers valid amounts (positive multiples of Rp15.000).
export default function PayScreen() {
  const { id, memberId } = useLocalSearchParams<{ id: string; memberId: string }>();
  const repos = useRepos();

  const load = useCallback(async () => {
    const [member, balances] = await Promise.all([repos.members.getById(memberId), repos.payments.listBalances(id)]);
    return { member, arrears: balances.find((b) => b.memberId === memberId)?.arrears ?? 0 };
  }, [repos, id, memberId]);
  const { data, error: loadError, reload } = useLoad(load);

  const [date, setDate] = useState(todayIso());
  const [amountText, setAmountText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loadError) return <ErrorState message={loadError} onRetry={() => void reload()} />;
  if (!data) return <Loading />;
  if (!data.member) return <ErrorState message="Anggota tidak ditemukan." />;
  const memberName = data.member.name;
  const { choices, arrearsRemainder } = paymentChoices(data.arrears);
  const typedAmount = parseRupiahInput(amountText);
  const remainderNote = arrearsRemainderNote(arrearsRemainder);

  async function save(amount: number) {
    setBusy(true);
    try {
      await repos.payments.record({ periodId: id, memberId, date, amount, account: RECEIVING_ACCOUNT });
      toast(toasts.payment(amount, memberName));
      router.back(); // back to wherever the form was opened from (the payment list or the member detail)
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
          ? `Sebagian menjadi titipan - ${formatRupiah(preview.amount)}`
          : `Konfirmasi pembayaran ${formatRupiah(preview.amount)}`,
        confirmMessage(memberName, date, preview),
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

        <DateField label="Tanggal bayar" value={date} onChange={setDate} />

        <Text style={styles.label}>Pilih jumlah cepat</Text>
        <View style={styles.chips}>
          {choices.map((c) => (
            <Chip
              key={c.kind === 'weeks' ? `w${c.weeks}` : 'arrears'}
              label={paymentChoiceLabel(c, arrearsRemainder > 0)}
              selected={typedAmount === c.amount}
              onPress={() => setAmountText(String(c.amount))}
            />
          ))}
        </View>
        {remainderNote ? <Text style={styles.hint}>{remainderNote}</Text> : null}
        <AmountField label="Jumlah (kelipatan Rp15.000)" value={amountText} onChangeText={setAmountText} placeholder="15000" />

        <Text style={styles.hint}>Uang masuk ke Tunai. Untuk memindahkannya ke Debit, gunakan transfer di menu Kas.</Text>

        {error ? <Notice tone="danger">{error}</Notice> : null}

        <Button label="Lanjut" disabled={busy} onPress={() => void submit()} />
        <Button label="Batal" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  title: { ...type.title, color: colors.text },
  name: { ...type.heading, color: colors.text },
  label: { ...type.label, color: colors.text },
  hint: { ...type.caption, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
