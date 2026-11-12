import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { useRepos } from '@/db/provider';
import { canHardDelete } from '@/domain/members';
import { sortByName } from '@/domain/sort';
import { Button } from '@/ui/components/Button';
import { EmptyState } from '@/ui/components/EmptyState';
import { ErrorState } from '@/ui/components/ErrorState';
import { ListRow, RowText } from '@/ui/components/ListRow';
import { Loading } from '@/ui/components/Loading';
import { SectionHeader } from '@/ui/components/SectionHeader';
import { TextField } from '@/ui/components/TextField';
import { archiveBlockText, toIndonesian } from '@/ui/errors';
import { formatRupiah } from '@/ui/format';
import { colors, radius, spacing, type } from '@/ui/theme';
import { useLoad } from '@/ui/useLoad';

// Members: list, add, tap a row to rename, delete (no data at all) or archive (has history). Archived members sit in a
// collapsed section with "Aktifkan lagi".
// FlatList is the React Native list: it renders only the visible rows, unlike mapping to <li> on the web.
export default function MembersScreen() {
  const repos = useRepos();
  const load = useCallback(async () => {
    const [list, loans] = await Promise.all([repos.members.list(), repos.ledger.listLoanBalances()]);
    return { list, remaining: new Map(loans.members.filter((l) => l.remaining > 0).map((l) => [l.memberId, l.remaining])) };
  }, [repos]);
  const { data, error: loadError, reload } = useLoad(load);
  // list() holds everyone; the screen splits active from archived.
  const members = useMemo(() => (data ? sortByName(data.list.filter((m) => !m.archivedAt), (m) => m.name) : null), [data]);
  const archived = useMemo(() => (data ? sortByName(data.list.filter((m) => m.archivedAt), (m) => m.name) : []), [data]);
  const [showArchived, setShowArchived] = useState(false);
  // null = not known yet. true = the member has no data at all, so it can be deleted; false = archive instead.
  const [editCanDelete, setEditCanDelete] = useState<boolean | null>(null);

  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  // Error of "Aktifkan lagi", shown on the archived row that was tapped (not in the add form).
  const [unarchiveError, setUnarchiveError] = useState<{ id: string; message: string } | null>(null);
  // Counts startEdit calls so a slow getUsage answer for an earlier tap cannot overwrite the member now being edited.
  const usageRequest = useRef(0);

  async function add() {
    try {
      await repos.members.create(newName);
      setNewName('');
      setAddError(null);
      await reload();
    } catch (e) {
      setAddError(toIndonesian(e));
    }
  }

  async function saveEdit() {
    if (!editingId) return;
    try {
      await repos.members.rename(editingId, editName);
      setEditingId(null);
      setEditError(null);
      await reload();
    } catch (e) {
      setEditError(toIndonesian(e));
    }
  }

  function startEdit(id: string, name: string) {
    setEditingId(id);
    setEditName(name);
    setEditError(null);
    setEditCanDelete(null);
    const request = ++usageRequest.current;
    repos.members.getUsage(id).then(
      (usage) => {
        if (request === usageRequest.current) setEditCanDelete(canHardDelete(usage));
      },
      (e: unknown) => {
        if (request === usageRequest.current) setEditError(toIndonesian(e, 'load'));
      },
    );
  }

  function stopEdit() {
    usageRequest.current++; // ignore a getUsage answer that is still on its way
    setEditingId(null);
    setEditError(null);
  }

  // Alert.alert is the native dialog (web: window.confirm); buttons are an array, the destructive one is styled red.
  function confirmDelete(id: string, name: string) {
    Alert.alert(
      `Hapus ${name}?`,
      `${name} belum punya data apa pun, jadi akan dihapus dari daftar. Tindakan ini tidak bisa dibatalkan.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: () => {
            repos.members.remove(id).then(
              () => {
                stopEdit();
                void reload();
              },
              (e: unknown) => setEditError(toIndonesian(e)),
            );
          },
        },
      ],
    );
  }

  async function confirmArchive(id: string, name: string) {
    try {
      // Ask first, so a member that cannot be archived never sees the confirmation dialog.
      const blocker = await repos.members.archiveBlocker(id);
      if (blocker) {
        setEditError(archiveBlockText(blocker.code, blocker.amount));
        return;
      }
    } catch (e) {
      setEditError(toIndonesian(e));
      return;
    }
    Alert.alert(
      `Arsipkan ${name}?`,
      `${name} akan disembunyikan dari daftar anggota dan dari pilihan anggota periode baru. Riwayat dan laporan tetap utuh. Bisa diaktifkan lagi kapan saja.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Arsipkan',
          style: 'destructive',
          onPress: () => {
            repos.members.archive(id).then(
              () => {
                stopEdit();
                void reload();
              },
              (e: unknown) => setEditError(toIndonesian(e)),
            );
          },
        },
      ],
    );
  }

  async function unarchive(id: string) {
    setUnarchiveError(null);
    try {
      await repos.members.unarchive(id);
      await reload();
    } catch (e) {
      setUnarchiveError({ id, message: toIndonesian(e) });
    }
  }

  if (loadError) return <ErrorState message={loadError} onRetry={() => void reload()} />;
  if (!members) return <Loading />;

  return (
    <FlatList
      data={members}
      keyExtractor={(m) => m.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.container}
      ListHeaderComponent={
        <View style={styles.form}>
          <TextField
            label="Tambah anggota"
            placeholder="Nama anggota"
            value={newName}
            onChangeText={(t) => {
              setNewName(t);
              setAddError(null);
            }}
            onSubmitEditing={add}
            // React Native 0.88: submitBehavior replaces the deprecated blurOnSubmit. "submit" runs onSubmitEditing
            // and KEEPS the keyboard open, so several members can be added one after another.
            submitBehavior="submit"
            returnKeyType="done"
            error={addError}
          />
          <Button label="Tambah" onPress={add} />
          <SectionHeader title={`${members.length} anggota`} />
          {members.length > 0 ? <Text style={styles.hint}>Ketuk nama untuk mengubah nama, menghapus, atau mengarsipkan anggota.</Text> : null}
        </View>
      }
      ListEmptyComponent={<EmptyState title="Belum ada anggota" message="Tambahkan anggota pertama di atas." />}
      ListFooterComponent={
        archived.length > 0 ? (
          <View style={styles.archived}>
            <Button
              label={`${showArchived ? 'Sembunyikan' : 'Tampilkan'} yang diarsipkan (${archived.length})`}
              variant="tertiary"
              onPress={() => setShowArchived((v) => !v)}
            />
            {showArchived
              ? archived.map((m) => (
                  <ListRow
                    key={m.id}
                    title={m.name}
                    tone="alt"
                    right={<Button label="Aktifkan lagi" variant="secondary" compact onPress={() => void unarchive(m.id)} />}
                  >
                    {data?.remaining.has(m.id) ? <RowText>Pinjaman: sisa {formatRupiah(data.remaining.get(m.id) ?? 0)}</RowText> : null}
                    {unarchiveError?.id === m.id ? <RowText tone="danger">{unarchiveError.message}</RowText> : null}
                  </ListRow>
                ))
              : null}
          </View>
        ) : undefined
      }
      renderItem={({ item }) =>
        editingId === item.id ? (
          <View style={styles.editRow}>
            <TextField value={editName} onChangeText={setEditName} onSubmitEditing={saveEdit} autoFocus error={editError} />
            <View style={styles.actions}>
              <Button label="Simpan" onPress={saveEdit} style={styles.flex} />
              <Button label="Batal" variant="secondary" onPress={stopEdit} style={styles.flex} />
            </View>
            {editCanDelete === true ? (
              <Button label="Hapus anggota" variant="dangerOutline" onPress={() => confirmDelete(item.id, item.name)} />
            ) : null}
            {editCanDelete === false ? (
              <Button label="Arsipkan anggota" variant="dangerOutline" onPress={() => void confirmArchive(item.id, item.name)} />
            ) : null}
          </View>
        ) : (
          <ListRow
            title={item.name}
            accessibilityLabel={`${item.name}, ketuk untuk mengubah nama`}
            onPress={() => startEdit(item.id, item.name)}
          >
            {data?.remaining.has(item.id) ? <RowText>Pinjaman: sisa {formatRupiah(data.remaining.get(item.id) ?? 0)}</RowText> : null}
          </ListRow>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.sm },
  form: { gap: spacing.md, marginBottom: spacing.md },
  hint: { ...type.secondary, color: colors.textSecondary },
  editRow: { padding: spacing.md, borderRadius: radius.sm, backgroundColor: colors.bgCard, gap: spacing.sm },
  archived: { gap: spacing.sm, marginTop: spacing.lg },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
