import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRepos } from '@/db/provider';
import { ACCOUNT_LABELS } from '@/domain/kas';
import { sortByName } from '@/domain/sort';
import type { Account, LedgerEntryType } from '@/domain/types';
import { Button } from '@/ui/components/Button';
import { Chip } from '@/ui/components/Chip';
import { ErrorState } from '@/ui/components/ErrorState';
import { Loading } from '@/ui/components/Loading';
import { SearchField } from '@/ui/components/SearchField';
import type { HistoryFilter } from '@/ui/history';
import { setHistoryFilter, useHistoryFilter } from '@/ui/historyFilterStore';
import { TYPE_LABELS } from '@/ui/kasLabels';
import { filterByQuery, shouldShowMemberSearch } from '@/ui/memberSearch';
import { colors, spacing, type } from '@/ui/theme';
import { useLoad } from '@/ui/useLoad';

const ACCOUNTS: readonly Account[] = ['tunai', 'debit', 'piutang'];
const TYPES = Object.keys(TYPE_LABELS) as LedgerEntryType[];

// Filter screen of Riwayat: Anggota (A-Z), Pos, Periode, Jenis. Each is one choice; tapping the chosen one again clears
// it. Nothing changes in Riwayat until "Terapkan". The choice is kept in historyFilterStore (the chip stays as it was).
export default function FilterRiwayatScreen() {
  const repos = useRepos();
  const current = useHistoryFilter();
  const [draft, setDraft] = useState<HistoryFilter>(current);
  // Local search word only: not part of HistoryFilter and never sent to Riwayat.
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    const [members, periods] = await Promise.all([repos.members.list(), repos.periods.list()]);
    return { members, periods };
  }, [repos]);
  const { data, error, reload } = useLoad(load);
  const members = useMemo(() => (data ? sortByName(data.members, (m) => m.name) : []), [data]);

  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  if (!data) return <Loading />;

  // Search only hides chips. The chosen member stays visible.
  const searchShown = shouldShowMemberSearch(members.length);
  const found = filterByQuery(members, (m) => m.name, searchShown ? query : '', (m) => m.id === draft.memberId);

  function pick<K extends 'memberId' | 'account' | 'periodId' | 'type'>(key: K, value: HistoryFilter[K]) {
    setDraft((d) => ({ ...d, [key]: d[key] === value ? null : value }));
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Anggota</Text>
        {searchShown ? <SearchField value={query} onChangeText={setQuery} matchCount={found.matchCount} totalCount={members.length} /> : null}
        <View style={styles.wrap}>
          {members.length === 0 ? <Text style={styles.muted}>Belum ada anggota.</Text> : null}
          {found.items.map((m) => (
            <Chip
              key={m.id}
              label={m.name}
              selected={draft.memberId === m.id}
              onPress={() => {
                pick('memberId', m.id);
                Keyboard.dismiss();
              }}
            />
          ))}
        </View>

        <Text style={styles.heading}>Tempat uang</Text>
        <View style={styles.wrap}>
          {ACCOUNTS.map((a) => (
            <Chip key={a} label={ACCOUNT_LABELS[a]} selected={draft.account === a} onPress={() => pick('account', a)} />
          ))}
        </View>

        <Text style={styles.heading}>Periode</Text>
        <View style={styles.wrap}>
          {data.periods.length === 0 ? <Text style={styles.muted}>Belum ada periode.</Text> : null}
          {data.periods.map((p) => (
            <Chip key={p.id} label={p.name} selected={draft.periodId === p.id} onPress={() => pick('periodId', p.id)} />
          ))}
        </View>

        <Text style={styles.heading}>Jenis</Text>
        <View style={styles.wrap}>
          {TYPES.map((t) => (
            <Chip key={t} label={TYPE_LABELS[t]} selected={draft.type === t} onPress={() => pick('type', t)} />
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Terapkan"
          onPress={() => {
            setHistoryFilter(draft);
            router.back();
          }}
        />
        <Button
          label="Hapus filter"
          variant="secondary"
          onPress={() => setDraft((d) => ({ ...d, memberId: null, account: null, periodId: null, type: null }))}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgCard },
  container: { padding: spacing.lg, gap: spacing.sm },
  heading: { ...type.titleM, color: colors.text, marginTop: spacing.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  muted: { ...type.body, color: colors.textSecondary },
  footer: { padding: spacing.lg, gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
});
