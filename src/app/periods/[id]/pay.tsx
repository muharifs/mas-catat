import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { appendAmountDigits, checkPaymentAmount, deleteLastDigit, type PaymentAmountCheck } from '@/domain/amount-input';
import { AMOUNT_FORMAT_HINT, parseRupiahInput, paymentChoices, type PaymentPreview } from '@/domain/payment-preview';
import { useRepos } from '@/db/provider';
import { AmountDisplay } from '@/ui/components/AmountDisplay';
import { AmountKeypad } from '@/ui/components/AmountKeypad';
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
import { colors, ICON, spacing, type } from '@/ui/theme';
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

type AmountHelp = { text: string; tone: 'neutral' | 'error' };

/** The line under the amount. Which amounts are valid is decided by checkPaymentAmount (domain); this only words it. */
function amountHelp(check: PaymentAmountCheck, amount: number | null): AmountHelp {
  if (check === 'not_multiple') return { text: 'Jumlah harus kelipatan Rp15.000, misalnya Rp30.000.', tone: 'error' };
  if (check === 'ok' && amount !== null) return { text: `Terbaca: ${formatRupiah(amount)}`, tone: 'neutral' };
  return { text: 'Ketuk angka untuk mengisi jumlah.', tone: 'neutral' };
}

// Record-payment form. The preview and the saved result come from the same function, so what the
// confirmation says is exactly what gets stored. The quick-amount chips come from the domain (paymentChoices),
// which only offers valid amounts (positive multiples of Rp15.000).
export default function PayScreen() {
  const { id, memberId } = useLocalSearchParams<{ id: string; memberId: string }>();
  const repos = useRepos();
  const insets = useSafeAreaInsets();

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

  const check = checkPaymentAmount(typedAmount);
  const help = amountHelp(check, typedAmount);

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Catat pembayaran</Text>
        <Text style={styles.name}>{memberName}</Text>

        <DateField label="Tanggal bayar" value={date} onChange={setDate} maxDate={todayIso()} />

        <View style={styles.amountBox}>
          <AmountDisplay value={amountText} />
          <View style={styles.helpRow} accessibilityLiveRegion="polite">
            {help.tone === 'error' ? <Ionicons name="alert-circle-outline" size={ICON.sm} color={colors.error} /> : null}
            <Text style={[styles.help, help.tone === 'error' && styles.helpError]}>{help.text}</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {choices.map((c) => (
            <Chip
              key={c.kind === 'weeks' ? `w${c.weeks}` : 'arrears'}
              label={paymentChoiceLabel(c, arrearsRemainder > 0)}
              selected={typedAmount === c.amount}
              onPress={() => setAmountText(String(c.amount))}
            />
          ))}
        </ScrollView>
        {remainderNote ? <Text style={styles.hint}>{remainderNote}</Text> : null}

        <Text style={styles.hint}>Uang masuk ke Tunai. Untuk memindahkannya ke Debit, gunakan transfer di menu Kas.</Text>
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <AmountKeypad
          onKey={(key) => setAmountText((current) => appendAmountDigits(current, key))}
          onBackspace={() => setAmountText(deleteLastDigit)}
          onClear={() => setAmountText('')}
        />
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Button
          label="Lanjut"
          loading={busy}
          disabled={check !== 'ok'}
          disabledReason={check === 'empty' ? 'Isi jumlah dulu.' : 'Ubah jumlah jadi kelipatan Rp15.000.'}
          onPress={() => void submit()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing.lg, gap: spacing.md },
  title: { ...type.titleL, color: colors.text },
  name: { ...type.titleM, color: colors.text },
  amountBox: { gap: spacing.xs, paddingVertical: spacing.sm },
  helpRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  help: { ...type.secondary, color: colors.textSecondary, textAlign: 'center' },
  helpError: { color: colors.error },
  hint: { ...type.secondary, color: colors.textSecondary },
  chips: { flexDirection: 'row', gap: spacing.sm },
  bottom: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.bgPage },
});
