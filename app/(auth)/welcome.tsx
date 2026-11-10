import React from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { CampusBuilding, Logo } from '@/components/Illustrations';
import { Button, Txt } from '@/components/ui';
import { colors, gradients } from '@/theme';

export default function Welcome() {
  const { width } = useWindowDimensions();
  return (
    <LinearGradient colors={gradients.splash} locations={[0, 0.42, 0.78, 1]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={{ flex: 1 }}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.wrap}>
        <View style={{ alignItems: 'center', gap: 14, marginTop: 24 }}>
          <View style={styles.logoBox}>
            <Logo size={56} light />
          </View>
          <Txt size={40} weight={800} color={colors.white}>
            Unilink
          </Txt>
          <Txt size={15} weight={600} color="#D6D8FF" style={{ letterSpacing: 0.8 }}>
            Connect • Share • Belong
          </Txt>
        </View>

        <CampusBuilding width={Math.min(width - 40, 360)} />

        <Txt size={15} color="#D6D8FF" style={{ textAlign: 'center', lineHeight: 23, maxWidth: 300 }}>
          Share courses, rides, items and ideas with every student at SUP'COM.
        </Txt>

        <View style={{ width: '100%', gap: 14, alignItems: 'center', marginTop: 'auto' }}>
          <Button title="Get Started" variant="white" arrow onPress={() => router.push('/sign-up')} style={{ width: '100%' }} />
          <Pressable accessibilityRole="link" onPress={() => router.push('/sign-in')} hitSlop={10} style={{ padding: 8 }}>
            <Txt size={15} weight={600} color={colors.white}>
              I already have an account
            </Txt>
          </Pressable>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingBottom: 16, gap: 24 },
  logoBox: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
