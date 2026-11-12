// Section A: buttons and actions (Button, QuickAction, PillLink, Chip, SectionHeader).
// React Native vs web: a horizontal ScrollView needs no CSS overflow rule; it scrolls only along its own axis.
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { PillLink } from '../components/PillLink';
import { QuickAction } from '../components/QuickAction';
import { SectionHeader } from '../components/SectionHeader';
import { spacing } from '../theme';
import { AMOUNT_BIG, AMOUNT_EXTREME, AMOUNT_MID, T1_LABEL, T2_BUTTON, T5_ERROR, T7_VERY_LONG } from './fixtures';
import { Demo, pressedToast, Row, Section } from './parts';

const VARIANTS = ['primary', 'secondary', 'tertiary', 'danger', 'dangerOutline'] as const;
const DATE_CHIPS = ['Hari ini', 'Kemarin', 'Selasa lalu'];
const TAB_CHIPS = ['Beranda', 'Anggota', 'Riwayat', 'Menu'];

// A group of chips sharing one local "selected" state, so they can be tried.
function ChipsDemo({ labels }: { labels: string[] }) {
  const [selected, setSelected] = useState(labels[0]);
  return (
    <>
      {labels.map((label) => (
        <Chip key={label} label={label} selected={selected === label} onPress={() => setSelected(label)} />
      ))}
    </>
  );
}

export function SectionA() {
  return (
    <>
      <Section
        title="Button"
        states="5 varian, teks panjang, nonaktif (tanpa/dengan alasan), memuat, ditekan, compact, baris 2 dan 3 tombol."
      >
        <Demo caption="Kelima varian, teks pendek">
          {VARIANTS.map((v) => (
            <Button key={v} label="Simpan" variant={v} onPress={pressedToast(`Button ${v}`)} />
          ))}
        </Demo>
        <Demo caption="Teks panjang T2, primary dan danger, lebar penuh">
          <Button label={T2_BUTTON} onPress={pressedToast('Button T2 primary')} />
          <Button label={T2_BUTTON} variant="danger" onPress={pressedToast('Button T2 danger')} />
        </Demo>
        <Demo caption="Nonaktif tanpa alasan">
          <Button label="Simpan" disabled onPress={pressedToast('Button nonaktif')} />
        </Demo>
        <Demo caption="Nonaktif dengan disabledReason panjang (T5)">
          <Button label="Simpan" disabled disabledReason={T5_ERROR} onPress={pressedToast('Button nonaktif alasan')} />
        </Demo>
        <Demo caption="Memuat (spinner, ukuran tetap)">
          <Button label="Simpan" loading onPress={pressedToast('Button memuat')} />
        </Demo>
        <Demo caption="Ditekan: tahan untuk melihat warna tekan">
          <Button label="Tahan saya" onPress={pressedToast('Button ditekan')} />
        </Demo>
        <Demo caption="compact dengan T2">
          <Button label={T2_BUTTON} compact variant="tertiary" onPress={pressedToast('Button compact')} />
        </Demo>
        <Demo caption="Baris: dua tombol (Batal + Simpan)">
          <Row>
            <Button label="Batal" variant="secondary" compact style={styles.flex} onPress={pressedToast('Batal')} />
            <Button label="Simpan" compact style={styles.flex} onPress={pressedToast('Simpan')} />
          </Row>
        </Demo>
        <Demo caption="Baris: tiga tombol (Batal, Ubah tanggal, T2)">
          <Row>
            <Button label="Batal" variant="secondary" compact style={styles.flex} onPress={pressedToast('Batal')} />
            <Button label="Ubah tanggal" variant="tertiary" compact style={styles.flex} onPress={pressedToast('Ubah tanggal')} />
            <Button label={T2_BUTTON} compact style={styles.flex} onPress={pressedToast('T2 dalam baris')} />
          </Row>
        </Demo>
        <Demo caption="Baris: tombol compact bersebelahan dengan teks panjang">
          <Row>
            <Button label={T2_BUTTON} variant="tertiary" compact style={styles.flex} onPress={pressedToast('Compact kiri')} />
            <Button label={T1_LABEL} variant="tertiary" compact style={styles.flex} onPress={pressedToast('Compact kanan')} />
          </Row>
        </Demo>
      </Section>

      <Section title="QuickAction" states="4 ubin satu baris, label panjang, nonaktif dengan alasan (toast), ditekan.">
        <Demo caption="Empat ubin, label pendek">
          <Row>
            <QuickAction label="Bayar" icon="cash-outline" onPress={pressedToast('Bayar')} />
            <QuickAction label="Catat kas" icon="create-outline" onPress={pressedToast('Catat kas')} />
            <QuickAction label="Pinjaman" icon="swap-horizontal-outline" onPress={pressedToast('Pinjaman')} />
            <QuickAction label="Riwayat" icon="time-outline" onPress={pressedToast('Riwayat')} />
          </Row>
        </Demo>
        <Demo caption="Label panjang di ubin">
          <Row>
            <QuickAction label="Pembayaran tuan rumah" icon="home-outline" onPress={pressedToast('Tuan rumah')} />
            <QuickAction label="Pengeluaran bersama" icon="cart-outline" onPress={pressedToast('Pengeluaran')} />
            <QuickAction label={T1_LABEL} icon="arrow-redo-outline" onPress={pressedToast('Piutang')} />
          </Row>
        </Demo>
        <Demo caption="Satu ubin nonaktif (ketuk: toast alasan)">
          <Row>
            <QuickAction label="Bayar" icon="cash-outline" onPress={pressedToast('Bayar')} />
            <QuickAction label="Catat kas" icon="create-outline" disabledReason="Belum ada periode berjalan." onPress={pressedToast('Catat kas')} />
            <QuickAction label="Pinjaman" icon="swap-horizontal-outline" onPress={pressedToast('Pinjaman')} />
          </Row>
        </Demo>
        <Demo caption="Ditekan: tahan ubin untuk melihat latar tekan">
          <Row>
            <QuickAction label="Tahan saya" icon="hand-left-outline" onPress={pressedToast('Tahan')} />
          </Row>
        </Demo>
      </Section>

      <Section title="PillLink" states="3 isi, dua pill berdampingan (wrap), saldo disembunyikan.">
        <Demo caption="Piutang Rp1.250.000">
          <Row wrap>
            <PillLink label="Piutang" amount={AMOUNT_MID} onPress={pressedToast('Piutang')} />
          </Row>
        </Demo>
        <Demo caption="Titipan Rp12.345.000">
          <Row wrap>
            <PillLink label="Titipan" amount={AMOUNT_BIG} onPress={pressedToast('Titipan')} />
          </Row>
        </Demo>
        <Demo caption="Label panjang T1 dengan Rp123.456.789">
          <Row wrap>
            <PillLink label={T1_LABEL} amount={AMOUNT_EXTREME} onPress={pressedToast('Piutang panjang')} />
          </Row>
        </Demo>
        <Demo caption="Dua pill berdampingan (flexWrap: wrap)">
          <Row wrap>
            <PillLink label="Piutang" amount={AMOUNT_MID} onPress={pressedToast('Piutang')} />
            <PillLink label="Titipan" amount={AMOUNT_BIG} onPress={pressedToast('Titipan')} />
          </Row>
        </Demo>
        <Demo caption="hidden (topeng saldo)">
          <Row wrap>
            <PillLink label="Piutang" amount={AMOUNT_MID} hidden onPress={pressedToast('Piutang tersembunyi')} />
          </Row>
        </Demo>
      </Section>

      <Section title="Chip" states="pendek (satu terpilih), label panjang, wrap, ScrollView mendatar, mirip tab, ditekan.">
        <Demo caption="Chip pendek, satu terpilih (centang)">
          <Row wrap>
            <ChipsDemo labels={DATE_CHIPS} />
          </Row>
        </Demo>
        <Demo caption="Chip berlabel panjang">
          <Row wrap>
            <ChipsDemo labels={[T1_LABEL, T2_BUTTON]} />
          </Row>
        </Demo>
        <Demo caption="flexWrap: wrap, banyak chip">
          <Row wrap>
            <ChipsDemo labels={[...DATE_CHIPS, T1_LABEL, T2_BUTTON, 'Bulan ini']} />
          </Row>
        </Demo>
        <Demo caption="Dalam ScrollView mendatar">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
            <ChipsDemo labels={[...DATE_CHIPS, T1_LABEL, T2_BUTTON, 'Bulan ini']} />
          </ScrollView>
        </Demo>
        <Demo caption="Mirip tab: empat chip satu baris (bukan bilah bawah sungguhan)">
          <Row>
            <ChipsDemo labels={TAB_CHIPS} />
          </Row>
        </Demo>
        <Demo caption="Ditekan: tahan chip tidak terpilih">
          <Row wrap>
            <Chip label="Tahan saya" onPress={pressedToast('Chip')} />
          </Row>
        </Demo>
      </Section>

      <Section title="SectionHeader" states="pendek tanpa aksi, dengan aksi, judul panjang dengan aksi.">
        <Demo caption="Judul pendek tanpa aksi">
          <SectionHeader title="Pengingat" />
        </Demo>
        <Demo caption="Dengan actionLabel">
          <SectionHeader title="Riwayat terbaru" actionLabel="Lihat semua" onAction={pressedToast('Lihat semua')} />
        </Demo>
        <Demo caption="Judul panjang dengan aksi (flexShrink)">
          <SectionHeader title="Pulihkan atau mulai dari nol" actionLabel="Lihat semua" onAction={pressedToast('Lihat semua')} />
        </Demo>
        <Demo caption="Judul sangat panjang (T7) dengan aksi">
          <SectionHeader title={T7_VERY_LONG} actionLabel="Lihat semua" onAction={pressedToast('Lihat semua')} />
        </Demo>
      </Section>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chipScroll: { gap: spacing.sm, paddingRight: spacing.lg },
});
