import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { showDialog } from '@/ui/dialog';
import { useRepos } from '@/db/provider';
import { canHardDelete } from '@/domain/members';
import { sortByName } from '@/domain/sort';
import { Button } from '@/ui/components/Button';
import { EmptyState } from '@/ui/components/EmptyState';
import { ErrorState } from '@/ui/components/ErrorState';
import { ListRow, RowText } from '@/ui/components/ListRow';
import { Loading } from '@/ui/components/Loading';
import { SearchField } from '@/ui/components/SearchField';
import { Section } from '@/ui/components/Section';
import { TextField } from '@/ui/components/TextField';
import { archiveBlockText, toIndonesian } from '@/ui/errors';
import { formatRupiah } from '@/ui/format';
import { filterByQuery, shouldShowMemberSearch } from '@/ui/memberSearch';
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

  const [query, setQuery] = useState(''); // local search word; declared before the early returns
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
      setQuery(''); // so the new member is visible right away
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

  // showDialog is the in-app dialog (web: window.confirm); buttons are an array, the destructive one is styled red.
  function confirmDelete(id: string, name: string) {
    showDialog({
      title: `Hapus ${name}?`,
      message: `${name} belum punya data apa pun, jadi akan dihapus dari daftar. Tindakan ini tidak bisa dibatalkan.`,
      buttons: [
        { label: 'Batal', role: 'cancel' },
        {
          label: 'Hapus',
          role: 'destructive',
          onPress: () => {
            repos.members.remove(id).then(
              () => {
                stopEdit();
                void reload();
              },
              (e: unknown) => setEditError(toIndonesian(e, 'delete_member')),
            );
          },
        },
      ],
    });
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
      setEditError(toIndonesian(e, 'archive'));
      return;
    }
    showDialog({
      title: `Arsipkan ${name}?`,
      message: `${name} akan disembunyikan dari daftar anggota dan dari pilihan anggota periode baru. Riwayat dan laporan tetap utuh. Bisa diaktifkan lagi kapan saja.`,
      buttons: [
        { label: 'Batal', role: 'cancel' },
        {
          label: 'Arsipkan',
          role: 'destructive',
          onPress: () => {
            repos.members.archive(id).then(
              () => {
                stopEdit();
                void reload();
              },
              (e: unknown) => setEditError(toIndonesian(e, 'archive')),
            );
          },
        },
      ],
    });
  }

  async function unarchive(id: string) {
    setUnarchiveError(null);
    try {
      await repos.members.unarchive(id);
      await reload();
    } catch (e) {
      setUnarchiveError({ id, message: toIndonesian(e, 'unarchive') });
    }
  }

  if (loadError) return <ErrorState message={loadError} onRetry={() => void reload()} />;
  if (!members) return <Loading />;

  // Search only hides rows. The row being edited stays visible. The archived list uses the same word.
  const searchShown = shouldShowMemberSearch(members.length);
  const activeQuery = searchShown ? query : '';
  const found = filterByQuery(members, (m) => m.name, activeQuery, (m) => m.id === editingId);
  const foundArchived = filterByQuery(archived, (m) => m.name, activeQuery).items;

  return (
    <FlatList
      data={found.items}
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
          <Section title={`${members.length} anggota`}>
            {members.length > 0 ? <Text style={styles.hint}>Ketuk nama untuk mengubah nama, menghapus, atau mengarsipkan anggota.</Text> : null}
          </Section>
          {searchShown ? <SearchField value={query} onChangeText={setQuery} matchCount={found.matchCount} totalCount={members.length} /> : null}
        </View>
      }
      ListEmptyComponent={members.length === 0 ? <EmptyState title="Belum ada anggota" message="Tambahkan anggota pertama di atas." /> : undefined}
      ListFooterComponent={
        archived.length > 0 ? (
          <View style={styles.archived}>
            <Button
              label={`${showArchived ? 'Sembunyikan' : 'Tampilkan'} yang diarsipkan (${archived.length})`}
              variant="tertiary"
              onPress={() => setShowArchived((v) => !v)}
            />
            {showArchived
              ? foundArchived.map((m) => (
                  <ListRow
                    key={m.id}
                    title={m.name}
                    tone="alt"
                  >
                    {data?.remaining.has(m.id) ? <RowText>Pinjaman: sisa {formatRupiah(data.remaining.get(m.id) ?? 0)}</RowText> : null}
                    {unarchiveError?.id === m.id ? <RowText tone="danger">{unarchiveError.message}</RowText> : null}
                    {/* Below the text at full width (not in the right slot), so a long name or a big font never squeezes the label. */}
                    <Button label="Aktifkan lagi" variant="secondary" onPress={() => void unarchive(m.id)} />
                  </ListRow>
                ))
              : null}
          </View>
        ) : undefined
      }
      renderItem={({ item }) =>
        editingId === item.id ? (
          <View style={styles.editRow}>
            <TextField label="Nama anggota" value={editName} onChangeText={setEditName} onSubmitEditing={saveEdit} autoFocus error={editError} />
            <View style={styles.actions}>
              <Button label="Simpan" onPress={saveEdit} style={styles.flex} />
              <Button label="Batal" variant="secondary" onPress={stopEdit} style={styles.flex} />
            </View>
            {editCanDelete === null ? null : (
              // Destructive action set apart from Simpan/Batal by a hairline and extra space.
              <View style={styles.dangerZone}>
                {editCanDelete ? (
                  <Button label="Hapus anggota" variant="dangerOutline" onPress={() => confirmDelete(item.id, item.name)} />
                ) : (
                  <Button label="Arsipkan anggota" variant="dangerOutline" onPress={() => void confirmArchive(item.id, item.name)} />
                )}
              </View>
            )}
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
  editRow: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.bgCard, gap: spacing.sm },
  dangerZone: { marginTop: spacing.sm, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  archived: { gap: spacing.sm, marginTop: spacing.lg },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
