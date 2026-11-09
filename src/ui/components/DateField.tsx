import { StyleSheet, Text, View } from 'react-native';
import { formatDateInput, readDateInput, SHORTCUT_LABELS, shortcutDate, BASIC_SHORTCUTS, type DateShortcut } from '../dateInput';
import { formatDate, todayIso } from '../dates';
import { colors, spacing, type } from '../theme';
import { Chip } from './Chip';
import { TextField } from './TextField';

interface DateFieldProps {
  label: string;
  /** ISO text as typed so far ("2026-01-04" when complete). */
  value: string;
  onChange: (value: string) => void;
  shortcuts?: readonly DateShortcut[];
  /** A problem from the domain (for example "must be after the previous meeting"). It replaces the built-in feedback. */
  error?: string | null;
}

const INVALID_TEXT = 'Tanggal tidak valid. Gunakan format TTTT-BB-HH, misalnya 2026-01-04.';

// Date input without a native picker: digits only on a numeric keyboard (hyphens are added automatically, so typing
// 20260104 gives 2026-01-04), shortcut chips, and live feedback ("Terbaca: 4 Jan 2026" or a red message).
// Which dates are allowed is decided by the domain/repository; this component only formats and reads text.
export function DateField({ label, value, onChange, shortcuts = BASIC_SHORTCUTS, error }: DateFieldProps) {
  const reading = readDateInput(value);
  const today = todayIso();
  const problem = error ?? (reading === 'invalid' ? INVALID_TEXT : null);
  return (
    <View style={styles.wrap}>
      <TextField
        label={label}
        value={value}
        onChangeText={(text) => onChange(formatDateInput(text))}
        keyboardType="number-pad"
        placeholder="TTTT-BB-HH"
        error={problem}
      />
      {problem === null && reading === 'valid' ? <Text style={styles.read}>Terbaca: {formatDate(value)}</Text> : null}
      {problem === null && reading === 'incomplete' ? <Text style={styles.hint}>Ketik 8 angka, misalnya 20260104.</Text> : null}
      <View style={styles.chips}>
        {shortcuts.map((s) => (
          <Chip key={s} label={SHORTCUT_LABELS[s]} onPress={() => onChange(shortcutDate(s, today, value))} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  read: { ...type.label, color: colors.textSecondary },
  hint: { ...type.secondary, color: colors.textSecondary },
});
