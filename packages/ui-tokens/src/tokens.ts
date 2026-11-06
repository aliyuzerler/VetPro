/**
 * VetCore tasarım tokenları — tip güvenli kopya.
 * Kaynak: design/tokens.json (tek doğruluk kaynağı).
 * Token değişikliği önce design/tokens.json üzerinde yapılmalı, sonra buraya yansıtılmalıdır.
 * Tam entegrasyon Faz 02 (tasarım sistemi) kapsamında yapılır.
 */

export const BRAND_COLORS = {
  50: '#F1FAF8',
  100: '#DDF3EF',
  500: '#37A197',
  600: '#28847C',
  700: '#216A64',
  800: '#1C514D',
  900: '#173B39',
  950: '#102C2B',
} as const;

export const ACCENT_COLORS = {
  100: '#FBE9E2',
  600: '#D97855',
} as const;

export const NEUTRAL_COLORS = {
  50: '#F7F9F8',
  100: '#F0F4F3',
  200: '#E2E8E7',
  300: '#CBD4D4',
  500: '#8C999C',
  600: '#6E7C80',
  700: '#536267',
  800: '#344246',
  950: '#1B2528',
  white: '#FFFFFF',
} as const;

export const STATUS_COLORS = {
  success: '#21845A',
  warning: '#C78A2C',
  danger: '#C44E4E',
  info: '#3979B8',
} as const;

export const FONT_FAMILY =
  "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export const TYPOGRAPHY = {
  h1: 32,
  h2: 24,
  h3: 18,
  body: 14,
  small: 12,
} as const;

export const SPACING_BASE = 4;

export const SPACING_SCALE = [4, 8, 12, 16, 20, 24, 32, 40, 48, 64] as const;

export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  pill: 999,
} as const;

export const LAYOUT = {
  sidebarWidth: 248,
  topbarHeight: 72,
  contentMaxWidth: 1600,
  pagePadding: 28,
} as const;

export const SHADOW = {
  card: '0 2px 10px rgba(17, 45, 43, 0.05)',
  popover: '0 12px 32px rgba(17, 45, 43, 0.14)',
} as const;
