// Section F: full-screen states (EmptyState, Loading, ErrorState).
// Loading and ErrorState use `flex: 1`; on a screen that fills the phone, but inside a ScrollView `flex: 1` has no
// height to share. So each one sits in a View with a fixed height here.
import { StyleSheet, View } from 'react-native';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Loading } from '../components/Loading';
import { colors, radius } from '../theme';
import { T2_BUTTON, T5_ERROR, T6_LONG, T7_VERY_LONG } from './fixtures';
import { Demo, pressedToast, Section } from './parts';

export function SectionF() {
  return (
    <>
      <Section title="EmptyState" states="judul saja, judul + pesan, + tombol, judul panjang + T7 + tombol T2 (di dalam Card).">
        <Demo caption="Judul pendek tanpa pesan">
          <Card>
            <EmptyState title="Belum ada anggota" />
          </Card>
        </Demo>
        <Demo caption="Judul + pesan">
          <Card>
            <EmptyState title="Belum ada anggota" message="Tambahkan anggota dulu sebelum membuat periode." />
          </Card>
        </Demo>
        <Demo caption="Judul + pesan + tombol">
          <Card>
            <EmptyState
              title="Belum ada anggota"
              message="Tambahkan anggota dulu sebelum membuat periode."
              actionLabel="Tambah anggota"
              onAction={pressedToast('EmptyState tombol')}
            />
          </Card>
        </Demo>
        <Demo caption="Judul panjang + pesan T7 + tombol T2 (tombol melebar penuh)">
          <Card>
            <EmptyState
              title="Belum ada pembayaran tuan rumah untuk pertemuan ini"
              message={T7_VERY_LONG}
              actionLabel={T2_BUTTON}
              onAction={pressedToast('EmptyState panjang')}
            />
          </Card>
        </Demo>
      </Section>

      <Section title="Loading" states="label bawaan, label panjang. Dibungkus tinggi tetap 200 dp.">
        <Demo caption="Label bawaan 'Memuat...'">
          <View style={styles.box200}>
            <Loading />
          </View>
        </Demo>
        <Demo caption="Label panjang">
          <View style={styles.box200}>
            <Loading label="Memuat data cadangan, mohon tunggu sebentar..." />
          </View>
        </Demo>
      </Section>

      <Section title="ErrorState" states="pendek tanpa Coba lagi, dengan Coba lagi (toast), T5 + T6 dengan Coba lagi. Dibungkus tinggi tetap 320 dp.">
        <Demo caption="Pesan pendek, tanpa onRetry">
          <View style={styles.box320}>
            <ErrorState message="Catatan tidak ditemukan." />
          </View>
        </Demo>
        <Demo caption="Dengan onRetry (toast)">
          <View style={styles.box320}>
            <ErrorState message="Catatan tidak ditemukan." onRetry={pressedToast('ErrorState Coba lagi')} />
          </View>
        </Demo>
        <Demo caption="Pesan panjang T5 + T6 dengan onRetry">
          <View style={styles.box320}>
            <ErrorState message={`${T5_ERROR} ${T6_LONG}`} onRetry={pressedToast('ErrorState panjang')} />
          </View>
        </Demo>
      </Section>
    </>
  );
}

const styles = StyleSheet.create({
  box200: { height: 200, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.md },
  box320: { height: 320, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.md },
});
