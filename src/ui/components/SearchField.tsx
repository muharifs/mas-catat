import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, ICON, MIN_TOUCH, radius, spacing, type } from '../theme';

interface SearchFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  /** Members that really match (rows kept only because they are selected do not count). */
  matchCount: number;
  /** Members before filtering. */
  totalCount: number;
}

// Member search box (docs/specs/member-search-spec.md). Not a TextField: it needs an icon and a clear button.
// Focus has no CSS :focus here, so the 2dp focus border is tracked by hand like in TextField.
// The status line sits in a live region so TalkBack reads the new result count politely.
export function SearchField({ value, onChangeText, matchCount, totalCount }: SearchFieldProps) {
  const [focused, setFocused] = useState(false);
  const active = value.trim() !== '';
  return (
    <View>
      <View style={[styles.box, focused && styles.boxFocused]}>
        {/* Decoration only: hidden from TalkBack (accessibilityElementsHidden is iOS, importantForAccessibility is Android). */}
        <View accessibilityElementsHidden importantForAccessibility="no">
          <Ionicons name="search-outline" size={ICON.sm} color={colors.textTertiary} />
        </View>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Cari anggota"
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel="Cari anggota"
          returnKeyType="search"
          submitBehavior="blurAndSubmit"
          autoCorrect={false}
          spellCheck={false}
          autoCapitalize="none"
          autoComplete="off"
          importantForAutofill="no"
          maxLength={40}
        />
        {active ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Hapus pencarian"
            style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
            onPress={() => onChangeText('')}
          >
            <Ionicons name="close-circle" size={ICON.md} color={colors.textTertiary} />
          </Pressable>
        ) : null}
      </View>
      <View accessibilityLiveRegion="polite">
        {active ? (
          <Text style={styles.status}>{matchCount > 0 ? `${matchCount} dari ${totalCount} anggota` : 'Tidak ada anggota yang cocok.'}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    backgroundColor: colors.bgCard,
    paddingHorizontal: spacing.md,
  },
  // 2dp border: the extra width is taken from the padding so the content does not move when focus changes.
  boxFocused: { borderWidth: 2, borderColor: colors.brandStrong, paddingHorizontal: spacing.md - 1 },
  input: { flex: 1, ...type.body, color: colors.text, paddingVertical: 0 },
  // 48 x 48 touch target; the negative margin keeps the icon visually inside the right padding.
  clear: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', marginRight: -spacing.md },
  pressed: { opacity: 0.75 },
  status: { ...type.secondary, color: colors.textSecondary, marginTop: spacing.xs },
});
