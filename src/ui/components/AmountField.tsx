import { StyleSheet, Text, View } from 'react-native';
import { AMOUNT_FORMAT_HINT, parseRupiahInput } from '@/domain/payment-preview';
import { formatRupiah } from '../format';
import { TextField } from './TextField';

interface AmountFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

// Amount input. While typing it shows what the app understood ("Terbaca: Rp45.000") or, for text it cannot
// read (commas, decimals, letters), the format hint. Parsing is the domain's parseRupiahInput; this only displays.
// On the web you would use <input type="number">; React Native has no such element, so we validate the text ourselves.
export function AmountField({ label, value, onChangeText, placeholder }: AmountFieldProps) {
  const parsed = parseRupiahInput(value);
  const filled = value.trim().length > 0;
  return (
    <View style={styles.wrap}>
      <TextField
        label={label}
        value={value}
        onChangeText={onChangeText}
        keyboardType="number-pad"
        placeholder={placeholder ?? '15000'}
        error={filled && parsed === null ? AMOUNT_FORMAT_HINT : null}
      />
      {parsed !== null ? <Text style={styles.read}>Terbaca: {formatRupiah(parsed)}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  read: { color: '#1f6f50', fontWeight: '600' },
});
