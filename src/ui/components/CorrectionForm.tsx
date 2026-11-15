import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { showDialog } from '../dialog';
import { toIndonesian, type ErrorContext } from '../errors';
import { colors, radius, spacing, type } from '../theme';
import { Button } from './Button';
import { TextField } from './TextField';

interface CorrectionFormProps {
  /** Dialog title, for example "Koreksi pembayaran Rp45.000". */
  title: string;
  /** Dialog body: says what the correction does. */
  message: string;
  submitLabel?: string;
  onSubmit: (reason: string) => Promise<void>;
  onCancel: () => void;
  /** Sentence at the top of the box. Default: what a payment or payout correction does. */
  explain?: string;
  /** Label of the reason field. Default: "Alasan koreksi (wajib)". */
  reasonLabel?: string;
  /** Placeholder of the reason field. */
  placeholder?: string;
  /** Shown under the field when the reason is empty. Default: "Alasan koreksi wajib diisi." */
  requiredText?: string;
  /** Context for the text of an unexpected error. Default 'correct'. */
  errorContext?: ErrorContext;
}

const DEFAULT_EXPLAIN = 'Koreksi membatalkan catatan ini. Catatan lama tetap terlihat, ditandai Dikoreksi, dan tidak dihitung.';

// Reason + confirmation for a correction. The reason is a normal multiline TextInput because Alert.prompt only
// exists on iOS (this app runs on Android). The reason is required; the repository checks it again.
export function CorrectionForm({
  title,
  message,
  submitLabel = 'Koreksi',
  onSubmit,
  onCancel,
  explain = DEFAULT_EXPLAIN,
  reasonLabel = 'Alasan koreksi (wajib)',
  placeholder = 'Contoh: salah memilih anggota',
  requiredText = 'Alasan koreksi wajib diisi.',
  errorContext = 'correct',
}: CorrectionFormProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function ask() {
    if (reason.trim().length === 0) {
      setError(requiredText);
      return;
    }
    setError(null);
    showDialog({
      title,
      message,
      buttons: [
        { label: 'Batal', role: 'cancel' },
        {
          label: submitLabel,
          role: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await onSubmit(reason.trim());
            } catch (e) {
              setError(toIndonesian(e, errorContext));
              setBusy(false);
            }
          },
        },
      ],
    });
  }

  return (
    <View style={styles.box}>
      <Text style={styles.explain}>{explain}</Text>
      <TextField label={reasonLabel} value={reason} onChangeText={setReason} multiline numberOfLines={3} placeholder={placeholder} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button label={submitLabel} variant="danger" disabled={busy} onPress={ask} />
      <Button label="Batal" variant="secondary" disabled={busy} onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.sm, backgroundColor: colors.errorTint },
  explain: { ...type.secondary, color: colors.textSecondary },
  error: { ...type.secondary, color: colors.error },
});
