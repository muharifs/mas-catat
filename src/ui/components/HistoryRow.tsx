import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LedgerListItem } from '@/db/ledger';
import type { LedgerEntryType } from '@/domain/types';
import { entryDirection, historyFlowText, historyRowLabel, NO_POS_WARNING, reversalTitle } from '../history';
import { entryTitle, showsNoPosWarning, visibleNote } from '../kasLabels';
import { colors, MIN_TOUCH, radius, spacing, type } from '../theme';
import { Badge } from './Badge';
import { Money } from './Money';
import { SEP } from '../separator';

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

// Icon circle by direction: green for money in, red for money out, neutral ink for transfer, loan, write-off and so on.
const DIRECTION_ICON = {
  in: { circle: colors.moneyInTint, icon: colors.moneyIn },
  out: { circle: colors.errorTint, icon: colors.error },
  neutral: { circle: colors.neutralTint, icon: colors.text },
} as const;

interface HistoryRowProps {
  entry: LedgerListItem;
  /** Every entry of the list, to find the original of a reversal. */
  byId: ReadonlyMap<string, LedgerListItem>;
  memberName: string;
  /** No own border, background or radius: the row sits inside a card and the parent draws the dividers. */
  flat?: boolean;
  /** Replaces the default tap (open the entry detail). Only the developer gallery passes it, so a fake id never navigates. */
  onPress?: () => void;
}

// One row of Riwayat: 40dp icon, title (16sp), second line with member and pos (14sp), amount (18sp). The icon is
// decoration; the title always says the type in words. Tapping opens the entry detail.
export function HistoryRow({ entry: e, byId, memberName, flat = false, onPress }: HistoryRowProps) {
  const title = e.type === 'reversal' ? reversalTitle(e, byId) : entryTitle(e);
  const corrected = Boolean(e.reversedById);
  const second = [memberName, historyFlowText(e)].filter((part) => part !== '').join(SEP);
  const note = visibleNote(e);
  const direction = entryDirection(e);
  return (
    <Pressable
      accessibilityRole="button"
      // One sentence for TalkBack; the icon and the +/- sign inside are hidden from it (see historyRowLabel).
      accessibilityLabel={historyRowLabel({ title, memberName, entry: e })}
      onPress={onPress ?? (() => router.push({ pathname: '/kas/[entryId]', params: { entryId: e.id } }))}
      style={({ pressed }) => [
        styles.row,
        flat && styles.rowFlat,
        corrected && (flat ? styles.rowCorrectedFlat : styles.rowCorrected),
        pressed && styles.pressed,
      ]}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={[styles.icon, { backgroundColor: corrected ? colors.bgCard : DIRECTION_ICON[direction].circle }]}
      >
        <Ionicons name={TYPE_ICONS[e.type]} size={24} color={DIRECTION_ICON[direction].icon} />
      </View>
      <View style={styles.main}>
        <Text style={[styles.title, corrected && styles.strike]}>{title}</Text>
        <Text style={styles.sub}>{second}</Text>
        {note ? <Text style={styles.sub}>{note}</Text> : null}
        {corrected ? <Badge label="Dikoreksi" tone="error" onTint /> : null}
        {showsNoPosWarning(e) ? <Text style={[styles.sub, styles.warn]}>{NO_POS_WARNING}</Text> : null}
      </View>
      <Money amount={e.amount} size="heading" sign={SIGN[direction]} />
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
    borderRadius: radius.md,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  // Flat: the row grows 12dp past the text on both sides (negative margin + padding) so the pressed or corrected fill
  // has room around the text; the card around it has 16dp padding, so the fill stays inside the card.
  rowFlat: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: radius.md,
    marginHorizontal: -spacing.md,
    paddingHorizontal: spacing.md,
  },
  rowCorrectedFlat: { backgroundColor: colors.errorTint },
  rowCorrected: { backgroundColor: colors.errorTint, borderColor: colors.error },
  pressed: { backgroundColor: colors.bgMute },
  icon: {
    width: ICON_BOX,
    height: ICON_BOX,
    borderRadius: ICON_BOX / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: { flex: 1, gap: spacing.xs },
  title: { ...type.bodyStrong, color: colors.text },
  strike: { textDecorationLine: 'line-through' },
  sub: { ...type.secondary, color: colors.textSecondary },
  warn: { color: colors.warn },
});
