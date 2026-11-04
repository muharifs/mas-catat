import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

// React Native has no <button>: Pressable is the building block and Text must wrap every string.
export function Button({ label, onPress, variant = 'primary', disabled = false, style }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.base, styles[variant], disabled && styles.disabled, pressed && styles.pressed, style]}
    >
      <Text style={[styles.label, variant === 'secondary' && styles.labelSecondary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: '#1f6f50' },
  secondary: { backgroundColor: '#e8efe9', borderWidth: 1, borderColor: '#1f6f50' },
  danger: { backgroundColor: '#b3261e' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
  label: { color: '#fff', fontSize: 15, fontWeight: '600' },
  labelSecondary: { color: '#1f6f50' },
});
