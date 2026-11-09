import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { ReminderKind } from '../reminders';
import { colors, spacing, type } from '../theme';
import { Button } from './Button';

type IconName = ComponentProps<typeof Ionicons>['name'];

const ICON_BOX = 40;
// Below this width, or with a big system font, the button drops under the text instead of squeezing the words.
const NARROW_WIDTH = 360;
const BIG_FONT_SCALE = 1.15;

const ICONS: Record<ReminderKind, IconName> = {
  pay_host: 'home-outline',
  choose_host: 'person-add-outline',
  close_week: 'checkmark-done-outline',
  close_period: 'flag-outline',
  backup: 'cloud-upload-outline',
};

interface ReminderRowProps {
  kind: ReminderKind;
  title: string;
  detail: string;
  actionLabel: string;
  onAction: () => void;
  /** Needs doing now: amber icon circle. Otherwise teal. The words carry the meaning either way. */
  urgent?: boolean;
}

// One line of "Pengingat": icon circle, two lines of text and ONE button (never primary: that belongs to the meeting card).
export function ReminderRow({ kind, title, detail, actionLabel, onAction, urgent = false }: ReminderRowProps) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < NARROW_WIDTH || fontScale > BIG_FONT_SCALE;
  return (
    <View style={[styles.row, stacked && styles.rowStacked]}>
      <View style={styles.top}>
        <View style={[styles.icon, urgent ? styles.iconUrgent : styles.iconInfo]}>
          <Ionicons name={ICONS[kind]} size={24} color={urgent ? colors.warn : colors.brandStrong} />
        </View>
        <View style={styles.text}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.detail}>{detail}</Text>
        </View>
      </View>
      <Button label={actionLabel} variant="tertiary" compact onPress={onAction} style={stacked ? undefined : styles.action} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowStacked: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.sm },
  top: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  icon: { width: ICON_BOX, height: ICON_BOX, borderRadius: ICON_BOX / 2, alignItems: 'center', justifyContent: 'center' },
  iconUrgent: { backgroundColor: colors.warnTint },
  iconInfo: { backgroundColor: colors.brandTint },
  text: { flex: 1, gap: spacing.xs },
  title: { ...type.bodyStrong, color: colors.text },
  detail: { ...type.secondary, color: colors.textSecondary },
  action: { flexShrink: 0 },
});
