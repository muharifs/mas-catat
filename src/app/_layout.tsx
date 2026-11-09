import { Stack } from 'expo-router';
import { colors } from '@/ui/theme';
import { DatabaseProvider, useDatabaseControl } from '@/db/provider';

// Root navigator. Every file under src/app/ is a screen.
// DatabaseProvider opens and migrates the database once; screens render only after that succeeded.
export default function RootLayout() {
  return (
    <DatabaseProvider>
      <AppStack />
    </DatabaseProvider>
  );
}

// `key={dataVersion}`: after a restore React discards the whole navigator and every screen under it, so no screen
// keeps showing data (or state) from before the restore. On the web this is the same trick as key on a component.
function AppStack() {
  const { dataVersion } = useDatabaseControl();
  return (
    <Stack key={dataVersion} screenOptions={{
        headerTitle: 'Mas Catat',
        // Paper-coloured screens so white cards stand out; the header sits on the same paper.
        contentStyle: { backgroundColor: colors.bgPage },
        headerStyle: { backgroundColor: colors.bgPage },
        headerShadowVisible: false,
        headerTintColor: colors.text,
      }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="members/index" options={{ title: 'Anggota' }} />
      <Stack.Screen name="periods/index" options={{ title: 'Periode' }} />
      <Stack.Screen name="periods/new" options={{ title: 'Buat Periode' }} />
      <Stack.Screen name="periods/[id]/index" options={{ title: 'Detail Periode' }} />
      <Stack.Screen name="periods/[id]/payments" options={{ title: 'Pembayaran' }} />
      <Stack.Screen name="periods/[id]/members/[memberId]" options={{ title: 'Anggota di Periode' }} />
      <Stack.Screen name="periods/[id]/pay" options={{ title: 'Catat Pembayaran' }} />
      <Stack.Screen name="periods/[id]/meetings/[number]" options={{ title: 'Tuan Rumah Pertemuan' }} />
      <Stack.Screen name="periods/[id]/payout" options={{ title: 'Bayar Tuan Rumah' }} />
      <Stack.Screen name="periods/[id]/close" options={{ title: 'Akhiri Periode' }} />
      <Stack.Screen name="credits/index" options={{ title: 'Titipan Anggota' }} />
      <Stack.Screen name="kas/index" options={{ title: 'Catat Kas' }} />
      <Stack.Screen name="filter-riwayat" options={{ title: 'Filter Riwayat' }} />
      <Stack.Screen name="kas/new" options={{ title: 'Catat Kas' }} />
      <Stack.Screen name="kas/[entryId]" options={{ title: 'Detail Kas' }} />
      <Stack.Screen name="loans/index" options={{ title: 'Pinjaman Anggota' }} />
      <Stack.Screen name="loans/[memberId]" options={{ title: 'Pinjaman Anggota' }} />
      <Stack.Screen name="reports/period/[id]/index" options={{ title: 'Laporan Periode' }} />
      <Stack.Screen name="reports/period/[id]/meetings/[number]" options={{ title: 'Laporan Pertemuan' }} />
      <Stack.Screen name="reports/period/[id]/members/[memberId]" options={{ title: 'Riwayat Anggota' }} />
      <Stack.Screen name="backup/index" options={{ title: 'Cadangan dan Ekspor' }} />
      <Stack.Screen name="backup/restore" options={{ title: 'Pulihkan Data' }} />
    </Stack>
  );
}
