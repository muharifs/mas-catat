import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, MIN_TOUCH, radius, spacing, type } from '../theme';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string | null;
  /** Explanation under the input. The error replaces it when there is one. */
  helper?: string;
}

// <input> equivalent. onChangeText gives the string directly (no event object like onChange on the web).
// Focus has no CSS :focus here, so the focused state is tracked by hand to draw the thicker border.
export function TextField({ label, error, helper, onFocus, onBlur, ...inputProps }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const readOnly = inputProps.editable === false;
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        accessibilityLabel={label}
        style={[
          styles.input,
          inputProps.multiline ? styles.multiline : null,
          readOnly ? styles.readOnly : null,
          focused ? styles.inputFocused : null,
          error ? styles.inputError : null,
        ]}
        placeholderTextColor={colors.textTertiary}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...inputProps}
      />
      {error ? <Text style={styles.error}>{error}</Text> : helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { ...type.label, color: colors.text },
  input: {
    minHeight: MIN_TOUCH,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: type.body.fontSize,
    color: colors.text,
    backgroundColor: colors.bgCard,
  },
  // Android centers multiline text vertically by default; the web <textarea> starts at the top.
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  readOnly: { backgroundColor: colors.bgMute, color: colors.textSecondary },
  // 2dp border: the extra width is taken from the padding so the text does not move when focus changes.
  inputFocused: { borderWidth: 2, borderColor: colors.brandStrong, paddingHorizontal: spacing.md - 1, paddingVertical: spacing.md - 1 },
  inputError: { borderWidth: 2, borderColor: colors.error, paddingHorizontal: spacing.md - 1, paddingVertical: spacing.md - 1 },
  error: { ...type.secondary, color: colors.error },
  helper: { ...type.secondary, color: colors.textSecondary },
});
