import { Stack } from 'expo-router';
import { colors } from '@/theme';

// welcome is the base screen of the auth group: sign-in / sign-up are pushed on top of it,
// so "back" (arrow or Android button) always returns to welcome.
export const unstable_settings = { anchor: 'welcome' };

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
    </Stack>
  );
}
