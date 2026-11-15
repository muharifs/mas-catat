import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useRepos } from '@/db/provider';
import type { WeekSkipPreview } from '@/domain/week-skip';
import { TextField } from './components/TextField';
import { showDialog } from './dialog';
import { toIndonesian } from './errors';
import { toasts } from './messages';
import {
  SKIP_DEFAULT_REASON,
  SKIP_REASON_LABEL,
  SKIP_REASON_REQUIRED_TEXT,
  skipCardTitle,
  skipDialogMessage,
} from './skipMeeting';
import { spacing } from './theme';
import { toast } from './toast';

// The reason field inside the skip dialog. The dialog host draws `body` as it is and has no state of its own, so the
// field reports every change to `onChange` and the button handler reads the last value from there.
function SkipReasonField({ initial, onChange, error }: { initial: string; onChange: (text: string) => void; error: string | null }) {
  const [text, setText] = useState(initial);
  return (
    <View style={{ marginTop: spacing.lg }}>
      <TextField
        label={SKIP_REASON_LABEL}
        value={text}
        onChangeText={(t) => {
          setText(t);
          onChange(t);
        }}
        multiline
        error={error}
      />
    </View>
  );
}

interface AskInput {
  number: number;
  /** From repos.weeks.previewSkip: the numbers in the dialog are the repository's. */
  preview: WeekSkipPreview;
  /** Runs after a successful skip (reload the screen, or go back). */
  onSkipped: () => void | Promise<void>;
}

/**
 * "Lewati pertemuan": confirmation dialog with a small reason field (default text, editable), then repos.weeks.skipLast.
 * `busy` guards a double tap; `error` is the Indonesian text of a failure, to show inside the card (not a toast).
 */
export function useSkipMeeting(periodId: string) {
  const repos = useRepos();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  function openDialog(input: AskInput, reason: string, fieldError: string | null) {
    const typed = { value: reason }; // last text of the field (the dialog buttons read it)
    showDialog({
      title: skipCardTitle(input.number),
      message: skipDialogMessage(input.number, input.preview),
      body: <SkipReasonField initial={reason} onChange={(t) => (typed.value = t)} error={fieldError} />,
      buttons: [
        { label: 'Batal', role: 'cancel' },
        // Default role = primary teal, not red: the skip can be cancelled until the period ends.
        { label: 'Lewati pertemuan', onPress: () => confirm(input, typed.value) },
      ],
    });
  }

  function confirm(input: AskInput, reason: string) {
    if (reason.trim().length === 0) {
      // The dialog closes on any button: open it again with the message under the field.
      openDialog(input, '', SKIP_REASON_REQUIRED_TEXT);
      return;
    }
    void run(input, reason.trim());
  }

  async function run(input: AskInput, reason: string) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await repos.weeks.skipLast(periodId, reason);
      setError(null);
      toast(toasts.weekSkipped(input.number));
      await input.onSkipped();
    } catch (e) {
      setError(toIndonesian(e, 'skip_week'));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  function ask(input: AskInput) {
    if (running.current) return;
    setError(null);
    openDialog(input, SKIP_DEFAULT_REASON, null);
  }

  return { ask, busy, error };
}
