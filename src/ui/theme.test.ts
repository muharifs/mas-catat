import { colors, type } from './theme';

// WCAG 2.x contrast, computed from the hex values so the accessibility claims of the design system stay honest.

function channel(hex: string, start: number): number {
  const v = parseInt(hex.slice(start, start + 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function hue(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

type Key = keyof typeof colors;
/** [foreground, background, minimum ratio]. 4.5 = normal text, 3 = borders and large UI parts. */
const TEXT = 4.5;
const UI = 3;
const PAIRS: readonly (readonly [Key, Key, number])[] = [
  ['text', 'bgCard', TEXT],
  ['text', 'bgPage', TEXT],
  ['text', 'bgMute', TEXT],
  ['text', 'brandTint', TEXT], // info notice
  ['text', 'brand', TEXT], // selected chip, active tab icon: DARK text on the teal accent
  ['textSecondary', 'bgCard', TEXT],
  ['textSecondary', 'bgPage', TEXT],
  ['textSecondary', 'bgMute', TEXT],
  ['textTertiary', 'bgCard', TEXT],
  ['textTertiary', 'bgPage', TEXT],
  ['brandStrong', 'bgCard', TEXT],
  ['brandStrong', 'bgPage', TEXT],
  ['brandStrong', 'brandTint', TEXT],
  ['brandStrong', 'brandTintPressed', TEXT],
  ['onBrand', 'brandStrong', TEXT],
  ['onBrand', 'brandPressed', TEXT],
  ['onBrand', 'error', TEXT],
  ['onBrand', 'errorPressed', TEXT],
  ['onBrand', 'moneyIn', TEXT], // swipe-to-pay label
  ['error', 'bgCard', TEXT],
  ['error', 'bgPage', TEXT],
  ['error', 'errorTint', TEXT],
  ['moneyIn', 'bgCard', TEXT],
  ['moneyIn', 'bgPage', TEXT],
  ['moneyIn', 'moneyInTint', TEXT],
  ['moneyOut', 'bgCard', TEXT],
  ['warn', 'warnTint', TEXT],
  ['warn', 'bgCard', TEXT],
  // Disabled button label: exempt from WCAG, but kept readable.
  ['textTertiary', 'bgDisabled', UI],
  // Borders and outlines of interactive parts.
  ['borderStrong', 'bgCard', UI],
  ['borderStrong', 'bgPage', UI],
  ['brandStrong', 'bgCard', UI], // secondary button outline, focus border, selected row border
  ['error', 'bgCard', UI],
];

describe('theme contrast', () => {
  test.each(PAIRS)('%s on %s is at least %s:1', (fg, bg, min) => {
    expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(min);
  });

  // Documents why the teal accent must never carry text or white labels.
  test('pure brand teal is an accent only: it fails as text and under white', () => {
    expect(contrast(colors.brand, colors.bgCard)).toBeLessThan(TEXT);
    expect(contrast(colors.onBrand, colors.brand)).toBeLessThan(TEXT);
  });

  test('brand teal and money-in green are different hues', () => {
    expect(Math.abs(hue(colors.brand) - hue(colors.moneyIn))).toBeGreaterThanOrEqual(30);
    expect(Math.abs(hue(colors.brandStrong) - hue(colors.moneyIn))).toBeGreaterThanOrEqual(30);
  });

  // The amount keypad: digits and backspace icon on a button, the typed amount on the card.
  test('keypad buttons and amount display colours stay readable', () => {
    expect(contrast(colors.text, colors.bgCard)).toBeGreaterThanOrEqual(TEXT); // key label
    expect(contrast(colors.text, colors.bgMute)).toBeGreaterThanOrEqual(TEXT); // key label while pressed
    expect(contrast(colors.textTertiary, colors.bgCard)).toBeGreaterThanOrEqual(TEXT); // empty amount "Rp 0"
    expect(contrast(colors.borderStrong, colors.bgCard)).toBeGreaterThanOrEqual(UI); // date field border
  });

  test('type scale: hero is the largest step, display is the next one down', () => {
    expect(type.hero.fontSize).toBe(36);
    expect(type.hero.lineHeight).toBe(44);
    expect(type.hero.fontSize).toBeGreaterThan(type.display.fontSize);
    for (const [name, style] of Object.entries(type)) {
      if (name !== 'hero') expect(style.fontSize).toBeLessThan(type.hero.fontSize);
      expect(style.lineHeight).toBeGreaterThan(style.fontSize);
    }
  });

  test('transition aliases point to the new values', () => {
    expect(colors.primary).toBe(colors.brandStrong);
    expect(colors.danger).toBe(colors.error);
    expect(colors.surface).toBe(colors.bgCard);
    expect(colors.textMuted).toBe(colors.textSecondary);
  });
});
