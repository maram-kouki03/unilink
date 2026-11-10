import React from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Avatar, Button, Card, IconButton, Row, Screen, Txt } from '@/components/ui';
import { Icon, IconName } from '@/components/Icon';
import { useNotifications, useProfileStats } from '@/api/social';
import { useAuth } from '@/providers/AuthProvider';
import { colors } from '@/theme';
import { LEVEL_LABEL } from '@/types/db';

export default function Profile() {
  const { profile, signOut } = useAuth();
  const stats = useProfileStats();
  const notifs = useNotifications();
  const unread = notifs.data?.filter((n) => !n.read_at).length ?? 0;

  const rows: { label: string; sub?: string; icon: IconName; badge?: number; onPress: () => void }[] = [
    { label: 'My Profile', icon: 'user', onPress: () => router.push('/profile/edit') },
    { label: 'My Activities', sub: 'My posts, rides, items, uploads', icon: 'activity', onPress: () => router.push('/profile/activity') },
    { label: 'Messages', icon: 'chat', onPress: () => router.push('/chat') },
    { label: 'Saved Documents', icon: 'bookmark', onPress: () => router.push('/profile/saved') },
    { label: 'Notifications', icon: 'bell', badge: unread, onPress: () => router.push('/notifications') },
    { label: 'Settings', icon: 'gear', onPress: () => router.push('/profile/edit') },
    { label: 'Help & Support', icon: 'help', onPress: () => Linking.openURL('mailto:unilink@supcom.tn?subject=Unilink%20support') },
    { label: 'About Unilink', icon: 'shield', onPress: () => Alert.alert('Unilink', 'Connect • Share • Belong\nThe SUP’COM student companion.\nVersion 1.0.0') },
  ];

  return (
    <Screen withTabBar refreshing={stats.isRefetching} onRefresh={() => stats.refetch()}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt size={26} weight={800} accessibilityRole="header">
          Profile
        </Txt>
        <IconButton icon="edit" label="Edit profile" onPress={() => router.push('/profile/edit')} />
      </Row>

      <Card style={{ padding: 16, gap: 14 }}>
        <Row gap={14}>
          <View>
            <View style={{ borderRadius: 40, borderWidth: 4, borderColor: colors.tileAlt }}>
              <Avatar name={profile?.full_name} size={72} />
            </View>
            <View accessibilityLabel="Online" style={styles.online} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Txt size={20} weight={800} numberOfLines={1}>
              {profile?.full_name}
            </Txt>
            <Txt size={13} color={colors.muted}>
              @{profile?.username}
            </Txt>
            <Row gap={6} style={{ flexWrap: 'wrap' }}>
              <Row gap={4} style={{ backgroundColor: colors.navy, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Icon name="star" size={11} color={colors.violetLight} />
                <Txt size={11} weight={800} color={colors.white}>
                  SUP'COM Student
                </Txt>
              </Row>
              {profile?.level ? (
                <View style={{ backgroundColor: colors.violetBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Txt size={11} weight={700} color={colors.violetDeep}>
                    {LEVEL_LABEL[profile.level]}
                    {profile.period ? ` · ${profile.period}` : ''}
                  </Txt>
                </View>
              ) : null}
            </Row>
          </View>
        </Row>
        <Row gap={0} style={{ backgroundColor: colors.bg, borderRadius: 16, paddingVertical: 10 }}>
          {[
            ['Uploads', stats.data?.uploads],
            ['Rides', stats.data?.rides],
            ['Posts', stats.data?.posts],
          ].map(([label, n], i) => (
            <View key={label as string} style={[{ flex: 1, alignItems: 'center' }, i === 1 && { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#DCDDF0' }]}>
              <Txt size={18} weight={800} color={colors.navy}>
                {n ?? '–'}
              </Txt>
              <Txt size={11} weight={600} color={colors.muted}>
                {label}
              </Txt>
            </View>
          ))}
        </Row>
      </Card>

      <Card style={{ paddingVertical: 4, paddingHorizontal: 0 }}>
        {rows.map((r) => (
          <Pressable key={r.label} accessibilityRole="button" onPress={r.onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.bg }]}>
            <View style={styles.rowIcon}>
              <Icon name={r.icon} size={18} color={colors.navy} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt size={14} weight={700}>
                {r.label}
              </Txt>
              {r.sub ? (
                <Txt size={11} color={colors.muted}>
                  {r.sub}
                </Txt>
              ) : null}
            </View>
            {r.badge ? (
              <View style={styles.badge}>
                <Txt size={11} weight={800} color={colors.white}>
                  {r.badge}
                </Txt>
              </View>
            ) : null}
            <Icon name="chevronRight" size={18} color={colors.iconMuted} />
          </Pressable>
        ))}
      </Card>

      <Button
        title="Log Out"
        variant="violet"
        icon="logout"
        height={52}
        onPress={() =>
          Alert.alert('Log out?', undefined, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Log out', style: 'destructive', onPress: signOut },
          ])
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  online: { position: 'absolute', right: 4, bottom: 4, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.online, borderWidth: 3, borderColor: colors.white },
  row: { minHeight: 54, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.tile, alignItems: 'center', justifyContent: 'center' },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
});
