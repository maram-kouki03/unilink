import React, { useState } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import { WebView } from 'react-native-webview';
import { FileIcon } from '@/components/Illustrations';
import { Card, EmptyState, ErrorNote, Header, IconButton, Loading, Screen, Txt } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { OfflineDoc, removeOffline, useOfflineDocs, useRefreshOffline } from '@/lib/offline';
import { fileSize, shortDate } from '@/lib/format';
import { colors, shadows } from '@/theme';

/** Documents saved on this phone: opens without internet. */
export default function OfflineDocuments() {
  const list = useOfflineDocs();
  const refresh = useRefreshOffline();
  const [viewing, setViewing] = useState<OfflineDoc | null>(null);

  const open = async (d: OfflineDoc) => {
    // iOS shows PDFs, images and Office files in a WebView; Android opens them with an installed app.
    if (Platform.OS === 'ios') return setViewing(d);
    try {
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(d.uri, { dialogTitle: d.title });
    } catch (e) {
      Alert.alert('Could not open', e instanceof Error ? e.message : String(e));
    }
  };

  const remove = (d: OfflineDoc) =>
    Alert.alert('Remove from this phone?', d.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removeOffline(d.id);
          refresh();
        },
      },
    ]);

  if (viewing) {
    return (
      <Screen scroll={false}>
        <View style={{ flex: 1, gap: 12 }}>
          <Header title={viewing.title} subtitle="Offline copy" right={<IconButton icon="close" label="Close" onPress={() => setViewing(null)} />} />
          <View style={[{ flex: 1, borderRadius: 22, overflow: 'hidden', marginBottom: 16 }, shadows.soft]}>
            <WebView source={{ uri: viewing.uri }} originWhitelist={['*']} allowFileAccess style={{ flex: 1 }} />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen refreshing={list.isRefetching} onRefresh={() => list.refetch()}>
      <Header title="Offline" subtitle="Saved on this phone · works without internet" />
      <ErrorNote error={list.error} />
      {list.isLoading ? (
        <Loading />
      ) : !list.data?.length ? (
        <EmptyState icon="offline" title="Nothing saved yet" body="Open a document and tap “Offline” to keep a copy on this phone." />
      ) : (
        <Card style={{ padding: 0 }}>
          {list.data.map((d, i) => (
            <View key={d.id} style={{ minHeight: 64, paddingLeft: 14, paddingRight: 4, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: i === list.data!.length - 1 ? 0 : 1, borderBottomColor: colors.divider }}>
              <FileIcon ext={d.file_ext} />
              <Pressable accessibilityRole="button" onPress={() => open(d)} style={{ flex: 1, gap: 3, paddingVertical: 10 }}>
                <Txt size={14} weight={700} numberOfLines={2}>
                  {d.title}
                </Txt>
                <Txt size={12} color={colors.muted} numberOfLines={1}>
                  {[d.subject, fileSize(d.size_bytes), `saved ${shortDate(d.saved_at)}`].filter(Boolean).join(' · ')}
                </Txt>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Remove" onPress={() => remove(d)} hitSlop={6} style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="close" size={18} color={colors.muted} />
              </Pressable>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
