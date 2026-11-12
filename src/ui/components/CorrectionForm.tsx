import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { toIndonesian } from '../errors';
import { colors, radius, spacing } from '../theme';
import { Button } from './Button';
import { TextField } from './TextField';

interface CorrectionFormProps {
  /** Alert title, for example "Koreksi pembayaran Rp45.000". */
  title: string;
  /** Alert body: says what the correction does. */
  message: string;
  submitLabel?: string;
  onSubmit: (reason: string) => Promise<void>;
  onCancel: () => void;
}

// Reason + confirmation for a correction. The reason is a normal multiline TextInput because Alert.prompt only
// exists on iOS (this app runs on Android). The reason is required; the repository checks it again.
export function CorrectionForm({ title, message, submitLabel = 'Koreksi', onSubmit, onCancel }: CorrectionFormProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function ask() {
    if (reason.trim().length === 0) {
      setError('Alasan koreksi wajib diisi.');
      return;
    }
    setError(null);
    Alert.alert(title, message, [
      { text: 'Batal', style: 'cancel' },
      {
        text: submitLabel,
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await onSubmit(reason.trim());
          } catch (e) {
            setError(toIndonesian(e, 'correct'));
            setBusy(false);
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.box}>
      <TextField label="Alasan koreksi (wajib)" value={reason} onChangeText={setReason} multiline numberOfLines={3} placeholder="Contoh: salah memilih anggota" />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button label={submitLabel} variant="danger" disabled={busy} onPress={ask} />
      <Button label="Batal" variant="secondary" disabled={busy} onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.sm, backgroundColor: colors.errorTint },
  error: { color: colors.error },
});
