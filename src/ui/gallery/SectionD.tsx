// Section D: cards and messages (Card, Notice, Badge + Dot).
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Badge, Dot, type BadgeTone } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { DIALOG_MAX_WIDTH } from '../components/DialogHost';
import { ListRow } from '../components/ListRow';
import { Notice } from '../components/Notice';
import { ReportLine } from '../components/ReportLine';
import { Section as ScreenSection } from '../components/Section';
import { TextField } from '../components/TextField';
import { TOAST_BOTTOM_OFFSET } from '../components/ToastHost';
import { showDialog, showMessage } from '../dialog';
import { colors, spacing, type } from '../theme';
import { toast } from '../toast';
import { AMOUNT_BIG, AMOUNT_MID, T1_LABEL, T3_TITLE, T4_TITLE, T5_ERROR, T6_LONG, T7_VERY_LONG, T8_MEMBER } from './fixtures';
import { Demo, pressedToast, Row, Section } from './parts';

const CARD_TONES = ['default', 'alt', 'info', 'warn', 'danger'] as const;
const NOTICE_TONES = ['info', 'warn', 'danger'] as const;
const BADGES: { label: string; tone: BadgeTone }[] = [
  { label: 'Berlaku', tone: 'neutral' },
  { label: 'Dikoreksi', tone: 'error' },
  { label: 'Lunas', tone: 'ok' },
  { label: 'Belum lunas', tone: 'warn' },
  { label: 'Baru sebagian', tone: 'brand' },
];

export function SectionD() {
  return (
    <>
      <Section title="Section" states="dua bagian berurutan dalam kontainer gap lg: satu dengan actionLabel, satu dengan contentGap md dan tiga baris. Judul ke isi 8 dp, antar bagian 24 dp.">
        <View style={styles.sectionDemo}>
          <ScreenSection title="Terakhir" actionLabel="Lihat semua riwayat" onAction={pressedToast('Section aksi')}>
            <Card>
              <Text style={styles.cardText}>Isi kartu di bawah judul.</Text>
            </Card>
          </ScreenSection>
          <ScreenSection title="Jadwal" contentGap={spacing.md}>
            <ListRow title="Pertemuan 1" tone="alt" />
            <ListRow title="Pertemuan 2" tone="alt" />
            <ListRow title="Pertemuan 3" tone="alt" />
          </ScreenSection>
        </View>
      </Section>

      <Section title="Card" states="5 tone dengan judul + T5, kartu berisi ReportLine dan Button.">
        {CARD_TONES.map((tone) => (
          <Demo key={tone} caption={`tone ${tone}`}>
            <Card tone={tone}>
              <Text style={styles.cardTitle}>Judul kartu {tone}</Text>
              <Text style={styles.cardText}>{T5_ERROR}</Text>
            </Card>
          </Demo>
        ))}
        <Demo caption="Komposisi nyata: ReportLine dan Button">
          <Card>
            <ReportLine label="Iuran masuk" amount={AMOUNT_BIG} tone="positive" />
            <ReportLine label="Total kas" amount={AMOUNT_MID} strong />
            <Button label="Lihat laporan" variant="secondary" onPress={pressedToast('Card tombol')} />
          </Card>
        </Demo>
      </Section>

      <Section
        title="Notice"
        states="info/warn/danger tanpa dan dengan judul, T3 + T7, T4 + T6, isi sangat panjang (T7 + T5), tiga Notice bertumpuk."
      >
        {NOTICE_TONES.map((tone) => (
          <Demo key={tone} caption={`${tone}: tanpa judul`}>
            <Notice tone={tone}>Data belum disimpan.</Notice>
          </Demo>
        ))}
        {NOTICE_TONES.map((tone) => (
          <Demo key={`t-${tone}`} caption={`${tone}: dengan judul`}>
            <Notice tone={tone} title="Perhatian">
              Data belum disimpan.
            </Notice>
          </Demo>
        ))}
        <Demo caption="warn: judul T3, isi T7">
          <Notice tone="warn" title={T3_TITLE}>
            {T7_VERY_LONG}
          </Notice>
        </Demo>
        <Demo caption="danger: judul T4, isi T6">
          <Notice tone="danger" title={T4_TITLE}>
            {T6_LONG}
          </Notice>
        </Demo>
        <Demo caption="Isi sangat panjang (T7 + T5): ikon tetap sejajar baris pertama">
          <Notice tone="warn" title={T3_TITLE}>
            {`${T7_VERY_LONG} ${T5_ERROR}`}
          </Notice>
        </Demo>
        <Demo caption="Tiga Notice bertumpuk">
          <View style={styles.stack}>
            <Notice tone="info">Cadangan terakhir 2 hari lalu.</Notice>
            <Notice tone="warn" title={T3_TITLE}>
              {T7_VERY_LONG}
            </Notice>
            <Notice tone="danger" title={T4_TITLE}>
              {T6_LONG}
            </Notice>
          </View>
        </Demo>
      </Section>

      <Section title="Badge dan Dot" states="5 tone, label panjang, Dot error dan brand, banyak Badge satu baris (wrap).">
        <Demo caption="Lima tone">
          <Row wrap>
            {BADGES.map((b) => (
              <Badge key={b.label} label={b.label} tone={b.tone} />
            ))}
          </Row>
        </Demo>
        <Demo caption="Label panjang">
          <Row wrap>
            <Badge label="Lunas lewat potongan" tone="ok" />
            <Badge label="Lunas lewat titipan" tone="ok" />
          </Row>
        </Demo>
        <Demo caption="Dot error dan brand di samping teks">
          <View style={styles.dotRow}>
            <Dot tone="error" />
            <Text style={styles.cardText}>Cadangan terlambat</Text>
            <Dot tone="brand" />
            <Text style={styles.cardText}>Baru</Text>
          </View>
        </Demo>
        <Demo caption="Banyak Badge dalam satu baris (flexWrap)">
          <Row wrap>
            {[...BADGES, ...BADGES].map((b, i) => (
              <Badge key={`${b.label}-${i}`} label={b.label} tone={b.tone} />
            ))}
          </Row>
        </Demo>
      </Section>

      <Section
        title="DialogHost"
        states={`Dialog dalam aplikasi (font Inter, lebar maks ${DIALOG_MAX_WIDTH} dp). 10 keadaan: konfirmasi biasa, merah, info, judul panjang, pesan sangat panjang, tiga tombol, tidak bisa ditutup, dua dialog beruntun, antrean, dengan keyboard.`}
      >
        <Demo caption="1. Konfirmasi biasa: Batal dan Simpan">
          <Button
            label="Buka konfirmasi"
            variant="secondary"
            onPress={() =>
              showDialog({
                title: 'Simpan pembayaran?',
                message: 'Pembayaran Rp15.000 akan dicatat.',
                buttons: [
                  { label: 'Batal', role: 'cancel' },
                  { label: 'Simpan', onPress: pressedToast('Simpan') },
                ],
              })
            }
          />
        </Demo>
        <Demo caption="2. Konfirmasi merah (destructive), dua paragraf">
          <Button
            label="Buka konfirmasi merah"
            variant="secondary"
            onPress={() =>
              showDialog({
                title: 'Yakin ingin mengakhiri periode?',
                message: `${T6_LONG}\n\nIni tidak bisa dibatalkan.`,
                buttons: [
                  { label: 'Batal', role: 'cancel' },
                  { label: 'Ya, akhiri periode', role: 'destructive', onPress: pressedToast('Ya, akhiri periode') },
                ],
              })
            }
          />
        </Demo>
        <Demo caption="3. Info satu tombol (Tutup); ketuk di luar juga menutup">
          <Button label="Buka info" variant="secondary" onPress={() => showMessage('Pembayaran gagal', T5_ERROR)} />
        </Demo>
        <Demo caption="4. Judul panjang (T1) dan label tombol panjang">
          <Button
            label="Buka judul panjang"
            variant="secondary"
            onPress={() =>
              showDialog({
                title: `${T1_LABEL} ${T8_MEMBER}`,
                message: 'Pesan pendek.',
                buttons: [
                  { label: 'Batal', role: 'cancel' },
                  { label: 'Ya, ganti semua data sekarang juga', role: 'destructive' },
                ],
              })
            }
          />
        </Demo>
        <Demo caption="5. Pesan sangat panjang: pesan menggulir, tombol tetap terlihat">
          <Button
            label="Buka pesan panjang"
            variant="secondary"
            onPress={() =>
              showDialog({
                title: 'Pesan panjang',
                message: Array.from({ length: 6 }, () => `${T5_ERROR}\n\n${T6_LONG}`).join('\n\n'),
                buttons: [{ label: 'Batal', role: 'cancel' }, { label: 'Simpan' }],
              })
            }
          />
        </Demo>
        <Demo caption="6. Tiga tombol: dua aksi dan Batal">
          <Button
            label="Buka tiga tombol"
            variant="secondary"
            onPress={() =>
              showDialog({
                title: 'Pilih tindakan',
                message: 'Dua aksi, Batal di paling bawah.',
                buttons: [{ label: 'Bagikan' }, { label: 'Simpan di HP' }, { label: 'Batal', role: 'cancel' }],
              })
            }
          />
        </Demo>
        <Demo caption="7. cancelable false: Back dan ketuk di luar tidak menutup; tombol menutup">
          <Button
            label="Buka tidak bisa ditutup"
            variant="secondary"
            onPress={() =>
              showDialog({
                title: 'Harus dipilih',
                message: 'Coba tombol Back dan ketuk di luar kartu.',
                cancelable: false,
                buttons: [{ label: 'Mengerti' }],
              })
            }
          />
        </Demo>
        <Demo caption="8. Dua dialog beruntun (seperti Akhiri periode)">
          <Button
            label="Buka dua langkah"
            variant="secondary"
            onPress={() =>
              showDialog({
                title: 'Akhiri periode',
                message: 'Langkah 1.',
                buttons: [
                  { label: 'Batal', role: 'cancel' },
                  {
                    label: 'Lanjut',
                    onPress: () =>
                      showDialog({
                        title: 'Yakin?',
                        message: 'Langkah 2.',
                        buttons: [
                          { label: 'Batal', role: 'cancel' },
                          { label: 'Ya, akhiri periode', role: 'destructive' },
                        ],
                      }),
                  },
                ],
              })
            }
          />
        </Demo>
        <Demo caption="9. Antrean: dua dialog sekaligus, yang kedua tampil setelah yang pertama">
          <Button
            label="Buka dua sekaligus"
            variant="secondary"
            onPress={() => {
              showMessage('Dialog pertama', 'Tutup untuk melihat yang kedua.');
              showMessage('Dialog kedua', 'Tampil setelah yang pertama.');
            }}
          />
        </Demo>
        <KeyboardDemo />
      </Section>

      <Section title="ToastHost" states={`Snackbar dalam aplikasi, 3 detik, ${TOAST_BOTTOM_OFFSET} dp di atas tepi bawah. Pesan baru menggantikan yang lama.`}>
        <Demo caption="11. Toast pendek">
          <Button label="Tampilkan toast" variant="secondary" onPress={() => toast('Pembayaran tersimpan')} />
        </Demo>
        <Demo caption="12. Toast panjang (dua baris), dan tiga ketukan cepat (yang terakhir menggantikan)">
          <Row wrap>
            <Button label="Toast panjang" variant="secondary" compact onPress={() => toast(`${T6_LONG} Pastikan cadangan benar-benar terkirim.`)} />
            <Button
              label="Tiga ketukan"
              variant="secondary"
              compact
              onPress={() => {
                toast('Toast pertama');
                toast('Toast kedua');
                toast('Toast ketiga');
              }}
            />
          </Row>
        </Demo>
      </Section>
    </>
  );
}

// 10. A real TextField above the button: open the keyboard, then open the dialog (the host closes the keyboard).
function KeyboardDemo() {
  const [text, setText] = useState('');
  return (
    <Demo caption="10. Dengan keyboard: ketik di kolom, lalu buka dialog; keyboard tertutup">
      <TextField label="Catatan" value={text} onChangeText={setText} placeholder="Ketik sesuatu" />
      <Button
        label="Buka dialog"
        variant="secondary"
        onPress={() => showDialog({ title: 'Simpan catatan?', message: text || 'Catatan kosong.', buttons: [{ label: 'Batal', role: 'cancel' }, { label: 'Simpan' }] })}
      />
    </Demo>
  );
}

const styles = StyleSheet.create({
  sectionDemo: { gap: spacing.lg },
  cardTitle: { ...type.bodyStrong, color: colors.text },
  cardText: { ...type.secondary, color: colors.textSecondary },
  stack: { gap: spacing.sm },
  dotRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
});
