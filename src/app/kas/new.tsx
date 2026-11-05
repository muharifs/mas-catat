import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ACCOUNT_LABELS, KAS_KINDS, type KasEntryInput, type KasKind } from '@/domain/kas';
import { AMOUNT_FORMAT_HINT, parseRupiahInput } from '@/domain/payment-preview';
import type { Account } from '@/domain/types';
import { useRepos } from '@/db/provider';
import { AmountField } from '@/ui/components/AmountField';
import { Button } from '@/ui/components/Button';
import { TextField } from '@/ui/components/TextField';
import { formatDate, todayIso } from '@/ui/dates';
import { toIndonesian } from '@/ui/errors';
import { formatRupiah } from '@/ui/format';
import { KIND_LABELS } from '@/ui/kasLabels';
import { useLoad } from '@/ui/useLoad';

type CashPos = 'tunai' | 'debit';
type TransferDirection = 'tunai_debit' | 'debit_tunai';

const HELP: Record<KasKind, string> = {
  opening_balance: 'Saldo yang sudah ada sebelum memakai aplikasi, per pos. Isi satu kali per pos; kalau salah, koreksi lalu catat ulang.',
  transfer: 'Memindahkan uang antara Tunai dan Debit, ke dua arah. Total kas tidak berubah.',
  loan: 'Uang kas dipinjamkan ke anggota periode aktif. Tanpa bunga dan tanpa batas waktu. Masuk ke Piutang.',
  loan_repayment: 'Anggota mengembalikan pinjaman. Uangnya masuk ke Tunai dan Piutang berkurang.',
  shared_goal: 'Pengeluaran untuk tujuan bersama, misalnya tur. Catatan wajib diisi.',
};

function isKind(value: string | undefined): value is KasKind {
  return KAS_KINDS.includes(value as KasKind);
}

// One form for every kas action; the `kind` route param decides which fields appear. The saved entry is built and
// checked by the domain (buildKasEntry); this screen only collects text and shows the preview.
export default function NewKasEntryScreen() {
  const { kind: kindParam } = useLocalSearchParams<{ kind: string }>();
  const repos = useRepos();

  const load = useCallback(async () => {
    const active = await repos.periods.getActive();
    const [members, periodMembers] = await Promise.all([
      repos.members.list(),
      active ? repos.periods.getMembers(active.id) : Promise.resolve([]),
    ]);
    const ids = new Set(periodMembers.map((m) => m.memberId));
    return { active, candidates: members.filter((m) => ids.has(m.id)) };
  }, [repos]);
  const { data, error: loadError } = useLoad(load);

  const [date, setDate] = useState(todayIso());
  const [amountText, setAmountText] = useState('');
  const [openingPos, setOpeningPos] = useState<Account>('tunai');
  const [source, setSource] = useState<CashPos>('tunai');
  const [direction, setDirection] = useState<TransferDirection>('tunai_debit');
  const [memberId, setMemberId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isKind(kindParam)) return <Text style={styles.error}>Jenis catatan tidak dikenal.</Text>;
  if (loadError) return <Text style={styles.error}>{loadError}</Text>;
  if (!data) return <Text style={styles.muted}>Memuat...</Text>;
  const kind: KasKind = kindParam;
  if (!data.active) {
    return <Text style={styles.error}>Tidak ada periode aktif. Catatan kas dilekatkan ke periode aktif, jadi buat periode dulu.</Text>;
  }
  const { candidates } = data;
  const needsMember = kind === 'loan' || kind === 'loan_repayment';

  function buildInput(amount: number): KasEntryInput {
    const base = { kind, date, amount, note, memberId: needsMember ? memberId : null };
    switch (kind) {
      case 'opening_balance':
        return { ...base, account: openingPos };
      case 'transfer':
        return direction === 'tunai_debit'
          ? { ...base, account: 'tunai', toAccount: 'debit' }
          : { ...base, account: 'debit', toAccount: 'tunai' };
      case 'loan':
      case 'shared_goal':
        return { ...base, account: source };
      case 'loan_repayment':
        return base;
    }
  }

  async function save(input: KasEntryInput) {
    setBusy(true);
    try {
      await repos.ledger.recordKas(input);
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
      setError(amountText.trim().length === 0 ? 'Isi jumlah, misalnya 50000.' : AMOUNT_FORMAT_HINT);
      return;
    }
    setBusy(true);
    try {
      const input = buildInput(amount);
      const preview = await repos.ledger.previewKas(input);
      setBusy(false);
      const e = preview.entry;
      const memberName = candidates.find((m) => m.id === e.memberId)?.name;
      const lines = [
        `${KIND_LABELS[kind]} ${formatRupiah(e.amount)} pada ${formatDate(e.date)}.`,
        e.toAccount && e.account ? `${ACCOUNT_LABELS[e.account]} -> ${ACCOUNT_LABELS[e.toAccount]}` : e.account ? `Pos: ${ACCOUNT_LABELS[e.account]}` : '',
        memberName ? `Anggota: ${memberName}` : '',
        e.note ? `Catatan: ${e.note}` : '',
        `Saldo sesudahnya: Tunai ${formatRupiah(preview.after.tunai)}, Debit ${formatRupiah(preview.after.debit)}, Piutang ${formatRupiah(preview.after.piutang)}.`,
      ].filter((line) => line.length > 0);
      if (preview.negativeAccounts.length > 0) {
        lines.push(`Peringatan: saldo ${preview.negativeAccounts.map((a) => ACCOUNT_LABELS[a]).join(' dan ')} akan menjadi minus. Tetap bisa disimpan.`);
      }
      lines.push('Kalau salah, catatan ini bisa dikoreksi dari daftar kas (dengan alasan).');
      Alert.alert(`Simpan ${KIND_LABELS[kind].toLowerCase()} ${formatRupiah(e.amount)}`, lines.join('\n\n'), [
        { text: 'Batal', style: 'cancel' },
        { text: 'Simpan', onPress: () => void save(input) },
      ]);
    } catch (e) {
      setError(toIndonesian(e));
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{KIND_LABELS[kind]}</Text>
        <Text style={styles.hint}>{HELP[kind]}</Text>

        <TextField label="Tanggal (TTTT-BB-HH)" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" />
        <AmountField label="Jumlah (rupiah)" value={amountText} onChangeText={setAmountText} placeholder="50000" />

        {kind === 'opening_balance' ? (
          <PosPicker label="Pos" options={['tunai', 'debit', 'piutang']} value={openingPos} onChange={(a) => setOpeningPos(a)} />
        ) : null}

        {kind === 'transfer' ? (
          <>
            <Text style={styles.label}>Arah</Text>
            <View style={styles.row}>
              <Button label="Tunai ke Debit" variant={direction === 'tunai_debit' ? 'primary' : 'secondary'} style={styles.flex} onPress={() => setDirection('tunai_debit')} />
              <Button label="Debit ke Tunai" variant={direction === 'debit_tunai' ? 'primary' : 'secondary'} style={styles.flex} onPress={() => setDirection('debit_tunai')} />
            </View>
          </>
        ) : null}

        {kind === 'loan' || kind === 'shared_goal' ? (
          <PosPicker label="Uang keluar dari" options={['tunai', 'debit']} value={source} onChange={(a) => setSource(a as CashPos)} />
        ) : null}

        {needsMember ? (
          <>
            <Text style={styles.label}>Anggota</Text>
            {candidates.map((m) => (
              <Button key={m.id} label={m.name} variant={memberId === m.id ? 'primary' : 'secondary'} onPress={() => setMemberId(m.id)} />
            ))}
          </>
        ) : null}

        <TextField
          label={kind === 'shared_goal' ? 'Catatan (wajib)' : 'Catatan (boleh kosong)'}
          value={note}
          onChangeText={setNote}
          multiline
          numberOfLines={2}
          placeholder={kind === 'shared_goal' ? 'Contoh: DP tur ke Bali' : ''}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label="Lanjut" disabled={busy} onPress={() => void submit()} />
        <Button label="Batal" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PosPicker({ label, options, value, onChange }: { label: string; options: readonly Account[]; value: Account; onChange: (a: Account) => void }) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        {options.map((a) => (
          <Button key={a} label={ACCOUNT_LABELS[a]} variant={value === a ? 'primary' : 'secondary'} style={styles.flex} onPress={() => onChange(a)} />
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 16, gap: 12, paddingBottom: 48 },
  title: { fontSize: 22, fontWeight: '700' },
  label: { fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8 },
  hint: { color: '#666', fontSize: 13 },
  error: { color: '#b3261e' },
  muted: { padding: 16, color: '#666' },
});
