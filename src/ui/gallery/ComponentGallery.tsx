// Developer-only gallery of every component in src/ui/components, with static mock data (docs/specs/component-gallery.md).
// Opened from the version line at the bottom of Menu (long press, __DEV__ only). Nothing here reads or writes data.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Chip } from '../components/Chip';
import { SectionHeader } from '../components/SectionHeader';
import { colors, spacing, type } from '../theme';
import { SectionA } from './SectionA';
import { SectionB } from './SectionB';
import { SectionC } from './SectionC';
import { SectionD } from './SectionD';
import { SectionE } from './SectionE';
import { SectionF } from './SectionF';

const WIDTHS: { label: string; value: number | null }[] = [
  { label: '320 dp', value: 320 },
  { label: '360 dp', value: 360 },
  { label: 'Penuh', value: null },
];

const GROUPS: { title: string; Body: () => React.JSX.Element }[] = [
  { title: 'A. Tombol dan aksi', Body: SectionA },
  { title: 'B. Baris dan daftar', Body: SectionB },
  { title: 'C. Angka uang', Body: SectionC },
  { title: 'D. Kartu dan pesan', Body: SectionD },
  { title: 'E. Formulir', Body: SectionE },
  { title: 'F. Keadaan layar penuh', Body: SectionF },
];

// React Native vs web: a ScrollView is the page scroller (there is no body scrolling). `contentContainerStyle` styles
// the inner content box, like a wrapper div. The font size is the phone's system setting (fontScale); the app never
// changes it, so change it in the phone settings and reopen this screen.
export function ComponentGallery() {
  const [maxWidth, setMaxWidth] = useState<number | null>(null);
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.note}>
          Galeri komponen (khusus pengembang). Data tiruan, tidak ada yang disimpan. Ukuran font diubah lewat pengaturan HP.
        </Text>
        <View style={styles.widthRow}>
          {WIDTHS.map((w) => (
            <Chip key={w.label} label={w.label} selected={maxWidth === w.value} onPress={() => setMaxWidth(w.value)} />
          ))}
        </View>
        <View style={[styles.content, maxWidth !== null && { maxWidth }]}>
          {GROUPS.map(({ title, Body }) => (
            <View key={title} style={styles.group}>
              <SectionHeader title={title} />
              <Body />
            </View>
          ))}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl * 3 },
  note: { ...type.secondary, color: colors.textSecondary },
  widthRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  // `width: '100%'` with a maxWidth: full width until the cap, then centred.
  content: { width: '100%', alignSelf: 'center', gap: spacing.xxl },
  group: { gap: spacing.xl },
});
