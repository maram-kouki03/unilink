import React, { useState } from 'react';
import { Alert, Linking, Share } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ActionSheet } from '@/components/cards';
import { ReportSheet } from '@/components/docs';
import { documentLink, reportDocument } from '@/api/documents';
import { offlineKey, fileNameOf, saveDocOffline } from '@/lib/offline';
import { downloadAndShare } from '@/lib/storage';
import { DocumentRow, ReportReason } from '@/types/db';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Shared behaviour for file rows: open, download and the ⋮ menu (Drive, offline, share, report). */
export function useFileActions() {
  const qc = useQueryClient();
  const [target, setTarget] = useState<DocumentRow | null>(null);
  const [reportTarget, setReportTarget] = useState<DocumentRow | null>(null);

  /** The viewer opens the file and counts the open. */
  const open = (d: Pick<DocumentRow, 'id'>) => router.push(`/documents/file/${d.id}`);

  const download = async (d: DocumentRow) => {
    try {
      // The server counts the download (Drive files come through it, Google Docs as PDF).
      await downloadAndShare(d.id, fileNameOf(d));
      qc.invalidateQueries({ queryKey: ['doc', d.id] });
    } catch (e) {
      Alert.alert('Download failed', message(e));
    }
  };

  const saveOffline = async (d: DocumentRow) => {
    try {
      await saveDocOffline(d);
      qc.invalidateQueries({ queryKey: offlineKey });
      Alert.alert('Saved offline', 'Open it any time from Documents › Offline, even without internet.');
    } catch (e) {
      Alert.alert('Could not save', message(e));
    }
  };

  const share = async (d: DocumentRow) => {
    try {
      const { url } = await documentLink(d.id);
      Share.share({ message: d.source === 'upload' ? `${d.title} (link valid 1 hour) – ${url}` : `${d.title} – ${url}` });
    } catch (e) {
      Alert.alert('Could not share', message(e));
    }
  };

  const report = (d: DocumentRow, reason: ReportReason) =>
    reportDocument(d.id, reason)
      .then((r) => Alert.alert('Thanks', r.alreadyReported ? 'You already reported this document.' : 'Moderators will review it.'))
      .catch((e) => Alert.alert('Could not report', message(e)));

  const actions = target
    ? [
        ...(target.drive_url ? [{ label: 'Open in Google Drive', icon: 'drive' as const, onPress: () => Linking.openURL(target.drive_url!) }] : []),
        ...(target.source !== 'drive_folder'
          ? [
              { label: 'Download', icon: 'download' as const, onPress: () => download(target) },
              { label: 'Save offline', icon: 'offline' as const, onPress: () => saveOffline(target) },
            ]
          : []),
        { label: 'Share', icon: 'share' as const, onPress: () => share(target) },
        ...(!target.mine && target.status === 'approved'
          ? [{ label: 'Report', icon: 'flag' as const, danger: true, onPress: () => setTimeout(() => setReportTarget(target), 400) }]
          : []),
      ]
    : [];

  return {
    open,
    download,
    saveOffline,
    share,
    askReport: (d: DocumentRow) => setReportTarget(d),
    actionsFor: (d: DocumentRow) => setTarget(d),
    sheet: (
      <>
        <ActionSheet visible={!!target} title={target?.title} onClose={() => setTarget(null)} actions={actions} />
        <ReportSheet
          visible={!!reportTarget}
          title={reportTarget?.title}
          onClose={() => setReportTarget(null)}
          onPick={(reason) => reportTarget && report(reportTarget, reason)}
        />
      </>
    ),
  };
}
