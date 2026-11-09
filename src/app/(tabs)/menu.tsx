import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { backupReminder } from '@/domain/backup';
import { useRepos } from '@/db/provider';
import { Dot } from '@/ui/components/Badge';
import { ErrorState } from '@/ui/components/ErrorState';
import { Loading } from '@/ui/components/Loading';
import { readLastShared } from '@/ui/shareFile';
import { colors, ICON, radius, spacing, type } from '@/ui/theme';
import { useLoad } from '@/ui/useLoad';

type IconName = ComponentProps<typeof Ionicons>['name'];

const ROW_HEIGHT = 56;

interface MenuRowProps {
  label: string;
  icon: IconName;
  onPress: () => void;
  /** Warning dot after the label; this text goes into the accessibility label so the dot is not the only signal. */
  warning?: string;
}

function MenuRow({ label, icon, onPress, warning }: MenuRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={warning ? `${label}. ${warning}` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={ICON.md} color={colors.brandStrong} />
      <Text style={styles.rowLabel}>{label}</Text>
      {warning ? <Dot tone="error" /> : null}
      <View style={styles.spacer} />
      <Ionicons name="chevron-forward" size={ICON.md} color={colors.textSecondary} />
    </Pressable>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      {children}
    </View>
  );
}

// Menu tab: the way to every screen that is not one of the other three tabs. Only navigation, no money here.
export default function MenuScreen() {
  const repos = useRepos();

  const load = useCallback(async () => {
    const [members, period, kasEntries] = await Promise.all([repos.members.list(), repos.periods.getActive(), repos.ledger.listKas()]);
    // Same rule as the reminder on Beranda: nothing to remind about while the database holds no data.
    const reminder = backupReminder(readLastShared(), new Date(), members.length > 0 || kasEntries.length > 0);
    return { activePeriodId: period?.id ?? null, backupLate: reminder.due };
  }, [repos]);
  const { data, error, reload } = useLoad(load);

  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  if (!data) return <Loading />;
  const { activePeriodId, backupLate } = data;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Group title="Kelompok">
        <MenuRow label="Anggota" icon="people-outline" onPress={() => router.push('/members')} />
        <MenuRow label="Periode" icon="calendar-outline" onPress={() => router.push('/periods')} />
        {activePeriodId ? (
          <MenuRow
            label="Jadwal periode"
            icon="calendar-number-outline"
            onPress={() => router.push({ pathname: '/periods/[id]', params: { id: activePeriodId } })}
          />
        ) : null}
        <MenuRow label="Titipan anggota" icon="wallet-outline" onPress={() => router.push('/credits')} />
        <MenuRow label="Pinjaman anggota" icon="swap-horizontal-outline" onPress={() => router.push('/loans')} />
      </Group>
      <Group title="Kas">
        <MenuRow label="Catat kas" icon="create-outline" onPress={() => router.push('/kas')} />
      </Group>
      <Group title="Data">
        <MenuRow
          label="Cadangan dan ekspor"
          icon="cloud-upload-outline"
          warning={backupLate ? 'Cadangan terlambat' : undefined}
          onPress={() => router.push('/backup')}
        />
      </Group>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.xl },
  group: { gap: spacing.xs },
  groupTitle: { ...type.label, color: colors.textSecondary, marginBottom: spacing.xs },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.bgMute,
  },
  pressed: { opacity: 0.75 },
  rowLabel: { ...type.body, color: colors.text },
  spacer: { flex: 1 },
});
