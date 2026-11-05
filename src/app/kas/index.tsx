import { router } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { KAS_KINDS } from '@/domain/kas';
import type { LedgerListItem } from '@/db/ledger';
import { useRepos } from '@/db/provider';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { ErrorState } from '@/ui/components/ErrorState';
import { ListRow, RowText } from '@/ui/components/ListRow';
import { Loading } from '@/ui/components/Loading';
import { Money } from '@/ui/components/Money';
import { formatDate } from '@/ui/dates';
import { amountSign, flowText, KIND_LABELS, showsNoPosWarning, TYPE_LABELS, visibleNote } from '@/ui/kasLabels';
import { colors, spacing, type } from '@/ui/theme';
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
  const { data, error, reload } = useLoad(load);

  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  if (!data) return <Loading />;
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
      <Card>
        <Text style={styles.cardLabel}>Total kas (Tunai + Debit)</Text>
        <Money amount={balances.actual} size="display" />
        <View style={styles.posRow}>
          <View style={styles.pos}>
            <Text style={styles.cardLabel}>Tunai</Text>
            <Money amount={balances.tunai} size="large" />
          </View>
          <View style={styles.pos}>
            <Text style={styles.cardLabel}>Debit</Text>
            <Money amount={balances.debit} size="large" />
          </View>
        </View>
        <Text style={styles.cardLabel}>Piutang (dipinjam anggota)</Text>
        <Money amount={balances.piutang} size="heading" />
        <Text style={styles.hint}>Saldo dihitung dari semua catatan di semua periode. Catatan tanpa pos tidak dihitung.</Text>
      </Card>

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
        <ListRow
          title={title(e)}
          strikeTitle={Boolean(e.reversedById)}
          tone={e.reversedById ? 'danger' : 'alt'}
          onPress={() => router.push({ pathname: '/kas/[entryId]', params: { entryId: e.id } })}
          // "+" / "-" with colour, while the text "Masuk ke / Keluar dari" below keeps the meaning without colour.
          right={<Money amount={e.amount} size="heading" sign={amountSign(e)} />}
        >
          <RowText>
            {formatDate(e.date)} - {flowText(e)}
            {e.memberId ? ` - ${nameOf(e.memberId)}` : ''}
          </RowText>
          {visibleNote(e) ? <RowText>{visibleNote(e)}</RowText> : null}
          {e.reversedById ? <RowText tone="danger">Dikoreksi</RowText> : null}
          {showsNoPosWarning(e) ? <RowText tone="warn">Peringatan: tanpa pos, tidak dihitung di saldo</RowText> : null}
        </ListRow>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.sm },
  header: { gap: spacing.md, marginBottom: spacing.xs },
  cardLabel: { ...type.label, color: colors.textMuted },
  posRow: { flexDirection: 'row', gap: spacing.lg },
  pos: { flex: 1, gap: spacing.xs },
  actions: { gap: spacing.sm },
  section: { ...type.heading, color: colors.text, marginTop: spacing.sm },
  hint: { ...type.caption, color: colors.textMuted },
  muted: { ...type.body, color: colors.textMuted },
});
