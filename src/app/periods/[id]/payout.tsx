import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ACCOUNT_LABELS } from '@/domain/kas';
import type { PayoutPreview } from '@/domain/payout';
import { useRepos } from '@/db/provider';
import { Button } from '@/ui/components/Button';
import { CorrectionForm } from '@/ui/components/CorrectionForm';
import { TextField } from '@/ui/components/TextField';
import { formatDate, todayIso } from '@/ui/dates';
import { toIndonesian } from '@/ui/errors';
import { formatRupiah } from '@/ui/format';
import { useLoad } from '@/ui/useLoad';

type PayAccount = 'tunai' | 'debit';
const ACCOUNTS: readonly PayAccount[] = ['tunai', 'debit'];

/** Confirmation text. Every number comes from the preview (domain); nothing is calculated here. */
function confirmMessage(hostName: string, week: number, date: string, p: PayoutPreview): string {
  const lines = [
    `${hostName} menerima ${formatRupiah(p.payout)} untuk pertemuan ${week} pada ${formatDate(date)}, dari ${ACCOUNT_LABELS[p.account]}.`,
  ];
  if (p.offset > 0) {
    lines.push(`Tunggakan ${hostName} ${formatRupiah(p.offset)} dipotong dan dicatat sebagai entri terpisah.`);
    lines.push(`Uang yang benar-benar keluar dari ${ACCOUNT_LABELS[p.account]}: ${formatRupiah(p.netCash)}.`);
  }
  if (p.remainingDebt > 0) lines.push(`Sisa tunggakan ${formatRupiah(p.remainingDebt)} tetap tercatat sebagai utang.`);
  lines.push('Kalau salah, pembayaran ini bisa dikoreksi dari layar ini (dengan alasan).');
  return lines.join('\n\n');
}

// Pay the host of one meeting (week param) and, when the host has debt, offset it as a separate entry.
// Also shows an already paid meeting and lets the owner correct it (payout + offset are reversed together).
export default function PayoutScreen() {
  const { id, week: weekParam } = useLocalSearchParams<{ id: string; week: string }>();
  const week = Number(weekParam);
  const repos = useRepos();

  const load = useCallback(async () => {
    const [period, meeting, members, paid] = await Promise.all([
      repos.periods.getById(id),
      repos.weeks.get(id, week),
      repos.members.list(),
      repos.ledger.getWeekPayout(id, week),
    ]);
    return { period, meeting, members, paid };
  }, [repos, id, week]);
  const { data, error: loadError, reload } = useLoad(load);

  const [date, setDate] = useState(todayIso());
  const [account, setAccount] = useState<PayAccount>('tunai');
  const [preview, setPreview] = useState<PayoutPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [correcting, setCorrecting] = useState(false);

  const alreadyPaid = Boolean(data?.paid);
  const loaded = data !== null;

  // Recompute the preview whenever the date or pos changes. useEffect is the React hook you know from the web;
  // here the "server" is the local SQLite file, so the call is just an async function.
  useEffect(() => {
    if (!loaded || alreadyPaid) return;
    let cancelled = false;
    repos.ledger.previewHostPayout(id, week, date, account).then(
      (p) => {
        if (cancelled) return;
        setPreview(p);
        setPreviewError(null);
      },
      (e: unknown) => {
        if (cancelled) return;
        setPreview(null);
        setPreviewError(toIndonesian(e));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [repos, id, week, date, account, loaded, alreadyPaid]);

  if (loadError) return <Text style={styles.error}>{loadError}</Text>;
  if (!data) return <Text style={styles.muted}>Memuat...</Text>;
  const { period, meeting, members, paid } = data;
  if (!period || !meeting) return <Text style={styles.error}>Pertemuan tidak ditemukan.</Text>;
  const hostName = members.find((m) => m.id === meeting.hostMemberId)?.name ?? 'Belum ditentukan';
  const active = period.status === 'active';

  async function save() {
    if (!preview) return;
    setBusy(true);
    try {
      await repos.ledger.settleHost(id, week, date, account);
      router.back();
    } catch (e) {
      setError(toIndonesian(e));
      setBusy(false);
    }
  }

  function ask() {
    if (!preview) return;
    setError(null);
    const warned = preview.kasShort || preview.accountShort;
    Alert.alert(
      `Bayar tuan rumah ${formatRupiah(preview.payout)}`,
      confirmMessage(hostName, week, date, preview) +
        (warned ? '\n\nPeringatan: saldo kas kurang, lihat pesan merah di layar. Tetap bisa disimpan.' : ''),
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Bayar', onPress: () => void save() },
      ],
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Bayar tuan rumah</Text>
        <Text style={styles.name}>
          Pertemuan {meeting.number} ({formatDate(meeting.date)}) - {hostName}
        </Text>

        {paid ? (
          <View style={styles.card}>
            <Text style={styles.ok}>Sudah dibayar</Text>
            <Text>
              Tanggal {formatDate(paid.payout.date)}, dari {paid.payout.account ? ACCOUNT_LABELS[paid.payout.account] : 'tanpa pos'}
            </Text>
            <Text>Dibayarkan ke tuan rumah: {formatRupiah(paid.payout.amount)}</Text>
            {paid.offset ? <Text>Potongan tunggakan: {formatRupiah(paid.offset.amount)}</Text> : <Text style={styles.muted}>Tidak ada potongan tunggakan.</Text>}
            {active && !correcting ? (
              <Button label="Koreksi pembayaran tuan rumah" variant="secondary" onPress={() => setCorrecting(true)} />
            ) : null}
            {!active ? <Text style={styles.muted}>Periode sudah berakhir, koreksi tidak bisa dilakukan.</Text> : null}
            {correcting ? (
              <CorrectionForm
                title="Koreksi pembayaran tuan rumah"
                message="Pembayaran tuan rumah dan potongannya dibatalkan sekaligus. Tunggakan tuan rumah kembali belum lunas. Setelah itu tuan rumah bisa dibayar ulang dengan data yang benar. Koreksi tidak bisa dibatalkan."
                submitLabel="Koreksi pembayaran"
                onCancel={() => setCorrecting(false)}
                onSubmit={async (reason) => {
                  await repos.ledger.reverseHostPayout(id, week, reason);
                  setCorrecting(false);
                  await reload();
                }}
              />
            ) : null}
          </View>
        ) : !active ? (
          <Text style={styles.muted}>Periode sudah berakhir. Tuan rumah tidak bisa dibayar lagi.</Text>
        ) : (
          <>
            <TextField label="Tanggal bayar (TTTT-BB-HH)" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" />

            <Text style={styles.label}>Uang keluar dari</Text>
            <View style={styles.accounts}>
              {ACCOUNTS.map((a) => (
                <Button
                  key={a}
                  label={ACCOUNT_LABELS[a]}
                  variant={account === a ? 'primary' : 'secondary'}
                  style={styles.flex}
                  onPress={() => setAccount(a)}
                />
              ))}
            </View>

            {previewError ? <Text style={styles.error}>{previewError}</Text> : null}

            {preview ? (
              <View style={styles.card}>
                <Text style={styles.label}>Rincian</Text>
                <Text>Pembayaran penuh ke tuan rumah: {formatRupiah(preview.payout)}</Text>
                {preview.offsetWeeks.length > 0 ? (
                  <>
                    <Text>Potongan tunggakan tuan rumah: {formatRupiah(preview.offset)}</Text>
                    {preview.offsetWeeks.map((w) => (
                      <Text key={w.week} style={styles.muted}>
                        - pertemuan {w.week}: {formatRupiah(w.amount)}
                      </Text>
                    ))}
                  </>
                ) : (
                  <Text style={styles.muted}>Tuan rumah tidak punya tunggakan, tidak ada potongan.</Text>
                )}
                <Text style={styles.strong}>
                  Uang keluar bersih dari {ACCOUNT_LABELS[preview.account]}: {formatRupiah(preview.netCash)}
                </Text>
                <Text>Sisa tunggakan setelah potongan: {formatRupiah(preview.remainingDebt)}</Text>
                <Text style={styles.muted}>
                  Saldo sekarang: {ACCOUNT_LABELS[preview.account]} {formatRupiah(preview.accountBefore)}, Tunai + Debit {formatRupiah(preview.kasBefore)}
                </Text>

                {preview.kasShort ? (
                  <Text style={styles.warn}>
                    Peringatan: Tunai + Debit ({formatRupiah(preview.kasBefore)}) lebih kecil dari uang keluar bersih {formatRupiah(preview.netCash)}.
                    Pembayaran penuh ke tuan rumah {formatRupiah(preview.payout)}, dipotong tunggakan {formatRupiah(preview.offset)}. Tetap bisa
                    disimpan.
                  </Text>
                ) : null}
                {preview.accountShort ? (
                  <Text style={styles.warn}>
                    Peringatan: saldo {ACCOUNT_LABELS[preview.account]} ({formatRupiah(preview.accountBefore)}) lebih kecil dari uang keluar bersih{' '}
                    {formatRupiah(preview.netCash)}, jadi saldo {ACCOUNT_LABELS[preview.account]} akan menjadi minus. Tetap bisa disimpan; pindahkan
                    saldo dulu kalau perlu.
                  </Text>
                ) : null}
              </View>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button label="Lanjut" disabled={busy || !preview} onPress={ask} />
            <Button label="Batal" variant="secondary" onPress={() => router.back()} />
          </>
        )}
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
  strong: { fontWeight: '700' },
  accounts: { flexDirection: 'row', gap: 8 },
  card: { padding: 12, borderRadius: 8, backgroundColor: '#f2f6f3', gap: 6 },
  ok: { color: '#1f6f50', fontWeight: '700', fontSize: 16 },
  warn: { color: '#8a4b00', backgroundColor: '#fff4e0', padding: 8, borderRadius: 6 },
  error: { color: '#b3261e' },
  muted: { color: '#666' },
});
