import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { backupFileName, backupReminder } from '@/domain/backup';
import type { CsvKind } from '@/domain/csv';
import { createBackupSnapshot } from '@/db/backup';
import { useDatabaseControl, useRepos } from '@/db/provider';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { ListRow, RowText } from '@/ui/components/ListRow';
import { Notice } from '@/ui/components/Notice';
import { SectionHeader } from '@/ui/components/SectionHeader';
import {
  BACKUP_WARNING,
  CSV_HINT,
  lastSharedText,
  NO_ENCRYPTION_HINT,
  OFFSITE_HINT,
  ONE_PHONE_HINT,
} from '@/ui/backupLabels';
import { buildCsvFor, CSV_FILES, csvFileName } from '@/ui/csvFiles';
import { todayIso } from '@/ui/dates';
import { toIndonesian } from '@/ui/errors';
import { readLastShared, shareBackupFile, shareCsvFile, sweepShareCache, writeLastShared } from '@/ui/shareFile';
import { colors, spacing, type } from '@/ui/theme';
import { toast } from '@/ui/toast';

// "Cadangan dan Ekspor": share a database backup, share CSV files for a spreadsheet, and go to the restore screen.
// While a job runs `busy` is set and every button is disabled (and a second tap is ignored through a ref, because
// state updates arrive after the tap: a fast double tap would otherwise start the job twice).
export default function BackupScreen() {
  const repos = useRepos();
  const { db, bridge } = useDatabaseControl();
  const [lastShared, setLastShared] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);

  useFocusEffect(
    useCallback(() => {
      sweepShareCache(); // earlier export files are removed now, not right after sharing
      setLastShared(readLastShared());
    }, []),
  );

  async function run(label: string, job: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(label);
    setError(null);
    try {
      await job();
    } catch (e) {
      setError(toIndonesian(e));
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }

  function confirmBackup() {
    Alert.alert('Bagikan cadangan', `${BACKUP_WARNING}\n\n${OFFSITE_HINT}\n\n${NO_ENCRYPTION_HINT}`, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Lanjut bagikan', onPress: () => void run('Membuat cadangan...', shareBackup) },
    ]);
  }

  async function shareBackup() {
    // Bytes are taken inside runExclusive (no transaction can run meanwhile); the share sheet itself does not hold the lock.
    const { bytes, userVersion } = await createBackupSnapshot(bridge, db);
    await shareBackupFile(backupFileName(new Date(), userVersion), bytes);
    // The share sheet closed. We cannot know whether it was sent, so this is "last shared", not "last saved".
    writeLastShared(new Date().toISOString());
    setLastShared(readLastShared());
    toast('Menu bagikan ditutup. Pastikan cadangan terkirim.');
  }

  async function shareCsv(kind: CsvKind) {
    await shareCsvFile(csvFileName(kind, todayIso()), await buildCsvFor(kind, repos));
  }

  const now = new Date();
  const reminder = backupReminder(lastShared, now, true);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {busy ? <Notice tone="info">{busy}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <View style={styles.section}>
        <SectionHeader title="Cadangan" />
        <Card>
          <Text style={styles.body}>{lastSharedText(lastShared, reminder)}</Text>
          <Notice tone="warn">{BACKUP_WARNING}</Notice>
          <Text style={styles.body}>{OFFSITE_HINT}</Text>
          <Button label="Buat dan bagikan cadangan" onPress={confirmBackup} disabled={busy !== null} />
          <Text style={styles.caption}>{NO_ENCRYPTION_HINT}</Text>
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Ekspor CSV untuk spreadsheet" />
        <Card>
          <Notice tone="info">{CSV_HINT}</Notice>
          {CSV_FILES.map((spec) => (
            <View key={spec.kind} style={styles.csvRow}>
              <Button
                label={spec.label}
                variant="secondary"
                disabled={busy !== null}
                onPress={() => void run('Menyiapkan berkas...', () => shareCsv(spec.kind))}
              />
              <Text style={styles.caption}>{spec.hint}</Text>
            </View>
          ))}
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Pulihkan atau mulai dari nol" />
        <Card tone="alt">
          <Text style={styles.body}>{ONE_PHONE_HINT}</Text>
          <ListRow
            title="Pulihkan data"
            onPress={busy === null ? () => router.push('/backup/restore') : undefined}
            right={<RowText>Dari cadangan</RowText>}
          />
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg },
  section: { gap: spacing.sm },
  body: { ...type.body, color: colors.text },
  caption: { ...type.secondary, color: colors.textSecondary },
  csvRow: { gap: spacing.xs },
});
