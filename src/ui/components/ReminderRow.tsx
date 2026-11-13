import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ReminderKind } from '../reminders';
import { colors, spacing, type } from '../theme';
import { Button } from './Button';

type IconName = ComponentProps<typeof Ionicons>['name'];

const ICON_BOX = 40;

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

// One "Pengingat": icon circle and two lines of text on top, ONE button always below the text (never beside it, so the
// words never get squeezed). Never primary: that belongs to the meeting card.
export function ReminderRow({ kind, title, detail, actionLabel, onAction, urgent = false }: ReminderRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.top}>
        <View style={[styles.icon, urgent ? styles.iconUrgent : styles.iconInfo]}>
          <Ionicons name={ICONS[kind]} size={24} color={urgent ? colors.warn : colors.brandStrong} />
        </View>
        <View style={styles.text}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.detail}>{detail}</Text>
        </View>
      </View>
      <Button label={actionLabel} variant="tertiary" compact onPress={onAction} style={styles.action} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.sm },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  icon: { width: ICON_BOX, height: ICON_BOX, borderRadius: ICON_BOX / 2, alignItems: 'center', justifyContent: 'center' },
  iconUrgent: { backgroundColor: colors.warnTint },
  iconInfo: { backgroundColor: colors.brandTint },
  text: { flex: 1, gap: spacing.xs },
  title: { ...type.bodyStrong, color: colors.text },
  detail: { ...type.secondary, color: colors.textSecondary },
  // Lines up with the text column: icon width + the gap between icon and text.
  action: { alignSelf: 'stretch', marginLeft: ICON_BOX + spacing.md },
});
