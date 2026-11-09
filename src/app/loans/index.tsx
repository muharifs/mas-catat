import { router } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { sortByName } from '@/domain/sort';
import { useRepos } from '@/db/provider';
import { Card } from '@/ui/components/Card';
import { ErrorState } from '@/ui/components/ErrorState';
import { ListRow, RowText } from '@/ui/components/ListRow';
import { Loading } from '@/ui/components/Loading';
import { Money } from '@/ui/components/Money';
import { formatRupiah } from '@/ui/format';
import { colors, spacing, type } from '@/ui/theme';
import { useLoad } from '@/ui/useLoad';

// Pinjaman anggota: who still owes the kas, A-Z. The Piutang total comes from the kas balances (the same number as
// the Kas screen); every per-member number comes from computeLoanBalances via repos.ledger.listLoanBalances.
// Two special rows: an old Piutang opening balance without a name (cannot be repaid) and a member who repaid more
// than was borrowed (old data, shown as a warning, no repayment possible).
export default function LoansScreen() {
  const repos = useRepos();

  const load = useCallback(async () => {
    const [balances, loans, members] = await Promise.all([repos.ledger.getKasBalances(), repos.ledger.listLoanBalances(), repos.members.list()]);
    const nameOf = new Map(members.map((m) => [m.id, m.name]));
    const named = loans.members.map((l) => ({ ...l, name: nameOf.get(l.memberId) ?? '-' }));
    return {
      piutang: balances.piutang,
      open: sortByName(named.filter((l) => l.remaining > 0), (l) => l.name),
      overpaid: sortByName(named.filter((l) => l.overpaid > 0), (l) => l.name),
      unnamedOpening: loans.unnamedOpening,
    };
  }, [repos]);
  const { data, error, reload } = useLoad(load);

  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  if (!data) return <Loading />;
  const { piutang, open, overpaid, unnamedOpening } = data;
  const nothing = open.length === 0 && overpaid.length === 0 && unnamedOpening === 0;

  const header = (
    <View style={styles.header}>
      <Card>
        <Text style={styles.cardLabel}>Piutang (dipinjam anggota)</Text>
        <Money amount={piutang} size="display" />
        <Text style={styles.hint}>Sama dengan Piutang di layar Kas. Ketuk nama untuk melihat rincian dan menerima pelunasan.</Text>
      </Card>
      {nothing ? <Text style={styles.muted}>Tidak ada pinjaman.</Text> : null}
    </View>
  );

  const footer = (
    <View style={styles.footer}>
      {overpaid.map((l) => (
        <ListRow key={l.memberId} title={l.name} tone="alt" onPress={() => router.push({ pathname: '/loans/[memberId]', params: { memberId: l.memberId } })}>
          <RowText tone="warn">Kelebihan bayar {formatRupiah(l.overpaid)}</RowText>
          <RowText>Catatan lama: pelunasan lebih besar dari pinjaman. Tidak ada yang bisa dilunasi lagi.</RowText>
        </ListRow>
      ))}
      {unnamedOpening !== 0 ? (
        <ListRow title="Saldo awal tanpa nama" tone="alt" onPress={() => router.push('/riwayat')} right={<Money amount={unnamedOpening} size="heading" />}>
          <RowText tone="warn">Tidak bisa dilunasi karena tidak ada nama anggotanya.</RowText>
          <RowText>Koreksi catatan saldo awal Piutang di daftar Kas, lalu catat ulang dengan nama anggota.</RowText>
        </ListRow>
      ) : null}
    </View>
  );

  return (
    <FlatList
      data={open}
      keyExtractor={(l) => l.memberId}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      contentContainerStyle={styles.list}
      renderItem={({ item: l }) => (
        <ListRow
          title={l.name}
          onPress={() => router.push({ pathname: '/loans/[memberId]', params: { memberId: l.memberId } })}
          right={<Money amount={l.remaining} size="heading" />}
        >
          <RowText>Sisa pinjaman</RowText>
        </ListRow>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.sm },
  header: { gap: spacing.md, marginBottom: spacing.xs },
  footer: { gap: spacing.sm, marginTop: spacing.xs },
  cardLabel: { ...type.label, color: colors.textSecondary },
  hint: { ...type.secondary, color: colors.textSecondary },
  muted: { ...type.body, color: colors.textSecondary },
});
