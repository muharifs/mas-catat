import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { appendAmountDigits, deleteLastDigit } from '@/domain/amount-input';
import { ACCOUNT_LABELS, KAS_KINDS, type KasEntryInput, type KasKind } from '@/domain/kas';
import { checkRepaymentAmount, LoanError } from '@/domain/loans';
import { AMOUNT_FORMAT_HINT, parseRupiahInput } from '@/domain/payment-preview';
import { sortByName } from '@/domain/sort';
import type { Account } from '@/domain/types';
import { useRepos } from '@/db/provider';
import { AmountDisplay } from '@/ui/components/AmountDisplay';
import { AmountKeypad } from '@/ui/components/AmountKeypad';
import { Button } from '@/ui/components/Button';
import { Chip } from '@/ui/components/Chip';
import { DateField } from '@/ui/components/DateField';
import { EmptyState } from '@/ui/components/EmptyState';
import { ErrorState } from '@/ui/components/ErrorState';
import { IconChoice } from '@/ui/components/IconChoice';
import { Loading } from '@/ui/components/Loading';
import { Notice } from '@/ui/components/Notice';
import { OptionRow } from '@/ui/components/OptionRow';
import { TextField } from '@/ui/components/TextField';
import { formatDate, todayIso } from '@/ui/dates';
import { toIndonesian } from '@/ui/errors';
import { formatRupiah } from '@/ui/format';
import { KIND_LABELS } from '@/ui/kasLabels';
import { toasts } from '@/ui/messages';
import { colors, ICON, spacing, type } from '@/ui/theme';
import { toast } from '@/ui/toast';
import { useLoad } from '@/ui/useLoad';

type CashPos = 'tunai' | 'debit';
type TransferDirection = 'tunai_debit' | 'debit_tunai';

const POS_ICONS: Record<Account, keyof typeof Ionicons.glyphMap> = {
  tunai: 'cash-outline',
  debit: 'card-outline',
  piutang: 'people-outline',
};

const HELP: Record<KasKind, string> = {
  opening_balance:
    'Saldo yang sudah ada sebelum memakai aplikasi, per tempat uang (Tunai atau Debit). Isi satu kali per tempat uang; jika salah, koreksi lalu catat ulang. Untuk Piutang (dipinjam anggota), isi satu kali per anggota yang punya pinjaman lama.',
  transfer: 'Memindahkan uang antara Tunai dan Debit, ke dua arah. Total kas tidak berubah.',
  loan: 'Uang kas dipinjamkan ke anggota periode aktif. Tanpa bunga dan tanpa batas waktu. Masuk ke Piutang.',
  loan_repayment: 'Anggota mengembalikan pinjaman. Hanya anggota yang masih punya sisa pinjaman yang muncul.',
  shared_goal: 'Pengeluaran untuk tujuan bersama, misalnya wisata. Catatan wajib diisi.',
};

const HELP_OLD_LOAN =
  'Pinjaman yang sudah ada sebelum memakai aplikasi. Pilih anggota yang meminjam; sisa pinjamannya nanti bisa dilunasi di halaman Pinjaman anggota. Jika salah, koreksi lalu catat ulang.';

function isKind(value: string | undefined): value is KasKind {
  return KAS_KINDS.includes(value as KasKind);
}

// One form for every kas action; the `kind` route param decides which fields appear. The saved entry is built and
// checked by the domain (buildKasEntry, assertRepaymentWithinLoan); this screen only collects text and shows the
// preview. An optional ?memberId= param preselects the member (from the Pinjaman screens).
export default function NewKasEntryScreen() {
  const { kind: kindParam, memberId: memberParam } = useLocalSearchParams<{ kind: string; memberId?: string }>();
  const repos = useRepos();
  const insets = useSafeAreaInsets();

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
  // The system keyboard (for the note) would cover the keypad, so the keypad hides while it is visible. On the web the
  // browser does this for you; in React Native you listen to Keyboard events yourself.
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (!isKind(kindParam)) return <ErrorState title="Jenis catatan tidak dikenal" message="Kembali ke Catat kas, lalu pilih jenis catatan dari daftar." />;
  if (loadError) return <ErrorState message={loadError} onRetry={() => void reload()} />;
  if (!data) return <Loading />;
  const kind: KasKind = kindParam;
  if (!data.hasPeriod) {
    return (
      <EmptyState
        title="Belum ada periode"
        message="Catatan kas selalu terhubung ke sebuah periode. Buat periode dulu."
        actionLabel="Buat periode"
        onAction={() => router.replace('/periods/new')}
      />
    );
  }
  if (kind === 'loan' && !data.active) {
    return (
      <EmptyState
        title="Belum ada periode aktif"
        message="Pinjaman baru hanya untuk anggota periode aktif. Buat periode dulu."
        actionLabel="Buat periode"
        onAction={() => router.replace('/periods/new')}
      />
    );
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
      setError(errorText(e, 'save'));
      setBusy(false);
    }
  }

  // The domain refuses an amount above the remaining loan; here it gets the member's name and the limit.
  function errorText(e: unknown, context: 'save' | 'preview'): string {
    if (e instanceof LoanError && e.code === 'above_remaining') {
      return `Jumlah melebihi sisa pinjaman ${picked?.name ?? ''} (${formatRupiah(e.remaining)}). Kurangi jumlah, atau ketuk Bayar lunas.`;
    }
    return toIndonesian(e, context);
  }

  async function submit() {
    setError(null);
    const amount = parseRupiahInput(amountText);
    if (amount === null) {
      setError(AMOUNT_FORMAT_HINT);
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
        e.toAccount && e.account ? `${ACCOUNT_LABELS[e.account]} ke ${ACCOUNT_LABELS[e.toAccount]}` : e.account ? `Tempat uang: ${ACCOUNT_LABELS[e.account]}` : '',
        memberName ? `Anggota: ${memberName}` : '',
        e.note ? `Catatan: ${e.note}` : '',
        ...loanLines,
        `Saldo sesudahnya: Tunai ${formatRupiah(preview.after.tunai)}, Debit ${formatRupiah(preview.after.debit)}, Piutang ${formatRupiah(preview.after.piutang)}.`,
      ].filter((line) => line.length > 0);
      if (preview.negativeAccounts.length > 0) {
        lines.push(`Peringatan: saldo ${preview.negativeAccounts.map((a) => ACCOUNT_LABELS[a]).join(' dan ')} akan menjadi minus. Tetap bisa disimpan.`);
      }
      lines.push('Jika salah, catatan ini bisa dikoreksi di tab Riwayat (dengan alasan).');
      Alert.alert(`Simpan ${kind === 'transfer' ? 'pindah saldo' : KIND_LABELS[kind].toLowerCase()} ${formatRupiah(e.amount)}?`, lines.join('\n\n'), [
        { text: 'Batal', style: 'cancel' },
        { text: 'Simpan', onPress: () => void save(input) },
      ]);
    } catch (e) {
      setError(errorText(e, 'preview'));
      setBusy(false);
    }
  }

  // Amount line and Lanjut state. The repayment rule comes from the domain (checkRepaymentAmount); this only words it.
  const typedAmount = parseRupiahInput(amountText);
  const repayCheck = kind === 'loan_repayment' && memberId ? checkRepaymentAmount(typedAmount, pickedRemaining) : null;
  const noteMissing = kind === 'shared_goal' && note.trim().length === 0;
  const block: string | null =
    typedAmount === null || typedAmount === 0
      ? 'Isi jumlah dulu.'
      : needsMember && !memberId
        ? 'Pilih anggota dulu.'
        : repayCheck === 'above_remaining'
          ? `Kurangi jumlah sampai ${formatRupiah(pickedRemaining)} atau kurang.`
          : noteMissing
            ? 'Catatan wajib diisi.'
            : null;
  const amountHelp =
    repayCheck === 'above_remaining'
      ? { text: `Jumlah melebihi sisa pinjaman ${picked?.name ?? ''} (${formatRupiah(pickedRemaining)}). Kurangi jumlah, atau ketuk Bayar lunas.`, error: true }
      : typedAmount !== null && typedAmount > 0
        ? { text: `Terbaca: ${formatRupiah(typedAmount)}`, error: false }
        : { text: 'Ketuk angka untuk mengisi jumlah.', error: false };

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

        <DateField label="Tanggal" value={date} onChange={setDate} maxDate={todayIso()} />

        {memberPicker}

        {kind === 'loan_repayment' && picked ? (
          <View style={styles.limit}>
            <Text style={styles.limitText}>
              Sisa pinjaman {picked.name}: {formatRupiah(pickedRemaining)}
            </Text>
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
          <PosChoice label="Saldo awal untuk" options={['tunai', 'debit', 'piutang']} value={openingPos} onChange={setOpeningPos} />
        ) : null}

        {kind === 'transfer' ? (
          <View style={styles.choiceGroup} accessibilityRole="radiogroup">
            <Text style={styles.label}>Arah</Text>
            <View style={styles.row}>
              <IconChoice label="Tunai ke Debit" icon="arrow-forward-outline" selected={direction === 'tunai_debit'} onPress={() => setDirection('tunai_debit')} />
              <IconChoice label="Debit ke Tunai" icon="arrow-back-outline" selected={direction === 'debit_tunai'} onPress={() => setDirection('debit_tunai')} />
            </View>
          </View>
        ) : null}

        {kind === 'loan' || kind === 'shared_goal' ? (
          <PosChoice label="Uang keluar dari" options={['tunai', 'debit']} value={source} onChange={(a) => setSource(a as CashPos)} />
        ) : null}

        <TextField
          label={kind === 'shared_goal' ? 'Catatan (wajib)' : 'Catatan (boleh kosong)'}
          value={note}
          onChangeText={setNote}
          multiline
          numberOfLines={2}
          placeholder={kind === 'shared_goal' ? 'Contoh: DP wisata ke Bali' : ''}
        />
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        {keyboardVisible ? null : (
          <View style={styles.amountBox}>
            <AmountDisplay value={amountText} />
            <View style={styles.helpRow} accessibilityLiveRegion="polite">
              {amountHelp.error ? <Ionicons name="alert-circle-outline" size={ICON.sm} color={colors.error} /> : null}
              <Text style={[styles.help, amountHelp.error && styles.helpError]}>{amountHelp.text}</Text>
            </View>
          </View>
        )}
        {keyboardVisible ? null : (
          <AmountKeypad
            onKey={(key) => {
              setAmountText((current) => appendAmountDigits(current, key));
              setError(null);
            }}
            onBackspace={() => {
              setAmountText(deleteLastDigit);
              setError(null);
            }}
            onClear={() => {
              setAmountText('');
              setError(null);
            }}
          />
        )}
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Button label="Lanjut" loading={busy} disabled={block !== null} disabledReason={block ?? undefined} onPress={() => void submit()} />
      </View>
    </KeyboardAvoidingView>
  );
}

function PosChoice({ label, options, value, onChange }: { label: string; options: readonly Account[]; value: Account; onChange: (a: Account) => void }) {
  return (
    <View style={styles.choiceGroup} accessibilityRole="radiogroup">
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        {options.map((a) => (
          <IconChoice key={a} label={ACCOUNT_LABELS[a]} icon={POS_ICONS[a]} selected={value === a} onPress={() => onChange(a)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing.lg, gap: spacing.md },
  // Sits in the fixed bottom block right above the keypad, so the typed amount stays visible with a long member list.
  amountBox: { gap: spacing.xs },
  helpRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  help: { ...type.secondary, color: colors.textSecondary, textAlign: 'center' },
  helpError: { color: colors.error },
  choiceGroup: { gap: spacing.sm },
  bottom: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.bgPage },
  title: { ...type.titleL, color: colors.text },
  label: { ...type.label, color: colors.text },
  row: { flexDirection: 'row', gap: spacing.sm },
  hint: { ...type.secondary, color: colors.textSecondary },
  limit: { gap: spacing.xs },
  limitText: { ...type.label, color: colors.textSecondary },
  chipRow: { flexDirection: 'row' },
  emptyTitle: { ...type.titleM, textAlign: 'center', color: colors.text },
  emptyBody: { ...type.body, textAlign: 'center', color: colors.textSecondary },
});
