import { Stack } from 'expo-router';

// Root navigator. Every file under src/app/ is a screen.
export default function RootLayout() {
  return <Stack screenOptions={{ headerTitle: 'Mas Catat' }} />;
}
