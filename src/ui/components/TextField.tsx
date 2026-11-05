import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, radius, spacing, type } from '../theme';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string | null;
}

// <input> equivalent. onChangeText gives the string directly (no event object like onChange on the web).
export function TextField({ label, error, ...inputProps }: TextFieldProps) {
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        accessibilityLabel={label}
        style={[styles.input, inputProps.multiline ? styles.multiline : null, error ? styles.inputError : null]}
        placeholderTextColor={colors.placeholder}
        {...inputProps}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { ...type.label, color: colors.text },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.row,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: type.body.fontSize,
    color: colors.text,
    backgroundColor: colors.background,
  },
  // Android centers multiline text vertically by default; the web <textarea> starts at the top.
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger },
  error: { ...type.caption, color: colors.danger },
});
