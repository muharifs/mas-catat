import { router } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KAS_KINDS } from '@/domain/kas';
import { useRepos } from '@/db/provider';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { ErrorState } from '@/ui/components/ErrorState';
import { Loading } from '@/ui/components/Loading';
import { Money } from '@/ui/components/Money';
import { KIND_LABELS } from '@/ui/kasLabels';
import { formatRupiah } from '@/ui/format';
import { colors, MIN_TOUCH, spacing, type } from '@/ui/theme';
import { useLoad } from '@/ui/useLoad';

// Catat kas: balances of the three pos and the buttons to record a kas entry. The list of entries lives in the Riwayat tab.
// Balances come from ONE domain function (computeKasBalances, via repos.ledger.getKasBalances); this screen only shows them.
export default function KasScreen() {
  const repos = useRepos();

  const load = useCallback(async () => {
    const [balances, active, periods, loans] = await Promise.all([
      repos.ledger.getKasBalances(),
      repos.periods.getActive(),
      repos.periods.list(),
      repos.ledger.listLoanBalances(),
    ]);
    return { balances, active, hasPeriod: periods.length > 0, loans };
  }, [repos]);
  const { data, error, reload } = useLoad(load);

  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  if (!data) return <Loading />;
  const { balances, active, hasPeriod, loans } = data;
  return (
    <ScrollView contentContainerStyle={styles.list}>
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Piutang, buka daftar pinjaman anggota"
          onPress={() => router.push('/loans')}
          style={({ pressed }) => [styles.piutang, pressed && styles.pressed]}
        >
          <Text style={styles.cardLabel}>Piutang (dipinjam anggota)</Text>
          <Money amount={balances.piutang} size="heading" />
          <Text style={styles.link}>Lihat pinjaman per anggota</Text>
        </Pressable>
        <Text style={styles.hint}>Saldo dihitung dari semua catatan di semua periode. Catatan tanpa pos tidak dihitung. Semua catatan ada di tab Riwayat.</Text>
      </Card>

      {hasPeriod ? (
        <View style={styles.actions}>
          {KAS_KINDS.filter((kind) => active || kind !== 'loan').map((kind) => (
            <View key={kind} style={styles.action}>
              <Button label={KIND_LABELS[kind]} variant="secondary" onPress={() => router.push({ pathname: '/kas/new', params: { kind } })} />
              {kind === 'loan_repayment' ? (
                <Text style={styles.hint}>
                  {loans.openCount > 0 ? `${loans.openCount} anggota, sisa ${formatRupiah(loans.openRemaining)}` : 'Tidak ada pinjaman'}
                </Text>
              ) : null}
            </View>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.md },
  cardLabel: { ...type.label, color: colors.textMuted },
  posRow: { flexDirection: 'row', gap: spacing.lg },
  pos: { flex: 1, gap: spacing.xs },
  actions: { gap: spacing.sm },
  action: { gap: spacing.xs },
  piutang: { minHeight: MIN_TOUCH, gap: spacing.xs, justifyContent: 'center' },
  pressed: { opacity: 0.75 },
  link: { ...type.label, color: colors.primary },
  hint: { ...type.caption, color: colors.textMuted },
});
