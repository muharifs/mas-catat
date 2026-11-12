import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useRepos } from '@/db/provider';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { ErrorState } from '@/ui/components/ErrorState';
import { ListRow, RowText } from '@/ui/components/ListRow';
import { Loading } from '@/ui/components/Loading';
import { Money } from '@/ui/components/Money';
import { Notice } from '@/ui/components/Notice';
import { ReportLine } from '@/ui/components/ReportLine';
import { SectionHeader } from '@/ui/components/SectionHeader';
import { formatDate } from '@/ui/dates';
import { formatRupiah } from '@/ui/format';
import { entryTitle } from '@/ui/kasLabels';
import { colors, spacing, type } from '@/ui/theme';
import { useLoad } from '@/ui/useLoad';

// Loans of ONE member over all periods: summary, then loans and repayments in date order. Corrected entries stay in
// the list (struck through, marked "Dikoreksi"). All numbers come from the domain through the ledger repository.
export default function MemberLoanScreen() {
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  const repos = useRepos();

  const load = useCallback(async () => {
    const [member, balance, history, active] = await Promise.all([
      repos.members.getById(memberId),
      repos.ledger.getLoanBalance(memberId),
      repos.ledger.listLoanHistory(memberId),
      repos.periods.getActive(),
    ]);
    // A new loan is only for members of the active period.
    const canLendAgain = active ? (await repos.periods.getMembers(active.id)).some((m) => m.memberId === memberId) : false;
    return { member, balance, history, canLendAgain };
  }, [repos, memberId]);
  const { data, error, reload } = useLoad(load);

  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  if (!data) return <Loading />;
  const { member, balance, history, canLendAgain } = data;
  if (!member) return <ErrorState title="Data tidak ditemukan" message="Anggota tidak ditemukan. Kembali lalu pilih lagi." />;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{member.name}</Text>
      <Card>
        <ReportLine label="Dipinjam" amount={balance.lent} />
        <ReportLine label="Sudah dikembalikan" amount={balance.repaid} />
        <ReportLine label={balance.overpaid > 0 ? 'Selisih' : 'Sisa'} amount={balance.remaining} strong />
      </Card>
      {balance.overpaid > 0 ? (
        <Notice tone="warn" title={`Kelebihan bayar ${formatRupiah(balance.overpaid)}`}>
          Catatan lama: pelunasan lebih besar dari pinjaman. Catatan tidak diubah, dan tidak ada yang bisa dilunasi lagi.
        </Notice>
      ) : null}

      {balance.remaining > 0 ? (
        <Button label="Terima pelunasan" onPress={() => router.push({ pathname: '/kas/new', params: { kind: 'loan_repayment', memberId } })} />
      ) : null}
      {canLendAgain ? (
        <Button label="Pinjamkan lagi" variant="secondary" onPress={() => router.push({ pathname: '/kas/new', params: { kind: 'loan', memberId } })} />
      ) : null}

      <SectionHeader title="Riwayat pinjaman" />
      {history.length === 0 ? <Text style={styles.muted}>Belum ada pinjaman.</Text> : null}
      {history.map((e) => (
        <ListRow
          key={e.id}
          title={entryTitle(e)}
          strikeTitle={Boolean(e.reversedById)}
          tone={e.reversedById ? 'danger' : 'alt'}
          onPress={() => router.push({ pathname: '/kas/[entryId]', params: { entryId: e.id } })}
          right={<Money amount={e.amount} size="heading" tone="neutral" />}
        >
          <RowText>{formatDate(e.date)}</RowText>
          {e.note ? <RowText>{e.note}</RowText> : null}
          {e.reversedById ? <RowText tone="danger">Dikoreksi</RowText> : null}
        </ListRow>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  title: { ...type.titleL, color: colors.text },
  muted: { ...type.body, color: colors.textSecondary },
});
