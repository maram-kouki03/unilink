import { Platform, ViewStyle } from 'react-native';

/** Design tokens taken from the Unilink design board. */
export const colors = {
  navy: '#141A4F',
  royal: '#3D3FD9',
  violet: '#7C5CF2',
  violetDeep: '#5B3FD9',
  violetLight: '#B7A6FF',
  bg: '#F1F2FB',
  card: '#FFFFFF',
  text: '#12153D',
  muted: '#6B6F8E',
  iconMuted: '#8F92AE',
  placeholder: '#8A8DA8',
  tile: '#E8E9FA',
  tileAlt: '#ECEDFB',
  chip: '#E4E5F5',
  border: '#E3E4F4',
  divider: '#EEEFF8',
  dashed: '#C3C5EE',
  violetBg: '#EEE9FE',
  danger: '#E5484D',
  dangerText: '#B4232A',
  dangerBg: '#FDE7E8',
  success: '#1C7A4A',
  successBg: '#DDF4E7',
  online: '#22B573',
  star: '#F5A524',
  white: '#FFFFFF',
} as const;

export const gradients = {
  hero: [colors.navy, colors.royal, colors.violet] as const,
  cta: [colors.royal, colors.violet] as const,
  violet: [colors.violet, colors.violetDeep] as const,
  splash: [colors.navy, '#1E2479', colors.royal, colors.violet] as const,
};

export const radius = { sm: 12, md: 16, lg: 20, xl: 24, xxl: 28, pill: 999 } as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;

export const fonts = {
  400: 'PlusJakartaSans_400Regular',
  500: 'PlusJakartaSans_500Medium',
  600: 'PlusJakartaSans_600SemiBold',
  700: 'PlusJakartaSans_700Bold',
  800: 'PlusJakartaSans_800ExtraBold',
} as const;

export type FontWeight = keyof typeof fonts;

const shadow = (opacity: number, radiusPx: number, y: number, elevation: number): ViewStyle =>
  Platform.select({
    ios: {
      shadowColor: colors.navy,
      shadowOpacity: opacity,
      shadowRadius: radiusPx / 2,
      shadowOffset: { width: 0, height: y },
    },
    default: { elevation },
  }) as ViewStyle;

export const shadows = {
  card: shadow(0.07, 24, 8, 3),
  soft: shadow(0.05, 18, 6, 2),
  strong: shadow(0.28, 28, 14, 8),
  nav: shadow(0.08, 30, -8, 12),
};

/** Folder colours used for levels / subjects. */
export const folderPalette = ['#3D3FD9', '#7C5CF2', '#141A4F', '#4B7BEC', '#A24CE0', '#5D62C9'];

export const fileKinds: Record<string, { label: string; fg: string; bg: string }> = {
  pdf: { label: 'PDF', fg: '#E5484D', bg: '#F7A3A5' },
  ppt: { label: 'PPT', fg: '#F5A524', bg: '#FAD38A' },
  pptx: { label: 'PPT', fg: '#F5A524', bg: '#FAD38A' },
  doc: { label: 'DOC', fg: '#4B7BEC', bg: '#A9C1F7' },
  docx: { label: 'DOC', fg: '#4B7BEC', bg: '#A9C1F7' },
  xls: { label: 'XLS', fg: '#1C9A5A', bg: '#9ED3B4' },
  xlsx: { label: 'XLS', fg: '#1C9A5A', bg: '#9ED3B4' },
  img: { label: 'IMG', fg: '#7C5CF2', bg: '#C9BDFA' },
  other: { label: 'FILE', fg: '#6B6F8E', bg: '#C7C9DE' },
};
