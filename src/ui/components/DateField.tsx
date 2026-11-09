import { Ionicons } from '@expo/vector-icons';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { dateFieldText, isoToPickerDate, pickerDateToIso } from '../datePicker';
import { todayIso } from '../dates';
import { colors, ICON, MIN_TOUCH, radius, spacing, type } from '../theme';

interface DateFieldProps {
  label: string;
  /** ISO date ("2026-01-04"). */
  value: string;
  onChange: (value: string) => void;
  /** A problem from the domain (for example "must be after the previous meeting"), shown under the field. */
  error?: string | null;
  /** Latest day the calendar lets the owner pick (ISO). Only a convenience: the domain still validates on save. */
  maxDate?: string;
}

// Date field that opens the NATIVE Android calendar dialog. There is no typed input. On the web you would use
// <input type="date">; React Native has no such element, and the picker is opened by calling a function
// (DateTimePickerAndroid.open) from the press handler instead of rendering a component. The dialog is a real Android
// dialog, so it also works in Expo Go. Which dates are allowed is decided by the domain/repository, not here.
export function DateField({ label, value, onChange, error, maxDate }: DateFieldProps) {
  const today = todayIso();
  const text = dateFieldText(value, today);

  function openCalendar() {
    DateTimePickerAndroid.open({
      mode: 'date',
      value: isoToPickerDate(value, today),
      maximumDate: maxDate ? isoToPickerDate(maxDate, today) : undefined,
      onValueChange: (_event, picked) => onChange(pickerDateToIso(picked)),
    });
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${text}`}
        accessibilityHint="Buka kalender untuk memilih tanggal"
        onPress={openCalendar}
        style={({ pressed }) => [styles.field, error ? styles.fieldError : null, pressed && styles.pressed]}
      >
        <Ionicons name="calendar-outline" size={ICON.md} color={colors.brandStrong} />
        <Text maxFontSizeMultiplier={1.3} style={styles.text}>
          {text}
        </Text>
        <Ionicons name="chevron-down" size={ICON.sm} color={colors.textSecondary} />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { ...type.label, color: colors.text },
  field: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    backgroundColor: colors.bgCard,
  },
  fieldError: { borderWidth: 2, borderColor: colors.error },
  pressed: { backgroundColor: colors.bgMute },
  text: { ...type.body, flex: 1, color: colors.text },
  error: { ...type.secondary, color: colors.error },
});
