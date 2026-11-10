import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Avatar, Button, ErrorNote, Header, IconButton, Loading, Row, Screen, Txt } from '@/components/ui';
import { useDocument, useToggleStar } from '@/api/documents';
import { useFileActions } from '@/components/useFileActions';
import { signedDocUrl } from '@/lib/storage';
import { fileSize, shortDate } from '@/lib/format';
import { colors, shadows } from '@/theme';
import { DOC_TYPE_LABEL, LEVEL_LABEL } from '@/types/db';

export default function FilePreview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const doc = useDocument(id);
  const star = useToggleStar();
  const { download, actionsFor, sheet } = useFileActions();
  const [url, setUrl] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<unknown>(null);

  useEffect(() => {
    if (doc.data) signedDocUrl(doc.data.file_path).then(setUrl).catch(setUrlError);
  }, [doc.data]);

  if (doc.isLoading) return <Screen><Loading /></Screen>;
  if (!doc.data) return <Screen><Header title="File" /><ErrorNote error={doc.error ?? 'File not found'} /></Screen>;
  const d = doc.data;

  // iOS renders PDFs natively in WebView; Android needs a viewer.
  const viewerUrl =
    url && (Platform.OS === 'ios' || d.file_ext !== 'pdf')
      ? url
      : url
        ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}`
        : null;

  return (
    <Screen
      scroll={false}
      footer={
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Button
            title="Open in Drive"
            variant="outline"
            icon="drive"
            style={{ flex: 1 }}
            onPress={() => (d.drive_url ? Linking.openURL(d.drive_url) : url && Linking.openURL(url))}
          />
          <Button title="Download" icon="download" style={{ flex: 1 }} onPress={() => download(d)} />
        </View>
      }
    >
      <View style={{ gap: 14, flex: 1 }}>
        <Header
          title={d.title}
          subtitle={`${d.file_ext.toUpperCase()} · ${DOC_TYPE_LABEL[d.doc_type]}${d.academic_year ? ` ${d.academic_year}` : ''} · ${fileSize(d.size_bytes)}`}
          right={
            <Row gap={8}>
              <IconButton icon="star" label={d.starred ? 'Unstar' : 'Star'} color={d.starred ? colors.violet : colors.iconMuted} onPress={() => star.mutate({ id: d.id, starred: d.starred })} />
              <IconButton icon="moreV" label="More actions" onPress={() => actionsFor(d)} />
            </Row>
          }
        />
        <View style={[{ flex: 1, borderRadius: 22, overflow: 'hidden', backgroundColor: '#E2E3F3' }, shadows.soft]}>
          <ErrorNote error={urlError} />
          {viewerUrl ? (
            <WebView source={{ uri: viewerUrl }} startInLoadingState renderLoading={() => <ActivityIndicator style={{ flex: 1 }} color={colors.royal} />} style={{ flex: 1, backgroundColor: '#E2E3F3' }} />
          ) : (
            <Loading label="Preparing preview…" />
          )}
        </View>
        <Row style={[{ backgroundColor: colors.card, borderRadius: 18, padding: 14 }, shadows.card]}>
          <Avatar name={d.uploader?.full_name} dark />
          <View style={{ flex: 1 }}>
            <Txt size={14} weight={700}>
              {d.uploader?.full_name ?? 'Former student'}
            </Txt>
            <Txt size={12} color={colors.muted}>
              Uploaded {shortDate(d.created_at)}
              {d.uploader?.level ? ` · ${LEVEL_LABEL[d.uploader.level]}` : ''}
            </Txt>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Txt size={14} weight={800} color={colors.royal}>
              {d.downloads}
            </Txt>
            <Txt size={11} color={colors.muted}>
              downloads
            </Txt>
          </View>
        </Row>
      </View>
      {sheet}
    </Screen>
  );
}
