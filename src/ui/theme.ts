// Design tokens (design system v1, light theme). Every colour, type size, spacing and radius used by the UI comes from here.
// React Native has no CSS: styles are plain objects (StyleSheet.create), so shared "variables" are plain constants.
// Names are semantic (what the colour is FOR), so a dark theme later would only change values.
import type { TextStyle } from 'react-native';

export const colors = {
  // Brand teal. Two tokens on purpose, because the pure teal is too light for text or white labels:
  //  - brand: ACCENT only (active tab indicator, selected chip fill with DARK text, dots, decoration).
  //    Never white text on it (2.82:1) and never as text colour on a light background (2.58:1).
  //  - brandStrong: filled primary buttons (white label), coloured text and links, tab label, focus border.
  brand: '#31AAA9',
  brandStrong: '#1F7271',
  brandPressed: '#1B6564',
  brandTint: '#E6F5F5',
  brandTintPressed: '#D2ECEC',
  onBrand: '#FFFFFF',

  error: '#B3261E',
  errorPressed: '#8C1D18',
  errorTint: '#FDECEA',

  // Money in is green and stays separate from the teal brand. The +/- sign and the words are the real signal.
  moneyIn: '#1B7A43',
  moneyInTint: '#E6F4EA',
  moneyOut: '#B3261E',

  warn: '#8A4B00',
  warnTint: '#FFF4E0',

  neutralTint: '#EEF0F5',

  bgPage: '#F7F5EF',
  bgCard: '#FFFFFF',
  bgMute: '#EEF0F5',
  bgDisabled: '#E4E7EE',

  text: '#1B1F2A',
  textSecondary: '#4A5162',
  textTertiary: '#636A7B',

  borderStrong: '#7B8294',
  divider: '#E1E4EB',
  scrim: 'rgba(27,31,42,0.4)',
} as const;

// Inter 4.1 (SIL OFL), loaded in src/app/_layout.tsx. Every Text and TextInput gets an explicit family, because on
// Android Fabric a Text without one is measured with the default typeface but drawn with the phone's system font
// (RN issue #57950), which clips or wraps text wrongly. Android ignores fontWeight for custom fonts, so bold is
// its own file and its own family name: never set fontWeight, pick fonts.bold instead.
export const fonts = { regular: 'Inter-Regular', bold: 'Inter-Bold' } as const;

export const type = {
  // Largest size, for the one number a screen is about (Total kas on Beranda). Added after design system v1 (owner-approved).
  hero: { fontSize: 36, lineHeight: 44, fontFamily: fonts.bold },
  display: { fontSize: 28, lineHeight: 36, fontFamily: fonts.bold },
  titleL: { fontSize: 22, lineHeight: 28, fontFamily: fonts.bold },
  amountL: { fontSize: 20, lineHeight: 28, fontFamily: fonts.bold },
  titleM: { fontSize: 18, lineHeight: 24, fontFamily: fonts.bold },
  body: { fontSize: 16, lineHeight: 22, fontFamily: fonts.regular },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontFamily: fonts.bold },
  label: { fontSize: 14, lineHeight: 20, fontFamily: fonts.bold },
  secondary: { fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
} as const satisfies Record<string, TextStyle>;

/** Digits of equal width, so amounts line up in columns. */
export const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

// Two shadow levels. Android draws `elevation` only on a view with an opaque background colour; the shadow* props are for iOS.
export const elevation = {
  low: { elevation: 2, shadowColor: '#000000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 4 },
  high: { elevation: 8, shadowColor: '#000000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10 },
} as const;

export const ICON = { sm: 20, md: 24, lg: 48 } as const;

/** Minimum touch target height (dp) for anything tappable. */
export const MIN_TOUCH = 48;
