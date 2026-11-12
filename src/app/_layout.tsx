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
      <Stack.Screen name="periods/new" options={{ title: 'Buat periode' }} />
      <Stack.Screen name="periods/[id]/index" options={{ title: 'Jadwal periode' }} />
      <Stack.Screen name="periods/[id]/payments" options={{ title: 'Pembayaran' }} />
      <Stack.Screen name="periods/[id]/members/[memberId]" options={{ title: 'Pembayaran anggota' }} />
      <Stack.Screen name="periods/[id]/pay" options={{ title: 'Catat pembayaran' }} />
      <Stack.Screen name="periods/[id]/meetings/[number]" options={{ title: 'Atur pertemuan' }} />
      <Stack.Screen name="periods/[id]/payout" options={{ title: 'Bayar tuan rumah' }} />
      <Stack.Screen name="periods/[id]/close" options={{ title: 'Akhiri periode' }} />
      <Stack.Screen name="credits/index" options={{ title: 'Titipan anggota' }} />
      <Stack.Screen name="kas/index" options={{ title: 'Catat kas' }} />
      <Stack.Screen name="filter-riwayat" options={{ title: 'Filter riwayat' }} />
      <Stack.Screen name="kas/new" options={{ title: 'Catat kas' }} />
      <Stack.Screen name="kas/[entryId]" options={{ title: 'Rincian catatan' }} />
      <Stack.Screen name="loans/index" options={{ title: 'Pinjaman anggota' }} />
      <Stack.Screen name="loans/[memberId]" options={{ title: 'Pinjaman anggota' }} />
      <Stack.Screen name="reports/period/[id]/index" options={{ title: 'Laporan periode' }} />
      <Stack.Screen name="reports/period/[id]/meetings/[number]" options={{ title: 'Laporan pertemuan' }} />
      <Stack.Screen name="reports/period/[id]/members/[memberId]" options={{ title: 'Riwayat anggota' }} />
      <Stack.Screen name="backup/index" options={{ title: 'Cadangan dan ekspor' }} />
      <Stack.Screen name="backup/restore" options={{ title: 'Pulihkan data' }} />
      {/* Developer-only component gallery: registered (reachable) only when __DEV__ is true. */}
      <Stack.Protected guard={__DEV__}>
        <Stack.Screen name="dev/components" options={{ title: 'Galeri komponen' }} />
      </Stack.Protected>
    </Stack>
  );
}
