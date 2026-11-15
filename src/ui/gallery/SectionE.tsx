// Section E: forms (TextField, SearchField, DateField, IconChoice, CorrectionForm, MonthSwitcher, SwipeRow).
// React Native vs web: there is no :focus CSS and no page that scrolls itself above the keyboard. The gallery screen
// sets keyboardShouldPersistTaps and bottom padding (see ComponentGallery) like the other form screens.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CorrectionForm } from '../components/CorrectionForm';
import { DateField } from '../components/DateField';
import { IconChoice } from '../components/IconChoice';
import { ListRow, RowText } from '../components/ListRow';
import { MonthSwitcher } from '../components/MonthSwitcher';
import { SearchField } from '../components/SearchField';
import { SwipeRow } from '../components/SwipeRow';
import { TextField } from '../components/TextField';
import { todayIso } from '../dates';
import { filterByQuery } from '../memberSearch';
import { shiftMonth } from '../months';
import { unskipDialogMessage, unskipFormTexts, unskipTitle } from '../skipMeeting';
import { spacing } from '../theme';
import { toast } from '../toast';
import { FIXED_DATE, MONTH_FIRST, MONTH_LONGEST, T1_LABEL, T5_ERROR, T6_LONG, T8_MEMBER } from './fixtures';
import { Demo, pressedToast, Row, Section } from './parts';

// A TextField with its own local text, so it can be typed into.
function FieldDemo(props: { label?: string; placeholder?: string; initial?: string; helper?: string; error?: string; editable?: boolean; multiline?: boolean }) {
  const [text, setText] = useState(props.initial ?? '');
  return (
    <TextField
      label={props.label}
      placeholder={props.placeholder}
      helper={props.helper}
      error={props.error}
      editable={props.editable}
      multiline={props.multiline}
      value={text}
      onChangeText={setText}
    />
  );
}

// A SearchField with its own local word; `matches` and `total` are fixed numbers for the static states.
function SearchDemo({ initial = '', matches, total }: { initial?: string; matches: number; total: number }) {
  const [text, setText] = useState(initial);
  return <SearchField value={text} onChangeText={setText} matchCount={matches} totalCount={total} />;
}

const SEARCH_NAMES = [
  'Ani', 'Budi', 'Citra', 'Dewi', 'Eka', 'Fajar', 'Gita', 'Hadi', 'Indah', 'Joko', 'Siti Aminah', T8_MEMBER,
];

// Search box plus a list filtered live with the same function the screens use.
function SearchListDemo() {
  const [text, setText] = useState('');
  const found = filterByQuery(SEARCH_NAMES, (n) => n, text);
  return (
    <View style={styles.searchList}>
      <SearchField value={text} onChangeText={setText} matchCount={found.matchCount} totalCount={SEARCH_NAMES.length} />
      {found.items.map((name) => (
        <ListRow key={name} title={name} tone="alt" />
      ))}
    </View>
  );
}

function DateDemo({ label, initial, error }: { label: string; initial: string; error?: string }) {
  const [value, setValue] = useState(initial);
  return <DateField label={label} value={value} onChange={setValue} error={error} />;
}

const ICON_CHOICES = [
  { label: 'Tunai', icon: 'cash-outline' },
  { label: 'Debit', icon: 'card-outline' },
  { label: 'Piutang', icon: 'arrow-redo-outline' },
  { label: 'Titipan', icon: 'wallet-outline' },
] as const;

// A group of IconChoice tiles in one row sharing one local selection.
function ChoiceRow({ labels, count }: { labels?: string[]; count: number }) {
  const tiles = labels
    ? labels.map((label, i) => ({ label, icon: ICON_CHOICES[i % ICON_CHOICES.length]!.icon }))
    : ICON_CHOICES.slice(0, count);
  const [selected, setSelected] = useState(tiles[0]?.label);
  return (
    <Row>
      {tiles.map((t) => (
        <IconChoice key={t.label} label={t.label} icon={t.icon} selected={selected === t.label} onPress={() => setSelected(t.label)} />
      ))}
    </Row>
  );
}

// The direction pair of the transfer form: same tiles, two different arrows.
function TransferChoice() {
  const [selected, setSelected] = useState('Tunai ke Debit');
  return (
    <Row>
      <IconChoice label="Tunai ke Debit" icon="arrow-forward-outline" selected={selected === 'Tunai ke Debit'} onPress={() => setSelected('Tunai ke Debit')} />
      <IconChoice label="Debit ke Tunai" icon="arrow-back-outline" selected={selected === 'Debit ke Tunai'} onPress={() => setSelected('Debit ke Tunai')} />
    </Row>
  );
}

// A MonthSwitcher with local month state; `latest` is the newest month (its "next" button is disabled).
function MonthDemo({ start, latest }: { start: string; latest?: string }) {
  const [month, setMonth] = useState(start);
  return (
    <MonthSwitcher
      month={month}
      onPrevious={() => setMonth((m) => shiftMonth(m, -1))}
      onNext={() => setMonth((m) => shiftMonth(m, 1))}
      nextDisabled={latest !== undefined && month >= latest}
    />
  );
}

export function SectionE() {
  return (
    <>
      <Section
        title="TextField"
        states="placeholder, berisi, fokus (ketuk), helper T5, error T5/T6 (menggantikan helper), hanya-baca, multiline, label panjang, dua kolom bertumpuk."
      >
        <Demo caption="Normal dengan placeholder">
          <FieldDemo label="Catatan" placeholder="Contoh: DP wisata ke Bali" />
        </Demo>
        <Demo caption="Berisi teks">
          <FieldDemo label="Catatan" initial="Setoran pertama" />
        </Demo>
        <Demo caption="Fokus: ketuk kolom ini">
          <FieldDemo label="Ketuk saya" placeholder="Border menebal saat fokus" />
        </Demo>
        <Demo caption="helper panjang (T5)">
          <FieldDemo label="Jumlah" helper={T5_ERROR} />
        </Demo>
        <Demo caption="error panjang (T5) menggantikan helper">
          <FieldDemo label="Jumlah" helper="Teks bantuan ini tidak boleh tampil." error={T5_ERROR} />
        </Demo>
        <Demo caption="error panjang (T6)">
          <FieldDemo label="Jumlah" error={T6_LONG} />
        </Demo>
        <Demo caption="editable={false} (hanya-baca)">
          <FieldDemo label="Anggota" initial={T8_MEMBER} editable={false} />
        </Demo>
        <Demo caption="multiline dengan isi panjang">
          <FieldDemo label="Catatan" multiline initial={`${T5_ERROR} ${T6_LONG}`} />
        </Demo>
        <Demo caption="Label panjang">
          <FieldDemo label="Piutang (dipinjam anggota) yang ingin dicatat" placeholder="Rp" />
        </Demo>
        <Demo caption="Dua TextField bertumpuk: buka keyboard, periksa kolom tidak tertutup">
          <FieldDemo label="Kolom pertama" placeholder="Ketik di sini" />
          <FieldDemo label="Kolom kedua" placeholder="Lalu di sini" />
        </Demo>
      </Section>

      <Section
        title="SearchField"
        states="kosong (placeholder), terisi dengan hasil dan tombol hapus, tanpa hasil, fokus (ketuk), daftar yang disaring langsung (12 nama, termasuk nama panjang T8), lebar 320 dp."
      >
        <Demo caption="Kosong (placeholder)">
          <SearchDemo matches={19} total={19} />
        </Demo>
        <Demo caption="Terisi, hasil banyak: tombol hapus dan teks '3 dari 19 anggota'">
          <SearchDemo initial="sit" matches={3} total={19} />
        </Demo>
        <Demo caption="Tanpa hasil">
          <SearchDemo initial="xyz" matches={0} total={19} />
        </Demo>
        <Demo caption="Fokus: ketuk kolom ini (garis menebal)">
          <SearchDemo matches={19} total={19} />
        </Demo>
        <Demo caption="Interaktif: ketik 'siti', 'ani', atau 'nur abdur'. Urutan daftar tidak berubah.">
          <SearchListDemo />
        </Demo>
        <Demo caption="Lebar 320 dp">
          <View style={styles.w320}>
            <SearchDemo initial="siti" matches={2} total={19} />
          </View>
        </Demo>
      </Section>

      <Section title="DateField" states="nilai tetap, hari ini, tanpa error, error T5, label panjang. Menekan membuka kalender Android sungguhan.">
        <Demo caption="Nilai tetap 2026-01-04">
          <DateDemo label="Tanggal pertemuan" initial={FIXED_DATE} />
        </Demo>
        <Demo caption="Hari ini">
          <DateDemo label="Tanggal pertemuan" initial={todayIso()} />
        </Demo>
        <Demo caption="Dengan error panjang (T5)">
          <DateDemo label="Tanggal pertemuan" initial={FIXED_DATE} error={T5_ERROR} />
        </Demo>
        <Demo caption="Label panjang">
          <DateDemo label="Tanggal pembayaran Piutang (dipinjam anggota) oleh Siti Nurhaliza" initial={FIXED_DATE} />
        </Demo>
      </Section>

      <Section title="IconChoice" states="3 ubin, label panjang (terpotong: sudah diduga), 2 dan 4 ubin dalam satu baris.">
        <Demo caption="Tunai, Debit, Piutang; satu terpilih">
          <ChoiceRow count={3} />
        </Demo>
        <Demo caption="Label panjang di ubin (numberOfLines 1: akan terpotong)">
          <ChoiceRow labels={['Tunai', 'Debit', T1_LABEL]} count={3} />
        </Demo>
        <Demo caption="Arah pindah saldo seperti di layar Catat kas: dua ikon berbeda arah">
          <TransferChoice />
        </Demo>
        <Demo caption="Dua ubin">
          <ChoiceRow count={2} />
        </Demo>
        <Demo caption="Empat ubin">
          <ChoiceRow count={4} />
        </Demo>
      </Section>

      <Section title="CorrectionForm" states="awal, alasan kosong (galat), title panjang, message T6, sibuk setelah konfirmasi (1 detik), batal (toast).">
        <Demo caption="Ketuk 'Koreksi' dengan alasan kosong: muncul 'Alasan koreksi wajib diisi.'. Dengan alasan: dialog sungguhan, lalu tombol nonaktif 1 detik.">
          <CorrectionForm
            title="Koreksi pembayaran Rp12.345.000 oleh Siti Nurhaliza Rahmawati"
            message={T6_LONG}
            onSubmit={() => new Promise<void>((resolve) => setTimeout(resolve, 1000))}
            onCancel={() => toast('Ditekan: CorrectionForm Batal')}
          />
        </Demo>
        <Demo caption="Teks lain lewat prop opsional (Batalkan pelewatan pertemuan 19): penjelasan, label, contoh isi, galat kosong">
          <CorrectionForm
            title={unskipTitle(19)}
            message={unskipDialogMessage(19)}
            submitLabel="Batalkan pelewatan"
            {...unskipFormTexts(19)}
            errorContext="unskip_week"
            onSubmit={() => new Promise<void>((resolve) => setTimeout(resolve, 1000))}
            onCancel={() => toast('Ditekan: CorrectionForm Batal')}
          />
        </Demo>
      </Section>

      <Section title="MonthSwitcher" states="2026-01 dengan dua panah aktif, bulan terbaru (next nonaktif), 2026-09 pada font besar, lebar penuh dan 320 dp.">
        <Demo caption="2026-01, sebelumnya dan berikutnya aktif">
          <MonthDemo start={MONTH_FIRST} />
        </Demo>
        <Demo caption="Bulan terbaru dengan nextDisabled (2026-01 sebagai yang terbaru)">
          <MonthDemo start={MONTH_FIRST} latest={MONTH_FIRST} />
        </Demo>
        <Demo caption="2026-09 (September), lebar penuh">
          <MonthDemo start={MONTH_LONGEST} />
        </Demo>
        <Demo caption="2026-09 (September), lebar 320 dp">
          <View style={styles.w320}>
            <MonthDemo start={MONTH_LONGEST} />
          </View>
        </Demo>
      </Section>

      <Section title="SwipeRow" states="enabled dengan ListRow, enabled false, label panjang. Geser kanan melewati ambang: toast. Gulir vertikal harus tetap bisa.">
        <Demo caption="enabled, label 'Bayar Rp15.000'">
          <SwipeRow enabled label="Bayar Rp15.000" onSwipe={pressedToast('SwipeRow geser')}>
            <ListRow title="Siti" tone="alt">
              <RowText>Geser ke kanan</RowText>
            </ListRow>
          </SwipeRow>
        </Demo>
        <Demo caption="enabled false (baris biasa)">
          <SwipeRow enabled={false} label="Bayar Rp15.000" onSwipe={pressedToast('SwipeRow nonaktif')}>
            <ListRow title="Siti" tone="alt">
              <RowText>Tidak bisa digeser</RowText>
            </ListRow>
          </SwipeRow>
        </Demo>
        <Demo caption="Label panjang 'Bayar Rp45.000 untuk 3 pertemuan'">
          <SwipeRow enabled label="Bayar Rp45.000 untuk 3 pertemuan" onSwipe={pressedToast('SwipeRow label panjang')}>
            <ListRow title="Siti" tone="alt">
              <RowText>Geser ke kanan</RowText>
            </ListRow>
          </SwipeRow>
        </Demo>
      </Section>
    </>
  );
}

const styles = StyleSheet.create({
  w320: { width: 320, maxWidth: '100%' },
  searchList: { gap: spacing.sm },
});
