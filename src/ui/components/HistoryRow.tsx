import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LedgerListItem } from '@/db/ledger';
import type { LedgerEntryType } from '@/domain/types';
import { entryDirection, historyFlowText, reversalTitle } from '../history';
import { entryTitle, showsNoPosWarning, visibleNote } from '../kasLabels';
import { colors, MIN_TOUCH, radius, spacing, type } from '../theme';
import { Money } from './Money';

type IconName = ComponentProps<typeof Ionicons>['name'];

const ICON_BOX = 40;

const TYPE_ICONS: Record<LedgerEntryType, IconName> = {
  member_payment: 'cash-outline',
  host_payout: 'home-outline',
  host_offset: 'remove-circle-outline',
  opening_balance: 'flag-outline',
  transfer: 'swap-horizontal-outline',
  loan: 'arrow-redo-outline',
  loan_repayment: 'arrow-undo-outline',
  shared_goal: 'cart-outline',
  debt_writeoff: 'close-circle-outline',
  credit_refund: 'return-down-back-outline',
  reversal: 'refresh-outline',
};

const SIGN = { in: '+', out: '-', neutral: '' } as const;

interface HistoryRowProps {
  entry: LedgerListItem;
  /** Every entry of the list, to find the original of a reversal. */
  byId: ReadonlyMap<string, LedgerListItem>;
  memberName: string;
}

// One row of Riwayat: 40dp icon, title (16sp), second line with member and pos (14sp), amount (18sp). The icon is
// decoration; the title always says the type in words. Tapping opens the entry detail.
export function HistoryRow({ entry: e, byId, memberName }: HistoryRowProps) {
  const title = e.type === 'reversal' ? reversalTitle(e, byId) : entryTitle(e);
  const corrected = Boolean(e.reversedById);
  const second = [memberName, historyFlowText(e)].filter((part) => part !== '').join(' - ');
  const note = visibleNote(e);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/kas/[entryId]', params: { entryId: e.id } })}
      style={({ pressed }) => [styles.row, corrected && styles.rowCorrected, pressed && styles.pressed]}
    >
      <View style={styles.icon}>
        <Ionicons name={TYPE_ICONS[e.type]} size={24} color={colors.primary} />
      </View>
      <View style={styles.main}>
        <Text style={[styles.title, corrected && styles.strike]}>{title}</Text>
        <Text style={styles.sub}>{second}</Text>
        {note ? <Text style={styles.sub}>{note}</Text> : null}
        {corrected ? <Text style={[styles.sub, styles.danger]}>Dikoreksi</Text> : null}
        {showsNoPosWarning(e) ? <Text style={[styles.sub, styles.warn]}>Peringatan: tanpa pos, tidak dihitung di saldo</Text> : null}
      </View>
      <Money amount={e.amount} size="heading" sign={SIGN[entryDirection(e)]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.row,
    backgroundColor: colors.surfaceAlt,
  },
  rowCorrected: { backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.danger },
  pressed: { opacity: 0.75 },
  icon: {
    width: ICON_BOX,
    height: ICON_BOX,
    borderRadius: ICON_BOX / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  main: { flex: 1, gap: 2 },
  title: { ...type.body, fontWeight: '600', color: colors.text },
  strike: { textDecorationLine: 'line-through' },
  sub: { fontSize: 14, color: colors.textMuted },
  danger: { color: colors.danger, fontWeight: '600' },
  warn: { color: colors.warn },
});
