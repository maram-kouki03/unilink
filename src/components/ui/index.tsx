import React, { ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Icon, IconName } from '@/components/Icon';
import { colors, fonts, FontWeight, gradients, radius, shadows } from '@/theme';
import { initials } from '@/lib/format';

/* ───────────────────────── Text ───────────────────────── */

type TxtProps = TextProps & { size?: number; weight?: FontWeight; color?: string; style?: StyleProp<TextStyle> };

export function Txt({ size = 14, weight = 500, color = colors.text, style, ...rest }: TxtProps) {
  return <Text {...rest} style={[{ fontSize: size, fontFamily: fonts[weight], color }, style]} />;
}

/* ───────────────────────── Layout ───────────────────────── */

export const TAB_BAR_SPACE = 110;

export function Screen({
  children,
  scroll = true,
  padded = true,
  withTabBar = false,
  footer,
  refreshing,
  onRefresh,
  bg = colors.bg,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  withTabBar?: boolean;
  footer?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  bg?: string;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const pad: ViewStyle = padded ? { paddingHorizontal: 20, paddingTop: 8 } : {};
  const bottom = withTabBar ? TAB_BAR_SPACE : footer ? 16 : insets.bottom + 24;
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: bg }}>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[pad, { paddingBottom: bottom, gap: 16 }, contentStyle]}
          refreshControl={
            onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.royal} /> : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad, contentStyle]}>{children}</View>
      )}
      {footer ? (
        <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 12, backgroundColor: bg }}>{footer}</View>
      ) : null}
    </SafeAreaView>
  );
}

export function Row({ children, gap = 12, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const base: StyleProp<ViewStyle> = [{ backgroundColor: colors.card, borderRadius: radius.lg, padding: 14 }, shadows.card, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.85 }]}>
      {children}
    </Pressable>
  );
}

/* ───────────────────────── Header ───────────────────────── */

export function IconButton({
  icon,
  label,
  onPress,
  color = colors.navy,
  bg = colors.card,
  size = 44,
  badge,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  color?: string;
  bg?: string;
  size?: number;
  badge?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: 14, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' },
        bg === colors.card && shadows.soft,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Icon name={icon} size={20} color={color} />
      {badge ? (
        <View style={styles.badgeDot}>
          <Txt size={10} weight={800} color={colors.white}>
            {badge > 9 ? '9+' : badge}
          </Txt>
        </View>
      ) : null}
    </Pressable>
  );
}

export function Header({
  title,
  subtitle,
  back = true,
  right,
  large = false,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
  large?: boolean;
}) {
  return (
    <Row style={{ minHeight: 44 }}>
      {back ? <IconButton icon="chevronLeft" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} /> : null}
      <View style={{ flex: 1 }}>
        <Txt size={large ? 26 : 19} weight={800} numberOfLines={1} accessibilityRole="header">
          {title}
        </Txt>
        {subtitle ? (
          <Txt size={12} color={colors.muted} numberOfLines={1}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right}
    </Row>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
      <Txt size={16} weight={800} accessibilityRole="header">
        {title}
      </Txt>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
          <Row gap={4}>
            <Txt size={13} weight={700} color={colors.royal}>
              {action}
            </Txt>
            <Icon name="arrowRight" size={14} color={colors.royal} />
          </Row>
        </Pressable>
      ) : null}
    </Row>
  );
}

/* ───────────────────────── Buttons ───────────────────────── */

type BtnVariant = 'primary' | 'gradient' | 'outline' | 'white' | 'violet' | 'ghost';

export function Button({
  title,
  onPress,
  variant = 'primary',
  arrow = false,
  icon,
  loading = false,
  disabled = false,
  height = 56,
  style,
  small = false,
}: {
  title: string;
  onPress?: () => void;
  variant?: BtnVariant;
  arrow?: boolean;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  height?: number;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const h = small ? 40 : height;
  const fg = variant === 'outline' || variant === 'white' || variant === 'ghost' ? colors.navy : colors.white;
  const content = (
    <Row gap={8} style={{ justifyContent: 'center' }}>
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <Txt size={small ? 13 : 15} weight={700} color={fg}>
        {title}
      </Txt>
      {arrow && !loading ? <Icon name="arrowRight" size={17} color={fg} /> : null}
    </Row>
  );
  const shell: ViewStyle = {
    height: h,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: small ? 16 : 20,
    overflow: 'hidden',
  };
  const bg: Record<BtnVariant, ViewStyle> = {
    primary: { backgroundColor: colors.navy, ...shadows.strong },
    gradient: { ...shadows.strong },
    violet: { ...shadows.strong },
    outline: { borderWidth: 1.5, borderColor: colors.navy, backgroundColor: colors.card },
    white: { backgroundColor: colors.white, ...shadows.strong },
    ghost: { backgroundColor: colors.tile },
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [shell, bg[variant], (pressed || disabled) && { opacity: disabled ? 0.5 : 0.85 }, style]}
    >
      {variant === 'gradient' || variant === 'violet' ? (
        <LinearGradient
          colors={variant === 'gradient' ? gradients.cta : gradients.violet}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {content}
    </Pressable>
  );
}

/* ───────────────────────── Inputs ───────────────────────── */

export function Field({
  label,
  icon,
  right,
  multiline,
  style,
  suffix,
  ...rest
}: TextInputProps & { label?: string; icon?: IconName; right?: ReactNode; suffix?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{ gap: 8 }, style as ViewStyle]}>
      {label ? (
        <Txt size={13} weight={700}>
          {label}
        </Txt>
      ) : null}
      <View
        style={[
          {
            minHeight: multiline ? 92 : 54,
            borderRadius: radius.md,
            backgroundColor: colors.card,
            borderWidth: 1.5,
            borderColor: focused ? colors.royal : colors.border,
            flexDirection: 'row',
            alignItems: multiline ? 'flex-start' : 'center',
            paddingHorizontal: 14,
            gap: 10,
          },
          focused && { shadowColor: colors.royal, shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
        ]}
      >
        {icon ? <Icon name={icon} size={20} color={colors.navy} /> : null}
        <TextInput
          {...rest}
          accessibilityLabel={label ?? rest.placeholder}
          placeholderTextColor={colors.placeholder}
          multiline={multiline}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={{
            flex: 1,
            fontFamily: fonts[600],
            fontSize: 15,
            color: colors.text,
            paddingVertical: multiline ? 12 : 0,
            minHeight: multiline ? 80 : 50,
            textAlignVertical: multiline ? 'top' : 'center',
          }}
        />
        {suffix ? (
          <Txt size={13} weight={700} color={colors.muted}>
            {suffix}
          </Txt>
        ) : null}
        {right}
      </View>
    </View>
  );
}

export function SearchBar({ value, onChangeText, placeholder }: { value: string; onChangeText: (t: string) => void; placeholder: string }) {
  return (
    <View style={[styles.search, shadows.soft]}>
      <Icon name="search" size={20} color={colors.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        accessibilityLabel={placeholder}
        returnKeyType="search"
        style={{ flex: 1, fontFamily: fonts[500], fontSize: 14, color: colors.text, height: 50 }}
      />
      {value ? <IconButton icon="close" label="Clear search" size={32} bg="transparent" color={colors.muted} onPress={() => onChangeText('')} /> : null}
    </View>
  );
}

/* ───────────────────────── Pills & tabs ───────────────────────── */

export function Chip({
  label,
  active,
  onPress,
  activeColor = colors.navy,
  variant = 'filled',
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  activeColor?: string;
  variant?: 'filled' | 'outline' | 'white';
}) {
  const inactiveBg = variant === 'white' ? colors.card : variant === 'outline' ? colors.card : colors.chip;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: active ? activeColor : inactiveBg },
        variant === 'outline' && !active && { borderWidth: 1.5, borderColor: '#DCDDF0' },
      ]}
    >
      <Txt size={13} weight={active ? 700 : 600} color={active ? colors.white : colors.text}>
        {label}
      </Txt>
    </Pressable>
  );
}

export function ChipRow<T extends string>({
  options,
  value,
  onChange,
  activeColor,
  variant,
  wrap = false,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  activeColor?: string;
  variant?: 'filled' | 'outline' | 'white';
  wrap?: boolean;
}) {
  const chips = options.map((o) => (
    <Chip key={o.value} label={o.label} active={o.value === value} onPress={() => onChange(o.value)} activeColor={activeColor} variant={variant} />
  ));
  if (wrap) return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{chips}</View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
      {chips}
    </ScrollView>
  );
}

export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.segment}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.segmentItem, active && { backgroundColor: colors.navy, ...shadows.soft }]}
          >
            <Txt size={14} weight={active ? 700 : 600} color={active ? colors.white : colors.text}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Badge({ label, tone = 'violet' }: { label: string; tone?: 'violet' | 'navy' | 'success' | 'danger' | 'neutral' | 'white' }) {
  const map = {
    violet: [colors.violetBg, colors.violetDeep],
    navy: [colors.tile, colors.navy],
    success: [colors.successBg, colors.success],
    danger: [colors.dangerBg, colors.dangerText],
    neutral: ['#E8E9F2', '#55597A'],
    white: ['rgba(255,255,255,0.18)', colors.white],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' }}>
      <Txt size={11} weight={800} color={fg}>
        {label}
      </Txt>
    </View>
  );
}

/* ───────────────────────── Misc ───────────────────────── */

export function Avatar({ name, size = 42, dark = false }: { name?: string | null; size?: number; dark?: boolean }) {
  return (
    <LinearGradient
      colors={dark ? [colors.navy, colors.royal] : [colors.royal, colors.violet]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}
    >
      <Txt size={Math.round(size * 0.33)} weight={800} color={colors.white}>
        {initials(name)}
      </Txt>
    </LinearGradient>
  );
}

export function IconTile({ icon, size = 48, bg = colors.tile, color = colors.navy }: { icon: IconName; size?: number; bg?: string; color?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={size * 0.48} color={color} />
    </View>
  );
}

export function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, gap: 2 }}>
      <Txt size={11} weight={600} color={colors.muted}>
        {label}
      </Txt>
      <Txt size={13} weight={800} numberOfLines={1}>
        {value}
      </Txt>
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={{ paddingVertical: 40, alignItems: 'center', gap: 10 }}>
      <ActivityIndicator color={colors.royal} />
      {label ? (
        <Txt size={13} color={colors.muted}>
          {label}
        </Txt>
      ) : null}
    </View>
  );
}

export function EmptyState({ icon = 'folder', title, body, action, onAction }: { icon?: IconName; title: string; body?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.empty}>
      <IconTile icon={icon} size={52} />
      <Txt size={15} weight={800} style={{ textAlign: 'center' }}>
        {title}
      </Txt>
      {body ? (
        <Txt size={13} color={colors.muted} style={{ textAlign: 'center', lineHeight: 19 }}>
          {body}
        </Txt>
      ) : null}
      {action ? <Button title={action} small onPress={onAction} style={{ marginTop: 4 }} /> : null}
    </View>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <View style={{ backgroundColor: colors.dangerBg, borderRadius: 14, padding: 12 }}>
      <Txt size={13} weight={600} color={colors.dangerText}>
        {error instanceof Error ? error.message : String(error)}
      </Txt>
    </View>
  );
}

export function Stepper({ value, onChange, min = 1, max = 9 }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <Row gap={6} style={{ backgroundColor: colors.bg, borderRadius: radius.pill, padding: 4 }}>
      <Pressable accessibilityLabel="Decrease" onPress={() => onChange(Math.max(min, value - 1))} style={[styles.stepBtn, { backgroundColor: colors.card }]}>
        <Txt size={18} weight={800} color={colors.navy}>
          −
        </Txt>
      </Pressable>
      <Txt size={16} weight={800} style={{ minWidth: 24, textAlign: 'center' }}>
        {value}
      </Txt>
      <Pressable accessibilityLabel="Increase" onPress={() => onChange(Math.min(max, value + 1))} style={[styles.stepBtn, { backgroundColor: colors.navy }]}>
        <Txt size={18} weight={800} color={colors.white}>
          +
        </Txt>
      </Pressable>
    </Row>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.divider }} />;
}

export function PressableRow(props: PressableProps & { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { style, children, ...rest } = props;
  return (
    <Pressable accessibilityRole="button" {...rest} style={({ pressed }) => [style, pressed && { opacity: 0.7 }]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badgeDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 17,
    height: 17,
    borderRadius: 999,
    backgroundColor: colors.violet,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  search: {
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 16,
    paddingRight: 8,
  },
  chip: { height: 38, paddingHorizontal: 16, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  segment: { height: 50, backgroundColor: colors.chip, borderRadius: radius.pill, padding: 4, flexDirection: 'row', gap: 4 },
  segmentItem: { flex: 1, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  empty: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 28,
    paddingHorizontal: 20,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.dashed,
  },
  stepBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
