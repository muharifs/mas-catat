// Section B: rows and lists (ListRow + RowText, OptionRow, ReminderRow, HistoryRow, InitialsRow, ReportLine).
// React Native vs web: ReminderRow reads the REAL window width and font scale (useWindowDimensions), not the width
// of its parent. The 320 / 360 dp control of the gallery narrows a wrapper View only, so it does not flip the
// stacked layout of ReminderRow; the phone's font size setting (fontScale) does.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Badge } from '../components/Badge';
import { Card } from '../components/Card';
import { HistoryRow } from '../components/HistoryRow';
import { InitialsRow } from '../components/InitialsRow';
import { ListRow, RowText } from '../components/ListRow';
import { Money } from '../components/Money';
import { OptionRow } from '../components/OptionRow';
import { ReminderRow } from '../components/ReminderRow';
import { ReportLine } from '../components/ReportLine';
import type { ReminderKind } from '../reminders';
import { colors, spacing } from '../theme';
import {
  AMOUNT_BIG,
  AMOUNT_EXTREME,
  AMOUNT_MID,
  HISTORY_BY_ID,
  HISTORY_CORRECTED,
  HISTORY_EXTREME,
  HISTORY_FLAT,
  HISTORY_LONG_NAME,
  HISTORY_LONG_NOTE,
  HISTORY_NO_POS,
  HISTORY_TYPES,
  PAID_EIGHT_EXTRA,
  PAID_EMPTY,
  PAID_MANY,
  PAID_THREE,
  T1_LABEL,
  T2_BUTTON,
  T5_ERROR,
  T6_LONG,
  T8_MEMBER,
} from './fixtures';
import { Demo, pressedToast, Section } from './parts';

const REMINDERS: { kind: ReminderKind; title: string; detail: string; urgent: boolean }[] = [
  { kind: 'pay_host', title: 'Bayar tuan rumah', detail: 'Pertemuan 2 sudah ditutup.', urgent: true },
  { kind: 'choose_host', title: 'Pilih tuan rumah', detail: 'Pertemuan 3 belum punya tuan rumah.', urgent: false },
  { kind: 'close_week', title: 'Tutup pertemuan', detail: 'Semua iuran pertemuan 2 sudah masuk.', urgent: true },
  { kind: 'close_period', title: 'Akhiri periode', detail: 'Semua pertemuan sudah selesai.', urgent: false },
  { kind: 'backup', title: 'Buat cadangan', detail: 'Cadangan terakhir 9 hari lalu.', urgent: true },
];

// Local selection state for one OptionRow, so it can be tried.
function OptionDemo(props: { label: string; hint?: string; trailing?: string; mode?: 'checkbox' | 'radio'; startSelected?: boolean }) {
  const [selected, setSelected] = useState(props.startSelected ?? false);
  return (
    <OptionRow label={props.label} hint={props.hint} trailing={props.trailing} mode={props.mode} selected={selected} onPress={() => setSelected((v) => !v)} />
  );
}

export function SectionB() {
  return (
    <>
      <Section
        title="ListRow + RowText"
        states="biasa, dengan Money di kanan, judul T8, RowText bertingkat, tone default/alt/danger, strikeTitle, destructive, dapat/tidak dapat ditekan, Badge di atas Money."
      >
        <Demo caption="Judul pendek + RowText muted">
          <ListRow title="Siti">
            <RowText>Belum ada pembayaran</RowText>
          </ListRow>
        </Demo>
        <Demo caption="Dengan right berisi Money">
          <ListRow title="Siti" right={<Money amount={AMOUNT_MID} size="heading" />}>
            <RowText>Sisa iuran</RowText>
          </ListRow>
        </Demo>
        <Demo caption="Judul T8 dengan right Rp12.345.000 (jumlah tidak boleh terdorong keluar)">
          <ListRow title={T8_MEMBER} right={<Money amount={AMOUNT_BIG} size="heading" />}>
            <RowText>Sisa iuran</RowText>
          </ListRow>
        </Demo>
        <Demo caption="Judul T2, empat RowText (muted, danger, ok, warn) dengan T5 atau T6">
          <ListRow title={T2_BUTTON}>
            <RowText>{T5_ERROR}</RowText>
            <RowText tone="danger">{T6_LONG}</RowText>
            <RowText tone="ok">{T5_ERROR}</RowText>
            <RowText tone="warn">{T6_LONG}</RowText>
          </ListRow>
        </Demo>
        <Demo caption="tone default, alt, danger">
          <ListRow title="Tone default" />
          <ListRow title="Tone alt" tone="alt" />
          <ListRow title="Tone danger" tone="danger" />
        </Demo>
        <Demo caption="strikeTitle dan destructive">
          <ListRow title="Judul dicoret" strikeTitle />
          <ListRow title="Tutup pertemuan 2" destructive />
        </Demo>
        <Demo caption="Dapat ditekan (tahan untuk warna tekan) dan tidak dapat ditekan">
          <ListRow title="Dapat ditekan" tone="alt" onPress={pressedToast('ListRow')}>
            <RowText>Ketuk untuk toast</RowText>
          </ListRow>
          <ListRow title="Tidak dapat ditekan" tone="alt">
            <RowText>Baris biasa</RowText>
          </ListRow>
        </Demo>
        <Demo caption="right berisi Badge di atas Money">
          <ListRow
            title="Siti"
            right={
              <>
                <Badge label="Lunas" tone="ok" />
                <Money amount={AMOUNT_MID} size="heading" />
              </>
            }
          >
            <RowText>Pertemuan 3</RowText>
          </ListRow>
        </Demo>
      </Section>

      <Section title="OptionRow" states="checkbox dan radio, terpilih dan tidak, label T8 + hint + trailing, label T1 dengan ketiganya, ditekan.">
        <Demo caption="Checkbox: tidak terpilih dan terpilih">
          <OptionDemo label="Siti" />
          <OptionDemo label="Siti" startSelected />
        </Demo>
        <Demo caption="Radio: tidak terpilih dan terpilih">
          <OptionDemo label="Siti" mode="radio" />
          <OptionDemo label="Siti" mode="radio" startSelected />
        </Demo>
        <Demo caption="Label T8, hint, trailing Rp12.345.000">
          <OptionDemo label={T8_MEMBER} hint="(tuan rumah pertemuan 2)" trailing="Sisa Rp12.345.000" />
        </Demo>
        <Demo caption="Label T8, hint, trailing Rp1.250.000 (terpilih)">
          <OptionDemo label={T8_MEMBER} hint="(tuan rumah pertemuan 2)" trailing="Sisa Rp1.250.000" startSelected />
        </Demo>
        <Demo caption="Label T1 dengan hint dan trailing sekaligus (radio)">
          <OptionDemo mode="radio" label={T1_LABEL} hint="(tuan rumah pertemuan 2)" trailing="Sisa Rp12.345.000" />
        </Demo>
      </Section>

      <Section
        title="ReminderRow"
        states="5 kind dengan urgent bergantian, satu dengan judul/detail/tombol T2. Menumpuk bila lebar jendela di bawah 360 dp atau skala font di atas 1,15."
      >
        {REMINDERS.map((r) => (
          <Demo key={r.kind} caption={`${r.kind}${r.urgent ? ' (urgent)' : ''}`}>
            <ReminderRow kind={r.kind} title={r.title} detail={r.detail} actionLabel="Buka" urgent={r.urgent} onAction={pressedToast(`ReminderRow ${r.kind}`)} />
          </Demo>
        ))}
        <Demo caption="Judul, detail, dan tombol panjang (T2)">
          <ReminderRow
            kind="pay_host"
            title={T2_BUTTON}
            detail={T6_LONG}
            actionLabel={T2_BUTTON}
            urgent
            onAction={pressedToast('ReminderRow panjang')}
          />
        </Demo>
      </Section>

      <Section
        title="HistoryRow"
        states="8 jenis, catatan T6, nama T8, dikoreksi, peringatan tanpa pos, 3 jumlah, flat di dalam Card. Ketuk baris: toast, tanpa navigasi."
      >
        <Demo caption="Delapan jenis: pembayaran, bayaran tuan rumah, potongan, pindah saldo, pinjaman, penghapusan tunggakan, pengembalian titipan, koreksi">
          {HISTORY_TYPES.map((e) => (
            <HistoryRow key={e.id} entry={e} byId={HISTORY_BY_ID} memberName={e.memberId ? 'Siti' : ''} onPress={pressedToast(`HistoryRow ${e.type}`)} />
          ))}
        </Demo>
        <Demo caption="Catatan panjang T6">
          <HistoryRow entry={HISTORY_LONG_NOTE} byId={HISTORY_BY_ID} memberName="Siti" onPress={pressedToast('HistoryRow catatan')} />
        </Demo>
        <Demo caption="Nama anggota T8, Rp12.345.000">
          <HistoryRow entry={HISTORY_LONG_NAME} byId={HISTORY_BY_ID} memberName={T8_MEMBER} onPress={pressedToast('HistoryRow nama')} />
        </Demo>
        <Demo caption="Sudah dikoreksi (judul dicoret, Dikoreksi, latar merah muda)">
          <HistoryRow entry={HISTORY_CORRECTED} byId={HISTORY_BY_ID} memberName="Siti" onPress={pressedToast('HistoryRow dikoreksi')} />
        </Demo>
        <Demo caption="Peringatan belum ada Tunai atau Debit">
          <HistoryRow entry={HISTORY_NO_POS} byId={HISTORY_BY_ID} memberName="Siti" onPress={pressedToast('HistoryRow tanpa pos')} />
        </Demo>
        <Demo caption="Jumlah ekstrem Rp123.456.789 dengan nama T8">
          <HistoryRow entry={HISTORY_EXTREME} byId={HISTORY_BY_ID} memberName={T8_MEMBER} onPress={pressedToast('HistoryRow ekstrem')} />
        </Demo>
        <Demo caption="flat di dalam Card, dua baris berurutan">
          <Card>
            {HISTORY_FLAT.map((e, i) => (
              <View key={e.id} style={i > 0 ? styles.divider : undefined}>
                <HistoryRow flat entry={e} byId={HISTORY_BY_ID} memberName="Siti" onPress={pressedToast('HistoryRow flat')} />
              </View>
            ))}
          </Card>
        </Demo>
      </Section>

      <Section title="InitialsRow" states="kosong, 3 inisial, 8 inisial + 4 (+4), banyak (bisa digulir mendatar). Skala font besar: periksa lingkaran 40 dp.">
        <Demo caption="Kosong">
          <InitialsRow view={PAID_EMPTY} onPress={pressedToast('InitialsRow kosong')} />
        </Demo>
        <Demo caption="Tiga inisial">
          <InitialsRow view={PAID_THREE} onPress={pressedToast('InitialsRow tiga')} />
        </Demo>
        <Demo caption="Delapan inisial dan +4">
          <InitialsRow view={PAID_EIGHT_EXTRA} onPress={pressedToast('InitialsRow delapan')} />
        </Demo>
        <Demo caption="Enam belas inisial (gulir mendatar)">
          <InitialsRow view={PAID_MANY} onPress={pressedToast('InitialsRow banyak')} />
        </Demo>
      </Section>

      <Section title="ReportLine" states="pendek + strong, label T1 + hint T5, jumlah kosong dengan/tanpa emptyText, 3 tone, tiga baris dalam Card.">
        <Demo caption="Label pendek, strong">
          <ReportLine label="Total kas" amount={AMOUNT_BIG} strong />
        </Demo>
        <Demo caption="Label T1, hint T5, Rp123.456.789">
          <ReportLine label={T1_LABEL} hint={T5_ERROR} amount={AMOUNT_EXTREME} />
        </Demo>
        <Demo caption="amount null dengan emptyText 'Belum dibayar'">
          <ReportLine label="Iuran pertemuan 3" amount={null} emptyText="Belum dibayar" />
        </Demo>
        <Demo caption="amount null tanpa emptyText (tampil -)">
          <ReportLine label="Iuran pertemuan 3" amount={null} />
        </Demo>
        <Demo caption="Tone positive, negative, neutral">
          <ReportLine label="Positif" amount={AMOUNT_MID} tone="positive" />
          <ReportLine label="Negatif" amount={AMOUNT_MID} tone="negative" />
          <ReportLine label="Netral" amount={AMOUNT_MID} tone="neutral" />
        </Demo>
        <Demo caption="Tiga baris berurutan di dalam Card, seperti kartu Laporan">
          <Card>
            <View style={styles.cardLines}>
              <ReportLine label="Iuran masuk" amount={AMOUNT_BIG} tone="positive" />
              <ReportLine label="Bayaran tuan rumah" amount={AMOUNT_MID} tone="negative" />
              <ReportLine label="Total kas" amount={AMOUNT_BIG} strong />
            </View>
          </Card>
        </Demo>
      </Section>
    </>
  );
}

const styles = StyleSheet.create({
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  cardLines: { gap: spacing.sm },
});
