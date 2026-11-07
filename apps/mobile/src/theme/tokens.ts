/**
 * VetCore mobil tema tokenları — tip güvenli kopya (React Native).
 * Kaynak: design/tokens.json (tek doğruluk kaynağı) + packages/ui-tokens (web kopyası).
 * Token değişikliği önce design/tokens.json üzerinde yapılmalı, sonra buraya yansıtılmalıdır.
 */

export const COLORS = {
  brand50: '#F1FAF8',
  brand100: '#DDF3EF',
  brand500: '#37A197',
  brand600: '#267F77',   /* a11y: beyaz metin üstünde 4.81:1 */
  brand700: '#216A64',
  brand800: '#1C514D',
  brand900: '#173B39',
  brand950: '#102C2B',
  accent600: '#D97855',
  accent100: '#FBE9E2',
  neutral50: '#F7F9F8',
  neutral100: '#F0F4F3',
  neutral200: '#E2E8E7',
  neutral600: '#647175',
  neutral950: '#1B2528',
  white: '#FFFFFF',
} as const;

export const STATUS = {
  success: '#1F7C55',
  successBg: '#E6F4EE',
  warning: '#926520',
  warningBg: '#FAF1E0',
  danger: '#B24747',
  dangerBg: '#F9E8E8',
  info: '#346FA9',
  infoBg: '#E7F0F8',
  neutral: '#647175',
  neutralBg: '#F0F4F3',
} as const;

/** design/tokens.json > spacing.scale — 4 tabanlı ölçek */
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

/** design/tokens.json > radius */
export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

export const TYPO = {
  h1: 28,
  h2: 20,
  body: 14,
  small: 12,
  tiny: 11,
} as const;

/** Mobil dokunma hedefi alt sınırı — rules/accessibility.md (≥44×44 pt) */
export const TOUCH_TARGET_MIN = 44;
