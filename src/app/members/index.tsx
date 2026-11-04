import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRepos } from '@/db/provider';
import { Button } from '@/ui/components/Button';
import { EmptyState } from '@/ui/components/EmptyState';
import { TextField } from '@/ui/components/TextField';
import { toIndonesian } from '@/ui/errors';
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

  if (loadError) return <Text style={styles.error}>{loadError}</Text>;
  if (!members) return <Text style={styles.muted}>Memuat...</Text>;

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
            error={addError}
          />
          <Button label="Tambah" onPress={add} />
          <Text style={styles.hint}>Ketuk nama untuk mengubahnya.</Text>
        </View>
      }
      ListEmptyComponent={<EmptyState title="Belum ada anggota" message="Tambahkan anggota pertama di atas." />}
      renderItem={({ item }) =>
        editingId === item.id ? (
          <View style={styles.row}>
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
          <Pressable
            style={styles.row}
            onPress={() => {
              setEditingId(item.id);
              setEditName(item.name);
              setEditError(null);
            }}
          >
            <Text style={styles.name}>{item.name}</Text>
          </Pressable>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8 },
  form: { gap: 10, marginBottom: 12 },
  hint: { color: '#666', fontSize: 13 },
  row: { padding: 12, borderRadius: 8, backgroundColor: '#f2f6f3', gap: 8 },
  name: { fontSize: 16 },
  actions: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  error: { padding: 16, color: '#b3261e' },
  muted: { padding: 16, color: '#666' },
});
