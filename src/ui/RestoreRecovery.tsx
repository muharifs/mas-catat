// Full-screen blocker shown at app start when a restore did not finish (L6). It is NOT an expo-router route: the
// DatabaseProvider renders it instead of the app, so no screen can read or write half replaced data.
// Compared with the web: there is no route to guard; the whole app tree is simply not rendered until this screen is done.
// The main path needs one confirmation dialog (the safety copy was made by the app itself). Choosing another copy or file
// goes through the normal comparison and the typed word PULIHKAN, like the restore screen.
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  applyRecoveryCopy,
  commitRestore,
  discardRestore,
  loadRecoveryCopy,
  prepareRestore,
  type MemoryDb,
  type NativeBridge,
  type PreparedRestore,
  type RecoveryOutcome,
  type RestoreInput,
} from '@/db/backup';
import type { Db } from '@/db/db';
import { memoryOpener, prepareRestoreWithoutLive } from '@/db/openDatabase';
import { checkFileSize, DamagedDatabaseError, PHRASE_RESTORE, phraseMatches, type RestoreMarker } from '@/domain/backup';
import {
  classificationText,
  classificationTitle,
  phraseInstruction,
  phraseReason,
  recoveryConfirmText,
  recoveryDoneBody,
  recoveryFailure,
  recoveryHint,
  recoveryTexts as texts,
  safetyCopyLabel,
  summaryRows,
  UNREADABLE_FILE_NOTE,
  type RecoveryFailure,
} from './backupLabels';
import { Button } from './components/Button';
import { Card } from './components/Card';
import { ListRow } from './components/ListRow';
import { Loading } from './components/Loading';
import { Notice } from './components/Notice';
import { SectionHeader } from './components/SectionHeader';
import { TextField } from './components/TextField';
import { showDialog } from './dialog';
import { toIndonesian } from './errors';
import { createSafetyStore, listSafetyCopies, pickBackupFile, readSafetyCopy } from './shareFile';
import { colors, spacing, TABULAR, type } from './theme';
import { toast } from './toast';

export interface DbHandle {
  db: Db;
  bridge: NativeBridge;
}

interface Props {
  /** The marker found at start; 'corrupt' = a marker file exists but cannot be read (treated as "a restore did not finish"). */
  marker: RestoreMarker | 'corrupt';
  /** null when the database could not even be opened. */
  handle: DbHandle | null;
  /** One more try to open the data file; null = it still cannot be opened. Nothing destructive. */
  tryOpen: () => Promise<DbHandle | null>;
  /** Keeps a copy of the unreadable data file, deletes it and opens a new empty one. Only called after the replacement passed its checks in memory. */
  replace: () => Promise<DbHandle>;
  /** The data was replaced and verified (marker removed): the provider shows the app. */
  onRecovered: (handle: DbHandle) => void;
}

type Phase = 'idle' | 'checking' | 'review' | 'working';

export function RestoreRecovery({ marker, handle: initialHandle, tryOpen, replace, onRecovered }: Props) {
  const [handle, setHandle] = useState<DbHandle | null>(initialHandle);
  const [phase, setPhase] = useState<Phase>('idle');
  const [failure, setFailure] = useState<RecoveryFailure | null>(marker === 'corrupt' ? 'missing' : null);
  const [error, setError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<PreparedRestore | null>(null);
  const [typed, setTyped] = useState('');
  const [safetyNames, setSafetyNames] = useState<string[]>([]);
  const [showOthers, setShowOthers] = useState(false);
  const lock = useRef(false); // a fast double tap must not start two jobs
  const mounted = useRef(true);
  const preparedRef = useRef<PreparedRestore | null>(null);
  useEffect(() => {
    preparedRef.current = prepared; // for the cleanup on unmount below
  }, [prepared]);

  // The system back button does nothing here, at any time: there is no screen to go back to, and leaving would show
  // the half replaced data. (A job cannot be stopped halfway either.)
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const open = preparedRef.current;
      if (open) void discardRestore(open);
    };
  }, []);

  const refreshCopies = useCallback(() => {
    listSafetyCopies().then(setSafetyNames, () => setSafetyNames([]));
  }, []);
  useEffect(refreshCopies, [refreshCopies]);

  const markerName = marker === 'corrupt' ? null : marker.safetyName;
  const otherCopies = safetyNames.filter((name) => name !== markerName);
  const isReset = marker !== 'corrupt' && marker.kind === 'reset';

  // A handle without anything destructive: the one we have, or one more try to open the file (the first open may have failed
  // because of a passing problem). null = the file still cannot be opened.
  async function openIfPossible(): Promise<DbHandle | null> {
    if (handle) return handle;
    const opened = await tryOpen();
    if (opened && mounted.current) setHandle(opened);
    return opened;
  }

  // Replaces the unreadable data file (a copy of it is kept first). `state.replaced` turns true as soon as the old file may be
  // gone, so any later failure is shown as 'unsafe' and never as a harmless 'retry'.
  async function replaceUnreadable(state: { replaced: boolean }): Promise<DbHandle> {
    try {
      const fresh = await replace();
      state.replaced = true;
      if (mounted.current) setHandle(fresh);
      return fresh;
    } catch (e) {
      if (e instanceof DamagedDatabaseError && e.afterDelete) state.replaced = true;
      throw e;
    }
  }

  function finish(opened: DbHandle, outcome: Pick<RecoveryOutcome, 'previousCopyName' | 'liveDiffers' | 'markerCleared'>) {
    toast(texts.toastDone);
    onRecovered(opened); // the app tree is built from scratch below the provider, so no screen shows old data
    showDialog({ title: texts.doneTitle, message: recoveryDoneBody(outcome), buttons: [{ label: texts.doneOk }] });
  }

  // ---- main path: the safety copy named in the marker ----

  async function recover() {
    if (lock.current || marker === 'corrupt') return;
    lock.current = true;
    setError(null);
    setFailure(null);
    setPhase('working');
    const state = { replaced: false };
    let source: MemoryDb | null = null;
    try {
      const store = createSafetyStore();
      // 1) The safety copy is read and checked in memory FIRST: an unreadable data file is never deleted for a copy that cannot be used.
      const existing = await openIfPossible();
      source = await loadRecoveryCopy(existing ? existing.bridge : memoryOpener, store, marker);
      // 2) Only now a destructive replacement, and only when the data file really cannot be opened.
      const opened = existing ?? (await replaceUnreadable(state));
      const outcome = await applyRecoveryCopy(opened.bridge, opened.db, store, marker, source);
      finish(opened, outcome);
    } catch (e) {
      if (mounted.current) {
        setFailure(state.replaced ? 'unsafe' : recoveryFailure(e));
        setPhase('idle');
        refreshCopies();
      }
    } finally {
      if (source) await source.close().catch(() => undefined);
      lock.current = false;
    }
  }

  function confirmRecover() {
    if (lock.current || marker === 'corrupt') return; // check BEFORE the dialog opens
    showDialog({
      title: texts.confirmTitle,
      message: recoveryConfirmText(marker.safetyName, handle === null),
      buttons: [
        { label: 'Batal', role: 'cancel' },
        { label: texts.confirmOk, role: 'destructive', onPress: () => void recover() },
      ],
    });
  }

  // ---- other copy or file: normal comparison, typed word ----

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
      // Without a live database the comparison runs against an empty stand-in; nothing of the unreadable file is touched.
      const opened = await openIfPossible();
      const result = opened ? await prepareRestore(opened.bridge, opened.db, input) : await prepareRestoreWithoutLive(input);
      if (!mounted.current) {
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
      checkFileSize(picked.size);
      return { kind: 'file', bytes: await picked.readBytes() };
    });

  const chooseSafety = (name: string) => void prepare(async () => ({ kind: 'file', bytes: await readSafetyCopy(name) }));

  function cancelReview() {
    if (prepared) void discardRestore(prepared);
    setPrepared(null);
    setTyped('');
    setPhase('idle');
  }

  async function performOther(current: PreparedRestore) {
    if (lock.current) return;
    lock.current = true;
    setError(null);
    setPhase('working');
    const state = { replaced: false };
    try {
      // The file was checked in memory already (prepare). Only now, and only if it still cannot be opened, it is replaced.
      const opened = (await openIfPossible()) ?? (await replaceUnreadable(state));
      // The unfinished restore stays on record until a restore REALLY succeeded: after a rollback or a failure its marker is
      // written straight over the marker of this attempt (no moment without a marker).
      const restoreMarkerAfter = marker === 'corrupt' ? undefined : marker;
      const outcome = await commitRestore(opened.bridge, opened.db, current, createSafetyStore(), undefined, { restoreMarkerAfter });
      if (outcome.outcome === 'rolled_back') {
        // The data is back to what it was BEFORE this attempt: still the unfinished state. Stay blocked.
        // If the older marker could not be written back, the next start may not block any more: say 'unsafe'.
        if (mounted.current) {
          setPrepared(null);
          setFailure(restoreMarkerAfter && !outcome.markerCleared ? 'unsafe' : 'retry');
          setPhase('idle');
        }
        return;
      }
      setPrepared(null);
      finish(opened, { previousCopyName: null, liveDiffers: false, markerCleared: outcome.markerCleared });
    } catch (e) {
      await discardRestore(current); // no-op when commitRestore already closed it
      if (mounted.current) {
        setPrepared(null);
        setFailure(state.replaced ? 'unsafe' : recoveryFailure(e));
        setPhase('idle');
      }
    } finally {
      lock.current = false;
    }
  }

  // ---- views ----

  if (phase === 'working' || phase === 'checking') {
    return <Loading label={phase === 'working' ? texts.working : 'Memeriksa berkas...'} />;
  }

  if (phase === 'review' && prepared) {
    const ready = phraseMatches(typed, PHRASE_RESTORE);
    return (
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title} accessibilityRole="header">
          {texts.reviewTitle}
        </Text>
        <View accessibilityLiveRegion="assertive">
          <Notice tone="danger" title={classificationTitle(prepared.classification) ?? 'Semua data di HP ini akan diganti'}>
            {classificationText(prepared.classification)}
          </Notice>
        </View>
        <Card>
          <View style={styles.columns}>
            <Text style={[styles.heading, styles.column]}>Di HP ini</Text>
            <Text style={[styles.heading, styles.column]}>Di cadangan</Text>
          </View>
          {summaryRows(prepared.live).map((row, index) => (
            <View key={row.label} style={styles.line}>
              <Text style={styles.caption}>{row.label}</Text>
              <View style={styles.columns}>
                <Text style={[styles.value, styles.column]}>{row.value}</Text>
                <Text style={[styles.value, styles.column]}>{summaryRows(prepared.candidate)[index]?.value ?? '-'}</Text>
              </View>
            </View>
          ))}
        </Card>
        {!handle ? <Notice tone="warn">{UNREADABLE_FILE_NOTE}</Notice> : null}
        <Text style={styles.body}>{phraseInstruction(PHRASE_RESTORE)}</Text>
        <TextField label={`Ketik ${PHRASE_RESTORE}`} value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} />
        <Button
          label="Ganti semua data dengan cadangan ini"
          variant="danger"
          disabled={!ready}
          disabledReason={phraseReason(PHRASE_RESTORE)}
          onPress={() => void performOther(prepared)}
        />
        <Button label="Batal" variant="secondary" onPress={cancelReview} />
      </ScrollView>
    );
  }

  // The safety copy of the marker cannot be used (or the marker itself is unreadable): only a file or another copy can help.
  const needsOtherSource = failure === 'missing' || failure === 'unsafe' || marker === 'corrupt';
  const named = marker === 'corrupt' ? null : marker.safetyName;
  const listVisible = (needsOtherSource || showOthers) && otherCopies.length > 0;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title} accessibilityRole="header">
        {texts.title}
      </Text>

      {error ? (
        <View accessibilityLiveRegion="assertive">
          <Notice tone="danger">{error}</Notice>
        </View>
      ) : null}

      {failure === 'retry' ? (
        <View accessibilityLiveRegion="polite">
          <Notice tone="danger" title={texts.retryTitle}>
            {texts.retryBody}
          </Notice>
        </View>
      ) : null}
      {failure === 'unsafe' ? (
        <View accessibilityLiveRegion="assertive">
          <Notice tone="danger">{texts.unsafe}</Notice>
        </View>
      ) : null}
      {failure === 'missing' || marker === 'corrupt' ? (
        <View accessibilityLiveRegion="assertive">
          <Notice tone="danger" title={texts.missingTitle}>
            {texts.missingBody}
          </Notice>
        </View>
      ) : null}
      {!needsOtherSource ? (
        <View accessibilityLiveRegion="assertive">
          <Notice tone="danger" title={texts.noticeTitle}>
            {isReset ? texts.noticeBodyReset : texts.noticeBodyRestore}
          </Notice>
        </View>
      ) : null}

      {named && !needsOtherSource ? (
        <>
          <Text style={styles.body}>{texts.explain}</Text>
          <Card tone="alt">
            <Text style={styles.cardTitle}>{safetyCopyLabel(named)}</Text>
            <Text style={styles.caption}>{texts.cardNote}</Text>
          </Card>
          {/* Button has no hint prop: the hint is part of the spoken label. */}
          <Button
            label={failure === 'retry' ? texts.retry : texts.primary}
            accessibilityLabel={`${failure === 'retry' ? texts.retry : texts.primary}. ${recoveryHint(named)}`}
            onPress={confirmRecover}
          />
          <Button label={texts.secondary} variant="secondary" onPress={() => (otherCopies.length > 0 ? setShowOthers(true) : chooseFile())} />
        </>
      ) : (
        <>
          <Text style={styles.body}>{texts.missingHint}</Text>
          <Button label={texts.pickFile} onPress={chooseFile} />
        </>
      )}

      {listVisible ? (
        <View style={styles.section}>
          <SectionHeader title={texts.otherCopies} />
          <Card tone="alt">
            {otherCopies.map((name) => (
              <ListRow key={name} title={safetyCopyLabel(name)} onPress={() => chooseSafety(name)} />
            ))}
          </Card>
          {!needsOtherSource ? <Button label={texts.pickFile} variant="secondary" onPress={chooseFile} /> : null}
        </View>
      ) : null}

      <Text style={styles.caption}>{texts.small}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg },
  title: { ...type.titleL, color: colors.text },
  heading: { ...type.titleM, color: colors.text },
  cardTitle: { ...type.bodyStrong, color: colors.text },
  body: { ...type.body, color: colors.text },
  caption: { ...type.secondary, color: colors.textSecondary },
  value: { ...type.bodyStrong, ...TABULAR, color: colors.text },
  columns: { flexDirection: 'row', gap: spacing.lg },
  column: { flex: 1 },
  line: { gap: spacing.xs, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  section: { gap: spacing.sm },
});
