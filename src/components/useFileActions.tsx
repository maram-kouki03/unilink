import React, { useState } from 'react';
import { Alert, Linking, Share } from 'react-native';
import { router } from 'expo-router';
import { ActionSheet } from '@/components/cards';
import { countDownload, recordOpen, reportDocument } from '@/api/documents';
import { downloadAndShare, saveOffline, signedDocUrl } from '@/lib/storage';
import { DocumentRow } from '@/types/db';

/** Shared behaviour for file rows: open, download and the ⋮ menu (Drive, offline, share, report). */
export function useFileActions() {
  const [target, setTarget] = useState<DocumentRow | null>(null);

  const open = (d: DocumentRow) => {
    recordOpen(d.id).catch(() => undefined);
    router.push(`/documents/file/${d.id}`);
  };

  const download = async (d: DocumentRow) => {
    try {
      await downloadAndShare(d.file_path, d.file_name);
      countDownload(d.id).catch(() => undefined);
    } catch (e) {
      Alert.alert('Download failed', e instanceof Error ? e.message : String(e));
    }
  };

  const actions = target
    ? [
        {
          label: 'Open in Google Drive',
          icon: 'drive' as const,
          onPress: async () => {
            if (target.drive_url) Linking.openURL(target.drive_url);
            else Alert.alert('Not on Drive yet', 'This file is stored in Unilink only. The uploader can add a Drive link.');
          },
        },
        {
          label: 'Save offline',
          icon: 'offline' as const,
          onPress: async () => {
            try {
              await saveOffline(target.file_path, target.file_name);
              Alert.alert('Saved', 'Available offline on this phone.');
            } catch (e) {
              Alert.alert('Could not save', e instanceof Error ? e.message : String(e));
            }
          },
        },
        {
          label: 'Share',
          icon: 'share' as const,
          onPress: async () => {
            const url = target.drive_url ?? (await signedDocUrl(target.file_path, 60 * 60 * 24 * 7));
            Share.share({ message: `${target.title} – ${url}` });
          },
        },
        {
          label: 'Report',
          icon: 'flag' as const,
          danger: true,
          onPress: () =>
            Alert.alert('Report this document?', 'Wrong subject, broken file or not appropriate.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Report',
                style: 'destructive',
                onPress: () =>
                  reportDocument(target.id, 'Reported from app')
                    .then(() => Alert.alert('Thanks', 'Admins will review it.'))
                    .catch((e) => Alert.alert('Error', e.message)),
              },
            ]),
        },
      ]
    : [];

  return {
    open,
    download,
    actionsFor: (d: DocumentRow) => setTarget(d),
    sheet: <ActionSheet visible={!!target} title={target?.title} onClose={() => setTarget(null)} actions={actions} />,
  };
}
