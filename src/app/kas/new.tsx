import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ACCOUNT_LABELS, KAS_KINDS, type KasEntryInput, type KasKind } from '@/domain/kas';
import { LoanError } from '@/domain/loans';
import { AMOUNT_FORMAT_HINT, parseRupiahInput } from '@/domain/payment-preview';
import { sortByName } from '@/domain/sort';
import type { Account } from '@/domain/types';
import { useRepos } from '@/db/provider';
import { AmountField } from '@/ui/components/AmountField';
import { Button } from '@/ui/components/Button';
import { Chip } from '@/ui/components/Chip';
import { DateField } from '@/ui/components/DateField';
import { ErrorState } from '@/ui/components/ErrorState';
import { Loading } from '@/ui/components/Loading';
import { Notice } from '@/ui/components/Notice';
import { OptionRow } from '@/ui/components/OptionRow';
import { TextField } from '@/ui/components/TextField';
import { formatDate, todayIso } from '@/ui/dates';
import { toIndonesian } from '@/ui/errors';
import { formatRupiah } from '@/ui/format';
import { KIND_LABELS } from '@/ui/kasLabels';
import { toasts } from '@/ui/messages';
import { colors, spacing, type } from '@/ui/theme';
import { toast } from '@/ui/toast';
import { useLoad } from '@/ui/useLoad';

type CashPos = 'tunai' | 'debit';
type TransferDirection = 'tunai_debit' | 'debit_tunai';

const HELP: Record<KasKind, string> = {
  opening_balance:
    'Saldo yang sudah ada sebelum memakai aplikasi, per pos. Isi satu kali per pos; kalau salah, koreksi lalu catat ulang. Untuk Piutang, isi satu kali per anggota yang punya pinjaman lama.',
  transfer: 'Memindahkan uang antara Tunai dan Debit, ke dua arah. Total kas tidak berubah.',
  loan: 'Uang kas dipinjamkan ke anggota periode aktif. Tanpa bunga dan tanpa batas waktu. Masuk ke Piutang.',
  loan_repayment: 'Anggota mengembalikan pinjaman. Hanya anggota yang masih punya sisa pinjaman yang muncul.',
  shared_goal: 'Pengeluaran untuk tujuan bersama, misalnya tur. Catatan wajib diisi.',
};

const HELP_OLD_LOAN =
  'Pinjaman yang sudah ada sebelum memakai aplikasi. Pilih anggota yang meminjam; sisa pinjamannya nanti bisa dilunasi dari layar Kas. Kalau salah, koreksi lalu catat ulang.';

function isKind(value: string | undefined): value is KasKind {
  return KAS_KINDS.includes(value as KasKind);
}

// One form for every kas action; the `kind` route param decides which fields appear. The saved entry is built and
// checked by the domain (buildKasEntry, assertRepaymentWithinLoan); this screen only collects text and shows the
// preview. An optional ?memberId= param preselects the member (from the Pinjaman screens).
export default function NewKasEntryScreen() {
  const { kind: kindParam, memberId: memberParam } = useLocalSearchParams<{ kind: string; memberId?: string }>();
  const repos = useRepos();

  const load = useCallback(async () => {
    const [active, periods] = await Promise.all([repos.periods.getActive(), repos.periods.list()]);
    const [members, periodMembers, loans] = await Promise.all([
      repos.members.list(),
      active ? repos.periods.getMembers(active.id) : Promise.resolve([]),
      repos.ledger.listLoanBalances(),
    ]);
    const ids = new Set(periodMembers.map((m) => m.memberId));
    // A new loan is only for members of the active period. A repayment is only for members who still owe something
    // (the repository attaches it to the active period, or to the latest period the member was in).
    const remainingById = new Map(loans.members.map((l) => [l.memberId, l.remaining]));
    return {
      active,
      hasPeriod: periods.length > 0,
      loanCandidates: members.filter((m) => ids.has(m.id)),
      repayCandidates: members.filter((m) => (remainingById.get(m.id) ?? 0) > 0),
      remainingById,
      allMembers: members,
    };
  }, [repos]);
  const { data, error: loadError, reload } = useLoad(load);

  const [date, setDate] = useState(todayIso());
  const [amountText, setAmountText] = useState('');
  const [openingPos, setOpeningPos] = useState<Account>('tunai');
  const [source, setSource] = useState<CashPos>('tunai');
  const [direction, setDirection] = useState<TransferDirection>('tunai_debit');
  const [pickedId, setPickedId] = useState<string | null>(memberParam ?? null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isKind(kindParam)) return <ErrorState message="Jenis catatan tidak dikenal." />;
  if (loadError) return <ErrorState message={loadError} onRetry={() => void reload()} />;
  if (!data) return <Loading />;
  const kind: KasKind = kindParam;
  if (!data.hasPeriod) {
    return <ErrorState message="Belum ada periode. Catatan kas dilekatkan ke sebuah periode, jadi buat periode dulu." />;
  }
  if (kind === 'loan' && !data.active) {
    return <ErrorState message="Pinjaman baru hanya untuk anggota periode aktif, dan sekarang tidak ada periode aktif." />;
  }
  const oldLoan = kind === 'opening_balance' && openingPos === 'piutang';
  const needsMember = kind === 'loan' || kind === 'loan_repayment' || oldLoan;
  const pool = kind === 'loan' ? data.loanCandidates : kind === 'loan_repayment' ? data.repayCandidates : data.allMembers;
  const candidates = sortByName(pool, (m) => m.name); // display order only
  // A ?memberId= param preselects the member, but only when he is a valid choice for this form.
  const memberId = candidates.some((m) => m.id === pickedId) ? pickedId : null;
  const picked = candidates.find((m) => m.id === memberId) ?? null;
  const pickedRemaining = memberId ? (data.remainingById.get(memberId) ?? 0) : 0;

  if (kind === 'loan_repayment' && candidates.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.emptyTitle}>Tidak ada pinjaman yang belum lunas</Text>
        <Text style={styles.emptyBody}>
          Pelunasan hanya bisa dicatat untuk anggota yang masih meminjam. Catat pinjaman dulu bila ada anggota yang meminjam.
        </Text>
        {data.active ? (
          <Button label="Catat pinjaman baru" onPress={() => router.replace({ pathname: '/kas/new', params: { kind: 'loan' } })} />
        ) : (
          <Text style={styles.hint}>Pinjaman baru hanya bisa dicatat saat ada periode aktif, dan sekarang tidak ada periode aktif.</Text>
        )}
        <Button label="Kembali" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    );
  }

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
      toast(toasts.kas(KIND_LABELS[kind], input.amount));
      router.back();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  // The domain refuses an amount above the remaining loan; here it gets the member's name and the limit.
  function errorText(e: unknown): string {
    if (e instanceof LoanError && e.code === 'above_remaining') {
      return `Jumlah melebihi sisa pinjaman ${picked?.name ?? ''} (${formatRupiah(e.remaining)}). Kurangi jumlah, atau ketuk Bayar lunas.`;
    }
    return toIndonesian(e);
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
      const loanLines =
        preview.loanRemainingBefore !== null && preview.loanRemainingAfter !== null
          ? [`Sisa pinjaman ${memberName ?? ''} sebelum: ${formatRupiah(preview.loanRemainingBefore)}\nSesudah: ${formatRupiah(preview.loanRemainingAfter)}`]
          : [];
      const lines = [
        `${KIND_LABELS[kind]} ${formatRupiah(e.amount)} pada ${formatDate(e.date)}.`,
        e.toAccount && e.account ? `${ACCOUNT_LABELS[e.account]} -> ${ACCOUNT_LABELS[e.toAccount]}` : e.account ? `Pos: ${ACCOUNT_LABELS[e.account]}` : '',
        memberName ? `Anggota: ${memberName}` : '',
        e.note ? `Catatan: ${e.note}` : '',
        ...loanLines,
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
      setError(errorText(e));
      setBusy(false);
    }
  }

  const memberPicker = needsMember ? (
    <>
      <Text style={styles.label}>{oldLoan ? 'Anggota yang meminjam' : 'Anggota'}</Text>
      {candidates.map((m) => (
        <OptionRow
          key={m.id}
          mode="radio"
          label={m.name}
          trailing={kind === 'loan_repayment' ? `Sisa ${formatRupiah(data.remainingById.get(m.id) ?? 0)}` : undefined}
          selected={memberId === m.id}
          onPress={() => {
            setPickedId(m.id);
            setError(null);
          }}
        />
      ))}
    </>
  ) : null;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{KIND_LABELS[kind]}</Text>
        <Text style={styles.hint}>{oldLoan ? HELP_OLD_LOAN : HELP[kind]}</Text>

        {kind === 'loan_repayment' ? memberPicker : null}

        <DateField label="Tanggal" value={date} onChange={setDate} />
        <AmountField
          label="Jumlah (rupiah)"
          value={amountText}
          onChangeText={(t) => {
            setAmountText(t);
            setError(null);
          }}
          placeholder="50000"
        />
        {kind === 'loan_repayment' && picked ? (
          <View style={styles.limit}>
            <Text style={styles.limitText}>Maksimal {formatRupiah(pickedRemaining)}</Text>
            <View style={styles.chipRow}>
              <Chip
                label={`Bayar lunas ${formatRupiah(pickedRemaining)}`}
                onPress={() => {
                  setAmountText(String(pickedRemaining));
                  setError(null);
                }}
              />
            </View>
          </View>
        ) : null}

        {kind === 'opening_balance' ? (
          <PosPicker label="Pos" options={['tunai', 'debit', 'piutang']} value={openingPos} onChange={(a) => setOpeningPos(a)} />
        ) : null}

        {kind === 'transfer' ? (
          <>
            <Text style={styles.label}>Arah</Text>
            <View style={styles.row}>
              <Button label="Tunai ke Debit" variant={direction === 'tunai_debit' ? 'primary' : 'secondary'} selected={direction === 'tunai_debit'} style={styles.flex} onPress={() => setDirection('tunai_debit')} />
              <Button label="Debit ke Tunai" variant={direction === 'debit_tunai' ? 'primary' : 'secondary'} selected={direction === 'debit_tunai'} style={styles.flex} onPress={() => setDirection('debit_tunai')} />
            </View>
          </>
        ) : null}

        {kind === 'loan' || kind === 'shared_goal' ? (
          <PosPicker label="Uang keluar dari" options={['tunai', 'debit']} value={source} onChange={(a) => setSource(a as CashPos)} />
        ) : null}

        {kind === 'loan_repayment' ? null : memberPicker}

        <TextField
          label={kind === 'shared_goal' ? 'Catatan (wajib)' : 'Catatan (boleh kosong)'}
          value={note}
          onChangeText={setNote}
          multiline
          numberOfLines={2}
          placeholder={kind === 'shared_goal' ? 'Contoh: DP tur ke Bali' : ''}
        />

        {error ? <Notice tone="danger">{error}</Notice> : null}
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
          <Button key={a} label={ACCOUNT_LABELS[a]} variant={value === a ? 'primary' : 'secondary'} selected={value === a} style={styles.flex} onPress={() => onChange(a)} />
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  title: { ...type.title, color: colors.text },
  label: { ...type.label, color: colors.text },
  row: { flexDirection: 'row', gap: spacing.sm },
  hint: { ...type.caption, color: colors.textMuted },
  limit: { gap: spacing.xs },
  limitText: { ...type.label, color: colors.textMuted },
  chipRow: { flexDirection: 'row' },
  emptyTitle: { ...type.heading, textAlign: 'center', color: colors.text },
  emptyBody: { ...type.body, textAlign: 'center', color: colors.textMuted },
});
