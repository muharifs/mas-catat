// Design tokens. Every colour, type size, spacing and radius used by the UI comes from here.
// React Native has no CSS: styles are plain objects (StyleSheet.create), so shared "variables" are plain constants.
import type { TextStyle } from 'react-native';

export const colors = {
  primary: '#1f6f50',
  primarySoft: '#e8efe9',
  surface: '#f2f6f3',
  surfaceAlt: '#f7f7f7',
  text: '#1a1a1a',
  textMuted: '#5f5f5f',
  danger: '#b3261e',
  dangerSoft: '#fdecea',
  warn: '#8a4b00',
  warnSoft: '#fff4e0',
  border: '#bbbbbb',
  placeholder: '#6b6b6b',
  onPrimary: '#ffffff',
  background: '#ffffff',
} as const;

export const type = {
  display: { fontSize: 28, fontWeight: '700' },
  title: { fontSize: 22, fontWeight: '700' },
  heading: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 16, fontWeight: '400' },
  label: { fontSize: 14, fontWeight: '700' },
  caption: { fontSize: 13, fontWeight: '400' },
} as const satisfies Record<string, TextStyle>;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

export const radius = { row: 8, card: 12 } as const;

/** Minimum touch target height (dp) for anything tappable. */
export const MIN_TOUCH = 48;
