import { colors } from '@/theme';

/** Same rule as the server: 8+ characters, uppercase, lowercase, number, special character. */
export const PASSWORD_RULES = [
  { key: 'length', label: '8+ characters', test: (p: string) => p.length >= 8 },
  { key: 'upper', label: 'Uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { key: 'lower', label: 'Lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { key: 'digit', label: 'Number', test: (p: string) => /\d/.test(p) },
  { key: 'special', label: 'Special character', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
] as const;

export const passwordOk = (p: string) => PASSWORD_RULES.every((r) => r.test(p));

export type Strength = { segments: 0 | 1 | 2 | 3 | 4; label: string; color: string };

const LEVELS: Strength[] = [
  { segments: 1, label: 'Weak', color: colors.danger },
  { segments: 2, label: 'Fair', color: '#F08A24' },
  { segments: 3, label: 'Good', color: colors.royal },
  { segments: 4, label: 'Strong', color: colors.online },
];

/** Rules passed: 0–2 → Weak, 3 → Fair, 4 → Good, all 5 → Strong. */
export function passwordStrength(p: string): Strength {
  if (!p) return { segments: 0, label: '', color: colors.border };
  const passed = PASSWORD_RULES.filter((r) => r.test(p)).length;
  return LEVELS[Math.max(0, passed - 2)];
}
