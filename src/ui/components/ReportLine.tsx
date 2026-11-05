import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, type } from '../theme';
import { Money } from './Money';
import type { MoneyTone } from '../format';

interface ReportLineProps {
  label: string;
  /** Integer rupiah from the domain; null shows `emptyText` instead (for example "Belum dibayar"). */
  amount: number | null;
  emptyText?: string;
  tone?: MoneyTone;
  /** Bigger line for a result row. */
  strong?: boolean;
  /** Small muted text under the label. */
  hint?: string;
}

// One "label ... amount" line of a report card. It only displays; the amount is computed in src/domain/report.ts.
export function ReportLine({ label, amount, emptyText = '-', tone = 'neutral', strong = false, hint }: ReportLineProps) {
  return (
    <View style={styles.row}>
      <View style={styles.main}>
        <Text style={[styles.label, strong && styles.strong]}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {amount === null ? (
        <Text style={styles.empty}>{emptyText}</Text>
      ) : (
        <Money amount={amount} size={strong ? 'heading' : 'body'} tone={tone} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  main: { flex: 1, gap: 2 },
  label: { ...type.body, color: colors.text },
  strong: { fontWeight: '700' },
  hint: { ...type.caption, color: colors.textMuted },
  empty: { ...type.body, color: colors.textMuted },
});
