import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useRepos } from '@/db/provider';
import { Button } from '@/ui/components/Button';
import { EmptyState } from '@/ui/components/EmptyState';
import { ErrorState } from '@/ui/components/ErrorState';
import { ListRow } from '@/ui/components/ListRow';
import { Loading } from '@/ui/components/Loading';
import { TextField } from '@/ui/components/TextField';
import { toIndonesian } from '@/ui/errors';
import { colors, spacing, type } from '@/ui/theme';
import { useLoad } from '@/ui/useLoad';

// Members: list, add, tap a row to rename. No delete in M3 (owner decision).
// FlatList is the React Native list: it renders only the visible rows, unlike mapping to <li> on the web.
export default function MembersScreen() {
  const repos = useRepos();
  const load = useCallback(() => repos.members.list(), [repos]);
  const { data: members, error: loadError, reload } = useLoad(load);

  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

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
          <Text style={styles.count}>{members.length} anggota</Text>
          {members.length > 0 ? <Text style={styles.hint}>Ketuk nama untuk mengubahnya.</Text> : null}
        </View>
      }
      ListEmptyComponent={<EmptyState title="Belum ada anggota" message="Tambahkan anggota pertama di atas." />}
      renderItem={({ item }) =>
        editingId === item.id ? (
          <View style={styles.editRow}>
            <TextField value={editName} onChangeText={setEditName} onSubmitEditing={saveEdit} autoFocus error={editError} />
            <View style={styles.actions}>
              <Button label="Simpan" onPress={saveEdit} style={styles.flex} />
              <Button
                label="Batal"
                variant="secondary"
                onPress={() => {
                  setEditingId(null);
                  setEditError(null);
                }}
                style={styles.flex}
              />
            </View>
          </View>
        ) : (
          <ListRow
            title={item.name}
            accessibilityLabel={`${item.name}, ketuk untuk mengubah nama`}
            onPress={() => {
              setEditingId(item.id);
              setEditName(item.name);
              setEditError(null);
            }}
          />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.sm },
  form: { gap: spacing.md, marginBottom: spacing.md },
  count: { ...type.heading, color: colors.text },
  hint: { ...type.caption, color: colors.textMuted },
  editRow: { padding: spacing.md, borderRadius: 8, backgroundColor: colors.surface, gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
