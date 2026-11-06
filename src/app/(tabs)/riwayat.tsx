import { router } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';
import { useDatabaseControl, useRepos } from '@/db/provider';
import { Button } from '@/ui/components/Button';
import { Chip } from '@/ui/components/Chip';
import { EmptyState } from '@/ui/components/EmptyState';
import { ErrorState } from '@/ui/components/ErrorState';
import { HistoryRow } from '@/ui/components/HistoryRow';
import { Loading } from '@/ui/components/Loading';
import { todayIso } from '@/ui/dates';
import { activeFilterCount, filterHistory, GROUP_CHIPS, groupByDate, isFilterEmpty } from '@/ui/history';
import { resetHistoryFilter, setHistoryFilter, useHistoryFilter } from '@/ui/historyFilterStore';
import { colors, spacing, type } from '@/ui/theme';
import { useLoad } from '@/ui/useLoad';

// Riwayat: every kas entry, grouped by date (newest first), with type chips and a Filter screen. Entries come from
// repos.ledger.listKas(); grouping and filtering are pure functions in src/ui/history.ts. No totals are shown.
// The list reloads every time this tab gets focus (useLoad uses useFocusEffect).
export default function RiwayatScreen() {
  const repos = useRepos();
  const { dataVersion } = useDatabaseControl();
  const filter = useHistoryFilter();

  // A restore or "Mulai dari nol" remounts the app; a filter from before it could point at people that no longer exist.
  useEffect(() => {
    resetHistoryFilter();
  }, [dataVersion]);

  const load = useCallback(async () => {
    const [entries, members] = await Promise.all([repos.ledger.listKas(), repos.members.list()]);
    return { entries, members };
  }, [repos]);
  const { data, error, reload } = useLoad(load);

  const view = useMemo(() => {
    if (!data) return null;
    const visible = filterHistory(data.entries, filter);
    return {
      sections: groupByDate(visible, todayIso()),
      byId: new Map(data.entries.map((e) => [e.id, e])),
      names: new Map(data.members.map((m) => [m.id, m.name])),
    };
  }, [data, filter]);

  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  if (!data || !view) return <Loading />;

  const filterCount = activeFilterCount(filter);
  const clearAll = () => resetHistoryFilter();

  const controls = (
    <View style={styles.controls}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label="Semua" selected={filter.group === null} onPress={() => setHistoryFilter({ ...filter, group: null })} />
        {GROUP_CHIPS.map((c) => (
          <Chip key={c.group} label={c.label} selected={filter.group === c.group} onPress={() => setHistoryFilter({ ...filter, group: c.group })} />
        ))}
      </ScrollView>
      <View style={styles.filterRow}>
        <Button
          label={filterCount > 0 ? `Filter (${filterCount})` : 'Filter'}
          variant="secondary"
          compact
          onPress={() => router.push('/filter-riwayat')}
        />
        {!isFilterEmpty(filter) ? <Button label="Hapus filter" variant="secondary" compact onPress={clearAll} /> : null}
      </View>
    </View>
  );

  const empty =
    data.entries.length === 0 ? (
      <EmptyState title="Belum ada catatan" message="Catatan iuran, tuan rumah, dan kas akan muncul di sini." />
    ) : (
      <EmptyState
        title="Tidak ada catatan yang cocok"
        message="Coba pilih jenis lain atau hapus filter."
        actionLabel="Hapus filter"
        onAction={clearAll}
      />
    );

  return (
    <SectionList
      sections={view.sections}
      keyExtractor={(e) => e.id}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={styles.list}
      ListHeaderComponent={data.entries.length > 0 ? controls : undefined}
      ListEmptyComponent={empty}
      renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
      renderItem={({ item: e }) => <HistoryRow entry={e} byId={view.byId} memberName={e.memberId ? (view.names.get(e.memberId) ?? '') : ''} />}
      ItemSeparatorComponent={Separator}
    />
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xl },
  controls: { gap: spacing.sm, marginBottom: spacing.xs },
  chips: { gap: spacing.sm },
  filterRow: { flexDirection: 'row', gap: spacing.sm },
  sectionTitle: { ...type.heading, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  separator: { height: spacing.sm },
});
