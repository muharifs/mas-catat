// Section D: cards and messages (Card, Notice, Badge + Dot).
import { StyleSheet, Text, View } from 'react-native';
import { Badge, Dot, type BadgeTone } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Notice } from '../components/Notice';
import { ReportLine } from '../components/ReportLine';
import { colors, spacing, type } from '../theme';
import { AMOUNT_BIG, AMOUNT_MID, T3_TITLE, T4_TITLE, T5_ERROR, T6_LONG, T7_VERY_LONG } from './fixtures';
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
    </>
  );
}

const styles = StyleSheet.create({
  cardTitle: { ...type.bodyStrong, color: colors.text },
  cardText: { ...type.secondary, color: colors.textSecondary },
  stack: { gap: spacing.sm },
  dotRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
});
