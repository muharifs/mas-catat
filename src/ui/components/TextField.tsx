import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string | null;
}

// <input> equivalent. onChangeText gives the string directly (no event object like onChange on the web).
export function TextField({ label, error, ...inputProps }: TextFieldProps) {
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput style={[styles.input, inputProps.multiline ? styles.multiline : null, error ? styles.inputError : null]} placeholderTextColor="#888" {...inputProps} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  label: { fontSize: 14, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#bbb', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, backgroundColor: '#fff' },
  // Android centers multiline text vertically by default; the web <textarea> starts at the top.
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  inputError: { borderColor: '#b3261e' },
  error: { color: '#b3261e', fontSize: 13 },
});
