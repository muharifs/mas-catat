import { router } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { KAS_KINDS } from '@/domain/kas';
import type { LedgerListItem } from '@/db/ledger';
import { useRepos } from '@/db/provider';
import { Button } from '@/ui/components/Button';
import { formatDate } from '@/ui/dates';
import { formatRupiah } from '@/ui/format';
import { flowText, KIND_LABELS, showsNoPosWarning, TYPE_LABELS, visibleNote } from '@/ui/kasLabels';
import { useLoad } from '@/ui/useLoad';

// Kas: balances of the three pos and the list of every entry (all periods). Balances come from ONE domain
// function (computeKasBalances, via repos.ledger.getKasBalances); this screen only shows them.
// FlatList is React Native's virtualized list: it renders only the rows on screen, unlike .map() in a web page.
export default function KasScreen() {
  const repos = useRepos();

  const load = useCallback(async () => {
    const [balances, entries, members, active, periods] = await Promise.all([
      repos.ledger.getKasBalances(),
      repos.ledger.listKas(),
      repos.members.list(),
      repos.periods.getActive(),
      repos.periods.list(),
    ]);
    return { balances, entries, members, active, hasPeriod: periods.length > 0 };
  }, [repos]);
  const { data, error } = useLoad(load);

  if (error) return <Text style={styles.error}>{error}</Text>;
  if (!data) return <Text style={styles.muted}>Memuat...</Text>;
  const { balances, entries, members, active, hasPeriod } = data;
  const nameOf = (id: string | null) => (id === null ? '' : (members.find((m) => m.id === id)?.name ?? ''));
  const byId = new Map(entries.map((e) => [e.id, e]));

  function title(e: LedgerListItem): string {
    if (e.type === 'reversal') {
      const original = e.reversesEntryId ? byId.get(e.reversesEntryId) : undefined;
      return `Koreksi: ${original ? TYPE_LABELS[original.type] : 'catatan'}`;
    }
    return TYPE_LABELS[e.type];
  }

  const header = (
    <View style={styles.header}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Saldo kas</Text>
        <Text>Tunai: {formatRupiah(balances.tunai)}</Text>
        <Text>Debit: {formatRupiah(balances.debit)}</Text>
        <Text style={styles.strong}>Total kas (Tunai + Debit): {formatRupiah(balances.actual)}</Text>
        <Text>Piutang (dipinjam anggota): {formatRupiah(balances.piutang)}</Text>
        <Text style={styles.hint}>Saldo dihitung dari semua catatan di semua periode. Catatan tanpa pos tidak dihitung.</Text>
      </View>

      {hasPeriod ? (
        <View style={styles.actions}>
          {KAS_KINDS.filter((kind) => active || kind !== 'loan').map((kind) => (
            <Button key={kind} label={KIND_LABELS[kind]} variant="secondary" onPress={() => router.push({ pathname: '/kas/new', params: { kind } })} />
          ))}
          {active ? null : (
            <Text style={styles.hint}>
              Tidak ada periode aktif: catatan baru masuk ke periode terakhir yang sudah berakhir. Pinjaman baru hanya untuk anggota periode aktif.
            </Text>
          )}
        </View>
      ) : (
        <Text style={styles.hint}>Belum ada periode, jadi catatan kas baru belum bisa dibuat. Buat periode dulu.</Text>
      )}

      <Text style={styles.section}>Riwayat</Text>
      {entries.length === 0 ? <Text style={styles.muted}>Belum ada catatan.</Text> : null}
    </View>
  );

  return (
    <FlatList
      data={entries}
      keyExtractor={(e) => e.id}
      ListHeaderComponent={header}
      contentContainerStyle={styles.list}
      renderItem={({ item: e }) => (
        <Pressable
          accessibilityRole="button"
          style={[styles.row, e.reversedById ? styles.rowCorrected : null]}
          onPress={() => router.push({ pathname: '/kas/[entryId]', params: { entryId: e.id } })}
        >
          <View style={styles.flex}>
            <Text style={[styles.weekTitle, e.reversedById ? styles.strike : null]}>{title(e)}</Text>
            <Text style={styles.muted}>
              {formatDate(e.date)} - {flowText(e)}
              {e.memberId ? ` - ${nameOf(e.memberId)}` : ''}
            </Text>
            {visibleNote(e) ? <Text style={styles.muted}>{visibleNote(e)}</Text> : null}
            {e.reversedById ? <Text style={styles.bad}>Dikoreksi</Text> : null}
            {showsNoPosWarning(e) ? <Text style={styles.warn}>Peringatan: tanpa pos, tidak dihitung di saldo</Text> : null}
          </View>
          <Text style={[styles.amount, e.direction === 'in' && e.toAccount === null ? styles.in : null]}>{formatRupiah(e.amount)}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 8 },
  header: { gap: 12, marginBottom: 4 },
  card: { padding: 16, borderRadius: 12, backgroundColor: '#f2f6f3', gap: 4 },
  cardTitle: { fontSize: 20, fontWeight: '700' },
  strong: { fontWeight: '700' },
  actions: { gap: 8 },
  section: { fontSize: 16, fontWeight: '700', marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 8, backgroundColor: '#f7f7f7' },
  rowCorrected: { backgroundColor: '#fdf1f0' },
  flex: { flex: 1 },
  weekTitle: { fontWeight: '600' },
  strike: { textDecorationLine: 'line-through' },
  amount: { fontWeight: '700' },
  in: { color: '#1f6f50' },
  hint: { color: '#666', fontSize: 13 },
  bad: { color: '#b3261e', fontWeight: '600' },
  warn: { color: '#8a4b00', fontSize: 13 },
  error: { padding: 16, color: '#b3261e' },
  muted: { color: '#666' },
});
