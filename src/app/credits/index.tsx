import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ACCOUNT_LABELS } from '@/domain/kas';
import { sortByName } from '@/domain/sort';
import type { RefundableCredit } from '@/db/credits';
import { useRepos } from '@/db/provider';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { DateField } from '@/ui/components/DateField';
import { ErrorState } from '@/ui/components/ErrorState';
import { Loading } from '@/ui/components/Loading';
import { Money } from '@/ui/components/Money';
import { Notice } from '@/ui/components/Notice';
import { formatDate, todayIso } from '@/ui/dates';
import { toIndonesian } from '@/ui/errors';
import { formatRupiah } from '@/ui/format';
import { toasts } from '@/ui/messages';
import { colors, spacing, type } from '@/ui/theme';
import { toast } from '@/ui/toast';
import { useLoad } from '@/ui/useLoad';

type CashPos = 'tunai' | 'debit';
const POS: readonly CashPos[] = ['tunai', 'debit'];

// Member "titipan" (code name: credit) from ended periods. It is used automatically when a new period with that
// member is created; this screen is for the member who does NOT join the next period: "Kembalikan uang" pays back ALL
// of the remaining titipan with ONE cash-out entry. The amount is never typed. A refund cannot be corrected, so the
// confirmation shows pos and date clearly.
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

  if (loadError) return <ErrorState message={loadError} onRetry={() => void reload()} />;
  if (!data) return <Loading />;
  const { items, members } = data;
  const nameOf = (memberId: string) => members.find((m) => m.id === memberId)?.name ?? '-';

  async function submit(item: RefundableCredit) {
    setError(null);
    setBusy(true);
    try {
      const preview = await repos.credits.previewRefund(item.periodId, item.memberId, date, account);
      setBusy(false);
      const lines = [
        `${nameOf(item.memberId)} menerima ${formatRupiah(preview.entry.amount)}, seluruh sisa titipan dari ${item.periodName}.`,
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
        { text: 'Kembalikan uang', style: 'destructive', onPress: () => void save(item, preview.entry.amount) },
      ]);
    } catch (e) {
      setError(toIndonesian(e));
      setBusy(false);
    }
  }

  async function save(item: RefundableCredit, amount: number) {
    setBusy(true);
    try {
      await repos.credits.refund(item.periodId, item.memberId, date, account);
      toast(toasts.refund(amount, nameOf(item.memberId)));
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
        Titipan adalah uang yang dibayar anggota melebihi iuran periodenya. Saat periode baru dibuat, titipan anggota yang
        ikut otomatis dipakai untuk iuran pertemuan terlama. Kembalikan uang hanya untuk anggota yang tidak ikut periode
        berikutnya.
      </Text>
      {items.length === 0 ? <Text style={styles.muted}>Tidak ada anggota yang memegang titipan dari periode yang sudah berakhir.</Text> : null}
      {sortByName(items, (item) => nameOf(item.memberId)).map((item) => {
        const key = `${item.periodId}:${item.memberId}`;
        const isSelected = selected !== null && `${selected.periodId}:${selected.memberId}` === key;
        return (
          <Card key={key} tone="alt">
            <Text style={styles.weekTitle}>{nameOf(item.memberId)}</Text>
            <Money amount={item.amount} size="large" />
            <Text style={styles.hint}>Titipan dari {item.periodName}</Text>
            {isSelected ? (
              <>
                <DateField label="Tanggal" value={date} onChange={setDate} maxDate={todayIso()} />
                <Text style={styles.label}>Uang keluar dari</Text>
                <View style={styles.posRow}>
                  {POS.map((a) => (
                    <Button
                      key={a}
                      label={ACCOUNT_LABELS[a]}
                      variant={account === a ? 'primary' : 'secondary'}
                      selected={account === a}
                      style={styles.flex}
                      onPress={() => setAccount(a)}
                    />
                  ))}
                </View>
                <Text style={styles.hint}>Jumlah otomatis seluruh sisa titipan, tidak bisa diketik.</Text>
                {error ? <Notice tone="danger">{error}</Notice> : null}
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
          </Card>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  flex: { flex: 1 },
  posRow: { flexDirection: 'row', gap: spacing.sm },
  weekTitle: { ...type.body, fontWeight: '600', color: colors.text },
  label: { ...type.label, color: colors.text },
  hint: { ...type.caption, color: colors.textMuted },
  muted: { ...type.body, color: colors.textMuted },
});
