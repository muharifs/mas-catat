import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, View } from 'react-native';
import { showDialog, showMessage } from '@/ui/dialog';
import { checkFileSize, phraseMatches, requiredPhrase, SAFETY_KEEP } from '@/domain/backup';
import { commitRestore, discardRestore, prepareRestore, type PreparedRestore, type RestoreInput } from '@/db/backup';
import { useDatabaseControl } from '@/db/provider';
import {
  classificationText,
  classificationTitle,
  phraseInstruction,
  phraseReason,
  RESET_SAFETY_NOTE,
  restoreTexts,
  ROLLED_BACK_TEXT,
  safetyCopyLabel,
  safetyOfferText,
  summaryRows,
  ONE_PHONE_HINT,
} from '@/ui/backupLabels';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { ListRow } from '@/ui/components/ListRow';
import { Loading } from '@/ui/components/Loading';
import { Notice } from '@/ui/components/Notice';
import { SectionHeader } from '@/ui/components/SectionHeader';
import { TextField } from '@/ui/components/TextField';
import { restoreErrorNeedsReload, toIndonesian } from '@/ui/errors';
import { createSafetyStore, listSafetyCopies, pickBackupFile, readSafetyCopy, shareSafetyCopy } from '@/ui/shareFile';
import { colors, ICON, spacing, TABULAR, type } from '@/ui/theme';
import { toast } from '@/ui/toast';

type Phase = 'idle' | 'checking' | 'review' | 'working';

// Restore screen. Plan A: nothing touches the live data until the owner confirms, and then the engine in
// src/db/backup.ts first makes a verified safety copy, replaces the data, verifies it and undoes it by itself if
// anything differs. This screen only walks the owner through it. A restore REPLACES all data (never a merge).
export default function RestoreScreen() {
  const { db, bridge, bumpDataVersion } = useDatabaseControl();
  const [phase, setPhase] = useState<Phase>('idle');
  const [prepared, setPrepared] = useState<PreparedRestore | null>(null);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [safetyNames, setSafetyNames] = useState<string[]>([]);
  const lock = useRef(false); // a fast double tap must not start two jobs
  const preparedRef = useRef<PreparedRestore | null>(null);
  useEffect(() => {
    preparedRef.current = prepared; // for the cleanup on unmount below
  }, [prepared]);

  const blocked = phase === 'checking' || phase === 'working';

  // The back button (hardware and header) is blocked while a job runs; the job cannot be stopped halfway.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => blocked);
    return () => subscription.remove();
  }, [blocked]);

  // Leaving the screen with a prepared copy still open (cancel by going back) closes the memory database.
  // `mounted` lets a check that finishes after the screen was left close its own memory copy (see prepare()).
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const open = preparedRef.current;
      if (open) void discardRestore(open);
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      listSafetyCopies().then(setSafetyNames, () => setSafetyNames([]));
    }, []),
  );

  async function prepare(read: () => Promise<RestoreInput | null>) {
    if (lock.current) return;
    lock.current = true;
    setError(null);
    setPhase('checking');
    try {
      const input = await read();
      if (!input) {
        setPhase('idle'); // the owner cancelled the picker
        return;
      }
      const result = await prepareRestore(bridge, db, input);
      if (!mounted.current) {
        // The owner left while the file was being checked: nobody will ever press a button, so free the memory copy.
        await discardRestore(result);
        return;
      }
      setPrepared(result);
      setTyped('');
      setPhase('review');
    } catch (e) {
      if (!mounted.current) return;
      setError(toIndonesian(e, 'restore_check'));
      setPhase('idle');
    } finally {
      lock.current = false;
    }
  }

  const chooseFile = () =>
    void prepare(async () => {
      const picked = await pickBackupFile();
      if (!picked) return null;
      checkFileSize(picked.size); // judged on the size reported by the system, before any byte is read
      return { kind: 'file', bytes: await picked.readBytes() };
    });

  const chooseSafety = (name: string) => void prepare(async () => ({ kind: 'file', bytes: await readSafetyCopy(name) }));

  const chooseEmpty = () => void prepare(async () => ({ kind: 'empty' }));

  function cancel() {
    if (prepared) void discardRestore(prepared);
    setPrepared(null);
    setTyped('');
    setPhase('idle');
  }

  // Every screen is rebuilt (key on the navigator) so nothing shows pre-restore data, then we go back to Home.
  function reloadEverything() {
    bumpDataVersion();
    try {
      router.dismissAll();
    } catch {
      // Nothing to dismiss when the stack is already at its root; replace('/') below handles the rest.
    }
    router.replace('/');
  }

  async function perform(current: PreparedRestore) {
    if (lock.current) return;
    lock.current = true;
    setError(null);
    setPhase('working');
    try {
      // commitRestore closes the memory copies itself in a finally block.
      const outcome = await commitRestore(bridge, db, current, createSafetyStore());
      setPrepared(null);
      reloadEverything();
      if (outcome.outcome === 'rolled_back') {
        showMessage('Data lama dikembalikan', ROLLED_BACK_TEXT);
        return;
      }
      toast(current.source === 'empty' ? restoreTexts.resetDone : restoreTexts.done);
      // Offer the safety copy to the share sheet. The restore is already finished, so this blocks nothing.
      showDialog({
        title: 'Salinan pengaman',
        message: safetyOfferText(outcome),
        buttons: [
          { label: 'Nanti', role: 'cancel' },
          {
            label: 'Bagikan',
            onPress: () => {
              shareSafetyCopy(outcome.safetyName).catch((e: unknown) => showMessage('Gagal membagikan', toIndonesian(e, 'share_safety')));
            },
          },
        ],
      });
    } catch (e) {
      setPrepared(null);
      if (restoreErrorNeedsReload(e)) {
        // The live data may already have changed (for example restore_failed), so no screen may keep old numbers.
        // The screens are rebuilt, so the message goes into a dialog instead of this screen's state.
        reloadEverything();
        showMessage('Pemulihan bermasalah', toIndonesian(e, 'restore'));
      } else {
        setError(toIndonesian(e));
        setPhase('idle');
      }
    } finally {
      lock.current = false;
    }
  }

  function confirm(current: PreparedRestore) {
    const phrase = requiredPhrase(current.source, current.classification);
    if (phrase) {
      if (!phraseMatches(typed, phrase)) return;
      void perform(current); // typing the word is the confirmation
      return;
    }
    // Same as ending a period: two in-app dialogs in a row.
    showDialog({
      title: restoreTexts.firstDialogTitle,
      message: restoreTexts.firstDialogBody,
      buttons: [
        { label: 'Batal', role: 'cancel' },
        {
          label: 'Lanjut',
          onPress: () =>
            showDialog({
              title: restoreTexts.secondDialogTitle,
              message: restoreTexts.secondDialogBody,
              buttons: [
                { label: 'Batal', role: 'cancel' },
                { label: restoreTexts.secondDialogOk, role: 'destructive', onPress: () => void perform(current) },
              ],
            }),
        },
      ],
    });
  }

  // The header back arrow is hidden while a job runs (the job cannot be stopped halfway).
  if (phase === 'working' || phase === 'checking') {
    return (
      <>
        <Stack.Screen options={{ headerBackVisible: false, gestureEnabled: false }} />
        <Loading label={phase === 'working' ? restoreTexts.working : 'Memeriksa berkas...'} />
      </>
    );
  }

  if (phase === 'review' && prepared) {
    const phrase = requiredPhrase(prepared.source, prepared.classification);
    const isReset = prepared.source === 'empty';
    const ready = phrase === null || phraseMatches(typed, phrase);
    const lossy = prepared.classification.kind === 'older' || prepared.classification.kind === 'diverged';
    return (
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Stack.Screen options={{ headerBackVisible: false }} />
        <Text style={styles.title}>{isReset ? 'Mulai dari nol' : 'Periksa sebelum memulihkan'}</Text>

        {isReset ? (
          <Notice tone="danger" title="Semua data akan dihapus">
            {restoreTexts.resetWarning}
          </Notice>
        ) : (
          <Notice tone={lossy ? 'danger' : 'info'} title={classificationTitle(prepared.classification)}>
            {classificationText(prepared.classification)}
          </Notice>
        )}

        {!isReset && prepared.originalVersion < prepared.candidate.userVersion ? (
          <Notice tone="info">Cadangan ini dari versi lama aplikasi. Isinya disesuaikan otomatis ke versi sekarang sebelum dipakai.</Notice>
        ) : null}

        {/* One comparison card: two column titles, then each item once with its two values side by side. */}
        <Card>
          <View style={styles.columns}>
            <Text style={[styles.heading, styles.column]}>Di HP ini</Text>
            <Text style={[styles.heading, styles.column]}>{isReset ? 'Setelah mulai dari nol' : 'Di cadangan'}</Text>
          </View>
          {summaryRows(prepared.live).map((row, index) => (
            <CompareLine key={row.label} label={row.label} current={row.value} other={summaryRows(prepared.candidate)[index]?.value ?? '-'} />
          ))}
        </Card>

        {phrase ? (
          <>
            <Text style={styles.body}>{phraseInstruction(phrase)}</Text>
            <TextField
              label={`Ketik ${phrase}`}
              value={typed}
              onChangeText={setTyped}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </>
        ) : null}

        <Button
          label={isReset ? 'Hapus semua dan mulai dari nol' : 'Ganti semua data dengan cadangan ini'}
          variant="danger"
          disabled={!ready}
          disabledReason={phrase ? phraseReason(phrase) : undefined}
          onPress={() => confirm(prepared)}
        />
        <Button label="Batal" variant="secondary" onPress={cancel} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Notice tone="warn" title="Semua data akan diganti">
        Memulihkan mengganti data di HP ini dengan isi cadangan. Data tidak digabung.
      </Notice>
      <Text style={styles.body}>{ONE_PHONE_HINT}</Text>

      <Button label="Pilih berkas cadangan" onPress={chooseFile} />

      <View style={styles.section}>
        <SectionHeader title="Salinan pengaman" />
        <Card tone="alt">
          <Text style={styles.caption}>
            Sebelum setiap pemulihan, data sekarang disalin dulu ke sini. Hanya {SAFETY_KEEP} yang terakhir disimpan.
          </Text>
          {safetyNames.length === 0 ? <Text style={styles.body}>Belum ada salinan pengaman.</Text> : null}
          {safetyNames.map((name) => (
            <ListRow key={name} title={safetyCopyLabel(name)} chevron={false} onPress={() => chooseSafety(name)} right={
                <View style={styles.pickAction}>
                  <Text style={styles.pickLabel}>Pulihkan</Text>
                  <Ionicons name="chevron-forward" size={ICON.sm} color={colors.brandStrong} />
                </View>
              }
            />
          ))}
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Mulai dari nol" />
        <Card tone="danger">
          <Text style={styles.body}>
            Mengganti semua data dengan data kosong. Cara bersih untuk membuang data percobaan. Salinan pengaman dibuat lebih dulu.{' '}
            {RESET_SAFETY_NOTE}
          </Text>
          <Button label="Mulai dari nol" variant="dangerOutline" onPress={chooseEmpty} />
        </Card>
      </View>
    </ScrollView>
  );
}

// One item of the comparison: label once, then the two values in the same two columns as the titles.
// summaryRows() returns the same labels in the same order for both sides, so the index pairs them up.
function CompareLine({ label, current, other }: { label: string; current: string; other: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.caption}>{label}</Text>
      <View style={styles.columns}>
        <Text style={[styles.value, styles.column]}>{current}</Text>
        <Text style={[styles.value, styles.column]}>{other}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg },
  title: { ...type.titleL, color: colors.text },
  heading: { ...type.titleM, color: colors.text },
  body: { ...type.body, color: colors.text },
  caption: { ...type.secondary, color: colors.textSecondary },
  value: { ...type.bodyStrong, ...TABULAR, color: colors.text },
  columns: { flexDirection: 'row', gap: spacing.lg },
  column: { flex: 1 },
  // A hairline between items; gap keeps the label close to its values.
  line: { gap: spacing.xs, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  section: { gap: spacing.sm },
  // The row is tappable; the bold teal word and the chevron say so.
  pickAction: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  pickLabel: { ...type.label, color: colors.brandStrong },
});
