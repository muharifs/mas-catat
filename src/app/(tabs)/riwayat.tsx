import { router } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { showMessage } from '@/ui/dialog';
import type { LedgerListItem } from '@/db/ledger';
import { useDatabaseControl, useRepos } from '@/db/provider';
import { monthOfDate, summarizeMonth } from '@/domain/flow';
import { Card } from '@/ui/components/Card';
import { Chip } from '@/ui/components/Chip';
import { EmptyState } from '@/ui/components/EmptyState';
import { ErrorState } from '@/ui/components/ErrorState';
import { HistoryRow } from '@/ui/components/HistoryRow';
import { Loading } from '@/ui/components/Loading';
import { Money } from '@/ui/components/Money';
import { MonthSwitcher } from '@/ui/components/MonthSwitcher';
import { formatDate, todayIso } from '@/ui/dates';
import { activeFilterCount, filterHistory, GROUP_CHIPS, groupByDate, isFilterEmpty, SUMMARY_NOTE_FULL, SUMMARY_NOTE_SHORT, type DateSection } from '@/ui/history';
import {
  resetHistoryFilter,
  resetHistoryMonth,
  setHistoryFilter,
  setHistoryMonth,
  useHistoryFilter,
  useHistoryMonth,
} from '@/ui/historyFilterStore';
import { shiftMonth } from '@/ui/months';
import { colors, ICON, MIN_TOUCH, radius, spacing, type } from '@/ui/theme';
import { useLoad } from '@/ui/useLoad';

// Riwayat: kas entries of ONE month (month switcher), a summary card (Pemasukan / Pengeluaran of that month), type chips
// and a Filter screen, then one card per day (newest first). Entries come from repos.ledger.listKas(); the summary is
// summarizeMonth (src/domain/flow.ts) and follows the MONTH only, never the chips or Filter. No daily totals.
// The list is a FlatList of day groups, not a SectionList: a SectionList cannot wrap a whole section in one card.
// The list reloads every time this tab gets focus (useLoad uses useFocusEffect).
export default function RiwayatScreen() {
  const repos = useRepos();
  const { dataVersion } = useDatabaseControl();
  const filter = useHistoryFilter();
  const month = useHistoryMonth();

  // A restore or "Mulai dari nol" remounts the app; a filter from before it could point at people that no longer exist.
  useEffect(() => {
    resetHistoryFilter();
    resetHistoryMonth();
  }, [dataVersion]);

  const load = useCallback(async () => {
    const [entries, members] = await Promise.all([repos.ledger.listKas(), repos.members.list()]);
    return { entries, members };
  }, [repos]);
  const { data, error, reload } = useLoad(load);

  const view = useMemo(() => {
    if (!data) return null;
    const inMonth = data.entries.filter((e) => monthOfDate(e.date) === month);
    const visible = filterHistory(inMonth, filter);
    return {
      monthCount: inMonth.length,
      // All entries go in, not only this month: a correction made in another month cancels its original here.
      summary: summarizeMonth(data.entries, month),
      sections: groupByDate(visible, todayIso()),
      byId: new Map(data.entries.map((e) => [e.id, e])),
      names: new Map(data.members.map((m) => [m.id, m.name])),
    };
  }, [data, filter, month]);

  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  if (!data || !view) return <Loading />;

  const filterCount = activeFilterCount(filter);
  const clearAll = () => resetHistoryFilter();
  const currentMonth = todayIso().slice(0, 7);
  const { moneyIn, moneyOut } = view.summary;

  const controls = (
    <View style={styles.controls}>
      <MonthSwitcher
        month={month}
        onPrevious={() => setHistoryMonth(shiftMonth(month, -1))}
        onNext={() => setHistoryMonth(shiftMonth(month, 1))}
        nextDisabled={month >= currentMonth}
      />
      <Card>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCol}>
            <Text maxFontSizeMultiplier={1.3} style={styles.summaryLabel}>
              Pemasukan
            </Text>
            <Money amount={moneyIn} size="large" sign={moneyIn > 0 ? '+' : ''} fit />
          </View>
          <View style={styles.summaryCol}>
            <Text maxFontSizeMultiplier={1.3} style={styles.summaryLabel}>
              Pengeluaran
            </Text>
            <Money amount={moneyOut} size="large" sign={moneyOut > 0 ? '-' : ''} fit />
          </View>
        </View>
        <View style={styles.noteRow}>
          <Text style={[styles.summaryNote, styles.noteText]}>{SUMMARY_NOTE_SHORT}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Selengkapnya tentang ringkasan"
            onPress={() => showMessage('Ringkasan bulan ini', SUMMARY_NOTE_FULL)}
            style={styles.moreLink}
          >
            <Text maxFontSizeMultiplier={1.3} style={styles.clearLabel}>
              Selengkapnya
            </Text>
          </Pressable>
        </View>
        {!isFilterEmpty(filter) ? (
          <Text style={styles.summaryNote}>Ringkasan memuat semua catatan bulan ini. Daftar di bawah sedang difilter.</Text>
        ) : null}
      </Card>
      <View style={styles.filterRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={filterCount > 0 ? `Filter (${filterCount})` : 'Filter'}
          onPress={() => router.push('/filter-riwayat')}
          style={({ pressed }) => [styles.filterButton, pressed && styles.filterButtonPressed]}
        >
          <Ionicons name="options-outline" size={ICON.sm} color={colors.brandStrong} />
          <Text maxFontSizeMultiplier={1.3} style={styles.filterLabel}>
            {filterCount > 0 ? `Filter (${filterCount})` : 'Filter'}
          </Text>
        </Pressable>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chips}>
          <Chip label="Semua" selected={filter.group === null} onPress={() => setHistoryFilter({ ...filter, group: null })} />
          {GROUP_CHIPS.map((c) => (
            <Chip key={c.group} label={c.label} selected={filter.group === c.group} onPress={() => setHistoryFilter({ ...filter, group: c.group })} />
          ))}
        </ScrollView>
      </View>
      {!isFilterEmpty(filter) ? (
        <View style={styles.clearRow}>
          <Text style={[styles.summaryNote, styles.noteText]}>Filter aktif ({filterCount + (filter.group !== null ? 1 : 0)})</Text>
          <Pressable accessibilityRole="button" onPress={clearAll} style={styles.clearLink}>
            <Text maxFontSizeMultiplier={1.3} style={styles.clearLabel}>
              Hapus filter
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  const empty =
    data.entries.length === 0 ? (
      <EmptyState title="Belum ada catatan" message="Catatan iuran, tuan rumah, dan kas akan muncul di sini." />
    ) : view.monthCount === 0 ? (
      <EmptyState title="Belum ada catatan di bulan ini" message="Pilih bulan lain dengan tombol panah di atas." />
    ) : (
      <EmptyState
        title="Tidak ada catatan yang cocok"
        message="Coba pilih jenis lain atau hapus filter."
        actionLabel="Hapus filter"
        onAction={clearAll}
      />
    );

  return (
    <FlatList
      data={view.sections}
      keyExtractor={(section) => section.date}
      contentContainerStyle={styles.list}
      ListHeaderComponent={data.entries.length > 0 ? controls : undefined}
      ListEmptyComponent={empty}
      renderItem={({ item: section }) => <DayCard section={section} byId={view.byId} names={view.names} />}
      ItemSeparatorComponent={Separator}
    />
  );
}

interface DayCardProps {
  section: DateSection;
  byId: ReadonlyMap<string, LedgerListItem>;
  names: ReadonlyMap<string, string>;
}

// One card per day: bold day name (plus the date when the name is not the date itself), then flat rows split by hairlines.
function DayCard({ section, byId, names }: DayCardProps) {
  const fullDate = formatDate(section.date);
  return (
    <View style={styles.dayCard}>
      <View style={styles.dayHeader}>
        <Text accessibilityRole="header" style={styles.dayTitle}>
          {section.title}
        </Text>
        {section.title !== fullDate ? <Text style={styles.dayDate}>{fullDate}</Text> : null}
      </View>
      {section.data.map((e) => (
        <View key={e.id} style={styles.dayRow}>
          <HistoryRow flat entry={e} byId={byId} memberName={e.memberId ? (names.get(e.memberId) ?? '') : ''} />
        </View>
      ))}
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xl },
  controls: { gap: spacing.sm, marginBottom: spacing.md },
  // Chips scroll to the screen edge: the negative margin cancels the list padding, paddingRight keeps 16dp after the last chip.
  chips: { gap: spacing.sm, paddingRight: spacing.lg },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  filterButton: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.brandStrong,
    backgroundColor: colors.bgCard,
  },
  filterButtonPressed: { backgroundColor: colors.brandTint },
  filterLabel: { ...type.label, color: colors.brandStrong },
  chipScroll: { flex: 1, marginRight: -spacing.lg },
  clearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  noteText: { flex: 1, flexShrink: 1 },
  moreLink: { minHeight: MIN_TOUCH, justifyContent: 'center', paddingHorizontal: spacing.sm },
  clearLink: { minHeight: MIN_TOUCH, justifyContent: 'center', paddingLeft: spacing.sm },
  clearLabel: { ...type.label, color: colors.brandStrong },
  summaryRow: { flexDirection: 'row', gap: spacing.lg },
  summaryCol: { flex: 1, gap: spacing.xs },
  summaryLabel: { ...type.label, color: colors.textSecondary },
  summaryNote: { ...type.secondary, color: colors.textSecondary },
  dayCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.divider,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  dayHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: spacing.sm, paddingVertical: spacing.sm },
  dayTitle: { ...type.titleM, color: colors.text },
  dayDate: { ...type.secondary, color: colors.textSecondary },
  dayRow: { borderTopWidth: 1, borderTopColor: colors.divider },
  separator: { height: spacing.md },
});
