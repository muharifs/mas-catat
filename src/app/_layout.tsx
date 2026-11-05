import { Stack } from 'expo-router';
import { DatabaseProvider } from '@/db/provider';

// Root navigator. Every file under src/app/ is a screen.
// DatabaseProvider opens and migrates the database once; screens render only after that succeeded.
export default function RootLayout() {
  return (
    <DatabaseProvider>
      <Stack screenOptions={{ headerTitle: 'Mas Catat' }}>
        <Stack.Screen name="index" options={{ title: 'Mas Catat' }} />
        <Stack.Screen name="members/index" options={{ title: 'Anggota' }} />
        <Stack.Screen name="periods/index" options={{ title: 'Periode' }} />
        <Stack.Screen name="periods/new" options={{ title: 'Buat Periode' }} />
        <Stack.Screen name="periods/[id]/index" options={{ title: 'Detail Periode' }} />
        <Stack.Screen name="periods/[id]/payments" options={{ title: 'Pembayaran' }} />
        <Stack.Screen name="periods/[id]/members/[memberId]" options={{ title: 'Anggota di Periode' }} />
        <Stack.Screen name="periods/[id]/pay" options={{ title: 'Catat Pembayaran' }} />
      </Stack>
    </DatabaseProvider>
  );
}
