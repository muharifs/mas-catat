import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { appendAmountDigits, deleteLastDigit } from '@/domain/amount-input';
import type { StoredCountLine } from '@/domain/cash-count';
import { ACCOUNT_LABELS } from '@/domain/kas';
import { useRepos } from '@/db/provider';
import { AmountDisplay } from '@/ui/components/AmountDisplay';
import { AmountKeypad } from '@/ui/components/AmountKeypad';
import { Badge } from '@/ui/components/Badge';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { DateField } from '@/ui/components/DateField';
import { EmptyState } from '@/ui/components/EmptyState';
import { ErrorState } from '@/ui/components/ErrorState';
import { Loading } from '@/ui/components/Loading';
import { Money } from '@/ui/components/Money';
import { Notice } from '@/ui/components/Notice';
import { SectionHeader } from '@/ui/components/SectionHeader';
import { TextField } from '@/ui/components/TextField';
import {
  COUNT_STRINGS,
  countToast,
  differenceLabel,
  hintAction,
  HINT_TEXT,
  hintsForCount,
  lineSpoken,
  parseCountInput,
  resultSummary,
  type HintTarget,
} from '@/ui/cashCount';
import { formatDate, todayIso } from '@/ui/dates';
import { formatRupiah } from '@/ui/format';
import { toIndonesian } from '@/ui/errors';
import { colors, MIN_TOUCH, radius, spacing, type } from '@/ui/theme';
import { toast } from '@/ui/toast';
import { useLoad } from '@/ui/useLoad';

type Field = 'tunai' | 'debit';

interface Result {
  week: number;
  date: string;
  lines: StoredCountLine[];
}

// Cek kas: count the physical Tunai (and optionally Debit) and compare with the ledger. A count is only a record: it
// never changes kas. The amounts are typed on the same keypad as payments, but any amount of 0 or more is allowed
// (no multiple of Rp15.000 rule here).
export default function CashCountScreen() {
  const repos = useRepos();
  const load = useCallback(async () => {
    const period = await repos.periods.getActive();
    const form = period ? await repos.cashCounts.form(period.id) : null;
    return { period, form };
  }, [repos]);
  const { data, error: loadError, reload } = useLoad(load);

  const [pickedWeek, setPickedWeek] = useState<number | null>(null);
  const [date, setDate] = useState(todayIso());
  const [active, setActive] = useState<Field>('tunai');
  const [tunaiText, setTunaiText] = useState('');
  const [tunaiTouched, setTunaiTouched] = useState(false);
  const [debitChecked, setDebitChecked] = useState(false);
  const [debitText, setDebitText] = useState('');
  const [debitTouched, setDebitTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  if (loadError) return <ErrorState message={loadError} onRetry={() => void reload()} />;
  if (!data) return <Loading />;
  const { period, form } = data;
  if (!period || !form || form.defaultWeek === null) {
    return (
      <EmptyState
        title={COUNT_STRINGS.resultNone}
        message={COUNT_STRINGS.resultNoneMessage}
        actionLabel={period ? COUNT_STRINGS.history : undefined}
        onAction={period ? () => router.push({ pathname: '/periods/[id]/cek-kas', params: { id: period.id } }) : undefined}
      />
    );
  }
  const periodId = period.id;
  const week = pickedWeek ?? form.defaultWeek;
  const memberCount = form.memberCount;

  function press(key: Parameters<typeof appendAmountDigits>[1]) {
    setError(null);
    if (active === 'tunai') {
      setTunaiTouched(true);
      setTunaiText((t) => appendAmountDigits(t, key));
    } else {
      setDebitTouched(true);
      setDebitText((t) => appendAmountDigits(t, key));
    }
  }
  function backspace() {
    // Emptying the field by backspace means "not typed": the owner must press 0 to count zero (no silent Rp0).
    if (active === 'tunai') {
      const next = deleteLastDigit(tunaiText);
      setTunaiText(next);
      if (next === '') setTunaiTouched(false);
    } else {
      const next = deleteLastDigit(debitText);
      setDebitText(next);
      if (next === '') setDebitTouched(false);
    }
  }
  function clear() {
    if (active === 'tunai') {
      setTunaiText('');
      setTunaiTouched(false);
    } else {
      setDebitText('');
      setDebitTouched(false);
    }
  }
  function toggleDebit() {
    setDebitChecked((c) => !c);
    setDebitText('');
    setDebitTouched(false);
    setActive(debitChecked ? 'tunai' : 'debit');
  }

  async function save() {
    const parsed = parseCountInput({ tunaiText, tunaiTouched, debitChecked, debitTouched, debitText });
    if (parsed.error || parsed.tunai === null) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const lines = await repos.cashCounts.save({ periodId, week, date, tunai: parsed.tunai, debit: parsed.debit, note });
      toast(countToast(resultSummary(lines).clean));
      setResult({ week, date, lines });
    } catch (e) {
      setError(toIndonesian(e, 'cash_count'));
    } finally {
      setBusy(false);
    }
  }

  function go(target: HintTarget) {
    if (target.kind === 'payments') router.push({ pathname: '/periods/[id]/payments', params: { id: periodId } });
    else if (target.kind === 'payout') router.push({ pathname: '/periods/[id]/payout', params: { id: periodId, week: String(week) } });
    else router.push({ pathname: '/kas/new', params: { kind: target.entryKind } });
  }

  if (result) {
    const summary = resultSummary(result.lines);
    const posHints = hintsForCount(result.lines, memberCount);
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Hasil cek kas: Pertemuan {result.week}</Text>
        <Text style={styles.muted}>{formatDate(result.date)}</Text>
        {result.lines.map((line) => {
          const d = differenceLabel(line.difference);
          return (
            <Card key={line.account}>
              <View accessible accessibilityLabel={lineSpoken(line)} style={styles.resultBlock}>
                <Text style={styles.cardTitle}>{ACCOUNT_LABELS[line.account]}</Text>
                <Text style={styles.body}>Menurut catatan: {formatRupiah(line.expected)}</Text>
                <Text style={styles.body}>Hasil hitung: {formatRupiah(line.counted)}</Text>
                <Badge label={d.text} tone={d.tone} />
              </View>
            </Card>
          );
        })}
        {result.lines.length === 1 ? <Text style={styles.muted}>{COUNT_STRINGS.debitSkipped}.</Text> : null}
        {summary.clean ? (
          <Notice tone="info">{summary.notice}</Notice>
        ) : (
          <>
            <Notice tone="warn" title={COUNT_STRINGS.differenceTitle}>
              {summary.notice}
            </Notice>
            <SectionHeader title={COUNT_STRINGS.causesTitle} />
            <Text style={styles.muted}>{COUNT_STRINGS.causesIntro}</Text>
            {posHints.map((p) => (
              <Card key={p.account} tone="alt">
                <Text style={styles.cardTitle}>{ACCOUNT_LABELS[p.account]}: {differenceLabel(p.difference).text}</Text>
                {p.hints.map((h) => {
                  const action = hintAction(h);
                  return (
                    <View key={h} style={styles.hint}>
                      <Text style={styles.body}>{HINT_TEXT[h]}</Text>
                      <Button label={action.label} variant="secondary" onPress={() => go(action.target)} />
                    </View>
                  );
                })}
              </Card>
            ))}
          </>
        )}
        <Button label={COUNT_STRINGS.done} onPress={() => router.back()} />
        <Button
          label={COUNT_STRINGS.recount}
          variant="secondary"
          onPress={() => {
            setResult(null);
            setTunaiText('');
            setTunaiTouched(false);
            setDebitText('');
            setDebitTouched(false);
            setActive('tunai');
            void reload(); // fresh expected balances for the next count
          }}
        />
      </ScrollView>
    );
  }

  const tunaiReady = tunaiTouched;
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Notice tone="info">{COUNT_STRINGS.intro}</Notice>

        <Text style={styles.label}>Pertemuan</Text>
        {form.countableWeeks.length > 1 ? (
          <View style={styles.row}>
            {form.countableWeeks.map((n) => (
              <Button
                key={n}
                label={`Pertemuan ${n}`}
                variant={week === n ? 'primary' : 'secondary'}
                selected={week === n}
                style={styles.flex}
                onPress={() => setPickedWeek(n)}
              />
            ))}
          </View>
        ) : (
          <Text style={styles.body}>Pertemuan {week}</Text>
        )}
        <Text style={styles.muted}>
          {form.countableWeeks[0] === week ? `Pertemuan ${week}: sedang berjalan` : `Pertemuan ${week}: sudah ditutup`}
        </Text>

        <DateField label="Tanggal hitung" value={date} onChange={setDate} maxDate={todayIso()} />

        <Card tone="alt">
          <Text style={styles.cardTitle}>{COUNT_STRINGS.expectedTitle}</Text>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.label}>Tunai</Text>
              <Money amount={form.expected.tunai} size="large" />
            </View>
            <View style={styles.flex}>
              <Text style={styles.label}>Debit</Text>
              <Money amount={form.expected.debit} size="large" />
            </View>
          </View>
          <Text style={styles.muted}>{COUNT_STRINGS.expectedHelp}</Text>
        </Card>

        <AmountColumn
          label={COUNT_STRINGS.tunaiLabel}
          value={tunaiText}
          selected={active === 'tunai'}
          onPress={() => setActive('tunai')}
        />
        {debitChecked ? (
          <AmountColumn
            label={COUNT_STRINGS.debitLabel}
            value={debitText}
            selected={active === 'debit'}
            onPress={() => setActive('debit')}
          />
        ) : (
          <Text style={styles.muted}>{COUNT_STRINGS.debitSkipped}</Text>
        )}
        <Button
          label={debitChecked ? COUNT_STRINGS.debitSkipButton : COUNT_STRINGS.debitCheckButton}
          variant="tertiary"
          onPress={toggleDebit}
        />

        <AmountKeypad onKey={press} onBackspace={backspace} onClear={clear} />

        <TextField label={COUNT_STRINGS.noteLabel} value={note} onChangeText={setNote} placeholder={COUNT_STRINGS.notePlaceholder} maxLength={200} />

        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Button
          label={COUNT_STRINGS.save}
          loading={busy}
          disabled={!tunaiReady}
          disabledReason={tunaiReady ? undefined : COUNT_STRINGS.tunaiMissing}
          onPress={() => void save()}
        />
        <Button
          label={COUNT_STRINGS.history}
          variant="secondary"
          onPress={() => router.push({ pathname: '/periods/[id]/cek-kas', params: { id: periodId } })}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function AmountColumn({ label, value, selected, onPress }: { label: string; value: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, sedang ${selected ? 'diisi' : 'tidak dipilih'}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.column, selected && styles.columnActive]}
    >
      <Text style={styles.label}>{label}</Text>
      <AmountDisplay value={value} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  title: { ...type.titleL, color: colors.text },
  cardTitle: { ...type.titleM, color: colors.text },
  label: { ...type.label, color: colors.textSecondary },
  body: { ...type.body, color: colors.text },
  muted: { ...type.body, color: colors.textSecondary },
  resultBlock: { gap: spacing.xs },
  hint: { gap: spacing.sm, marginTop: spacing.xs },
  column: {
    minHeight: MIN_TOUCH + 8,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgCard,
    gap: spacing.xs,
  },
  columnActive: { borderColor: colors.brand },
});
