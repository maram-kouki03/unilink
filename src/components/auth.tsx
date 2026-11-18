import React, { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, TextInputKeyPressEvent, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { Field, IconButton, Row, Txt } from '@/components/ui';
import { PASSWORD_RULES, passwordStrength } from '@/lib/password';
import { colors, fonts, radius } from '@/theme';

/** Password field with an eye button to show / hide it. */
export function PasswordField({
  label,
  value,
  onChangeText,
  placeholder,
  autoComplete = 'new-password',
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  autoComplete?: 'new-password' | 'password';
}) {
  const [show, setShow] = useState(false);
  return (
    <Field
      label={label}
      icon="lock"
      placeholder={placeholder}
      secureTextEntry={!show}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete={autoComplete}
      textContentType={autoComplete === 'new-password' ? 'newPassword' : 'password'}
      value={value}
      onChangeText={onChangeText}
      right={<IconButton icon="eye" label={show ? 'Hide password' : 'Show password'} bg="transparent" color={colors.muted} onPress={() => setShow(!show)} />}
    />
  );
}

/** 4-segment strength bar + label + live checklist of the password rules. */
export function PasswordStrength({ password }: { password: string }) {
  const s = passwordStrength(password);
  return (
    <View style={{ gap: 10, marginTop: -6 }}>
      <Row gap={10}>
        <Row gap={6} style={{ flex: 1 }}>
          {[1, 2, 3, 4].map((i) => (
            <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i <= s.segments ? s.color : colors.border }} />
          ))}
        </Row>
        <Txt size={12} weight={700} color={s.color} style={{ minWidth: 48, textAlign: 'right' }} accessibilityLiveRegion="polite">
          {s.label}
        </Txt>
      </Row>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 }}>
        {PASSWORD_RULES.map((r) => {
          const ok = r.test(password);
          return (
            <Row key={r.key} gap={6} style={{ width: '46%' }}>
              <View
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: ok ? colors.online : colors.chip,
                }}
              >
                {ok ? <Icon name="check" size={10} color={colors.white} /> : null}
              </View>
              <Txt size={12} weight={600} color={ok ? colors.success : colors.muted} accessibilityLabel={`${r.label}: ${ok ? 'done' : 'missing'}`}>
                {r.label}
              </Txt>
            </Row>
          );
        })}
      </View>
    </View>
  );
}

/** "Passwords don't match" under the confirm field (only once something was typed). */
export function MatchNote({ password, confirm }: { password: string; confirm: string }) {
  if (!confirm) return null;
  const ok = password === confirm;
  return (
    <Txt size={12} weight={700} color={ok ? colors.success : colors.dangerText} style={{ marginTop: -6 }} accessibilityLiveRegion="polite">
      {ok ? 'Passwords match' : "Passwords don't match"}
    </Txt>
  );
}

const CODE_LENGTH = 6;

/** 6 digit boxes: auto-advance, backspace goes back, pasting a full code fills every box. */
export function CodeInput({ value, onChange, autoFocus = true }: { value: string; onChange: (code: string) => void; autoFocus?: boolean }) {
  const refs = useRef<(React.ComponentRef<typeof TextInput> | null)[]>([]);
  const [focused, setFocused] = useState<number | null>(null);
  const digits = Array.from({ length: CODE_LENGTH }, (_, i) => value[i] ?? '');

  const setAt = (index: number, text: string) => {
    const typed = text.replace(/\D/g, '');
    const old = digits[index];
    // A single new digit typed into a box that already had one: keep only the new digit.
    const incoming = old && typed.length === 2 && typed.startsWith(old) ? typed.slice(1) : typed;
    const next = [...digits];
    if (!incoming) {
      next[index] = '';
      onChange(next.join('').slice(0, CODE_LENGTH));
      return;
    }
    // One digit or a pasted code: fill from this box onwards.
    let i = index;
    for (const d of incoming) {
      if (i >= CODE_LENGTH) break;
      next[i++] = d;
    }
    onChange(next.join(''));
    refs.current[Math.min(i, CODE_LENGTH - 1)]?.focus();
    if (i >= CODE_LENGTH) refs.current[CODE_LENGTH - 1]?.blur();
  };

  const onKeyPress = (index: number) => (e: TextInputKeyPressEvent) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      const next = [...digits];
      next[index - 1] = '';
      onChange(next.join(''));
      refs.current[index - 1]?.focus();
    }
  };

  return (
    <Row gap={8} style={{ justifyContent: 'center' }}>
      {digits.map((d, i) => (
        <Pressable key={i} onPress={() => refs.current[i]?.focus()} style={{ flex: 1, maxWidth: 54 }}>
          <TextInput
            ref={(r) => {
              refs.current[i] = r;
            }}
            value={d}
            onChangeText={(t) => setAt(i, t)}
            onKeyPress={onKeyPress(i)}
            onFocus={() => {
              // The code is filled left to right: jump to the first empty box.
              if (i > value.length) refs.current[Math.min(value.length, CODE_LENGTH - 1)]?.focus();
              else setFocused(i);
            }}
            onBlur={() => setFocused((f) => (f === i ? null : f))}
            keyboardType="number-pad"
            inputMode="numeric"
            textContentType={i === 0 ? 'oneTimeCode' : 'none'}
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            autoFocus={autoFocus && i === 0}
            selectTextOnFocus
            accessibilityLabel={`Digit ${i + 1} of ${CODE_LENGTH}`}
            style={{
              height: 60,
              borderRadius: radius.md,
              borderWidth: 1.5,
              borderColor: focused === i ? colors.royal : d ? colors.violet : colors.border,
              backgroundColor: colors.card,
              textAlign: 'center',
              fontSize: 24,
              fontFamily: fonts[800],
              color: colors.navy,
            }}
          />
        </Pressable>
      ))}
    </Row>
  );
}

/** Seconds left before "Resend code" is allowed again. */
export function useCountdown(initial: number) {
  const [left, setLeft] = useState(initial);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, setLeft] as const;
}
