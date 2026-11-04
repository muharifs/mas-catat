import { StyleSheet, Text, View } from 'react-native';

// Placeholder home screen. Real screens arrive in later milestones.
export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mas Catat</Text>
      <Text>Catatan iuran dan kas kelompok</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
});
