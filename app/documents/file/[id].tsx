import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import { FileRow, isVerifiedUploader } from '@/components/cards';
import { useRole } from '@/components/docs';
import { Avatar, Badge, Button, Card, EmptyState, ErrorNote, Header, IconButton, Loading, Row, Screen, SectionTitle, Txt } from '@/components/ui';
import { Icon, IconName } from '@/components/Icon';
import { DocLink, openDocument, useDocument, useFolderChildren, useModerateDocument, useToggleStar, useToggleUseful } from '@/api/documents';
import { useFileActions } from '@/components/useFileActions';
import { fileSize, shortDate } from '@/lib/format';
import { colors, shadows } from '@/theme';
import { DOC_TYPE_LABEL, LEVEL_LABEL, LevelCode } from '@/types/db';

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp'];

const REJECT_TEXT: Record<string, string> = {
  duplicate: 'Already in the library (duplicate)',
  unreadable: 'Unreadable file',
  wrong_subject: 'Wrong subject',
  copyrighted: 'Copyrighted content',
  other: 'Does not follow the rules',
};

function Action({ icon, emoji, label, active, onPress, disabled }: { icon?: IconName; emoji?: string; label: string; active?: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        { flex: 1, minHeight: 58, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: active ? colors.navy : colors.card },
        shadows.soft,
        (pressed || disabled) && { opacity: disabled ? 0.45 : 0.8 },
      ]}
    >
      {emoji ? <Txt size={17}>{emoji}</Txt> : icon ? <Icon name={icon} size={18} color={active ? colors.white : colors.navy} /> : null}
      <Txt size={11} weight={700} color={active ? colors.white : colors.text} numberOfLines={1}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** URL the WebView can render: Drive preview page, Google viewer on Android, the file itself on iOS. */
function viewerUrl(link: DocLink | null, ext: string, driveId: string | null): { url: string | null; unavailable: boolean } {
  if (!link) return { url: null, unavailable: false };
  if (link.source === 'drive_file' && driveId) return { url: `https://drive.google.com/file/d/${driveId}/preview`, unavailable: false };
  if (IMAGE_EXTS.includes(ext) || Platform.OS === 'ios') return { url: link.url, unavailable: false };
  // Android cannot show PDFs/Office files in a WebView: the Google viewer fetches the (public https) signed link.
  if (!link.url.startsWith('https://')) return { url: null, unavailable: true };
  return { url: `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(link.url)}`, unavailable: false };
}

export default function DocumentViewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const doc = useDocument(id);
  const children = useFolderChildren(doc.data?.source === 'drive_folder' ? id : '');
  const star = useToggleStar();
  const useful = useToggleUseful();
  const moderate = useModerateDocument();
  const { isStaff } = useRole();
  const { open, download, saveOffline, share, askReport, actionsFor, sheet } = useFileActions();
  const [link, setLink] = useState<DocLink | null>(null);
  const [linkError, setLinkError] = useState<unknown>(null);

  // Counts one open per visit and gives the link to show.
  useEffect(() => {
    if (!doc.data?.id || doc.data.source === 'drive_folder') return;
    setLinkError(null);
    openDocument(doc.data.id).then(setLink).catch(setLinkError);
  }, [doc.data?.id, doc.data?.source]);

  if (doc.isLoading) {
    return (
      <Screen>
        <Header title="Document" />
        <Loading />
      </Screen>
    );
  }
  if (!doc.data) {
    return (
      <Screen>
        <Header title="Document" />
        <ErrorNote error={doc.error ?? 'Document not found'} />
      </Screen>
    );
  }

  const d = doc.data;
  const isFolder = d.source === 'drive_folder';
  const approved = d.status === 'approved';
  const preview = viewerUrl(link, d.file_ext, d.drive_file_id);
  const canNewVersion = d.mine && !isFolder && !d.parent_folder_doc_id && d.status !== 'rejected';
  const typeLabel = `${DOC_TYPE_LABEL[d.type]}${d.number != null ? ` ${d.number}` : ''}`;

  const approve = () =>
    moderate.mutate(
      { kind: 'approve', id: d.id },
      { onSuccess: () => Alert.alert('Approved', 'The document is published.'), onError: (e) => Alert.alert('Error', e.message) },
    );

  return (
    <Screen
      refreshing={doc.isRefetching}
      onRefresh={() => {
        doc.refetch();
        if (isFolder) children.refetch();
      }}
      footer={
        isFolder ? (
          <Button title="Open in Google Drive" icon="drive" variant="outline" onPress={() => d.drive_url && Linking.openURL(d.drive_url)} />
        ) : (
          <Row gap={12}>
            {d.drive_url ? <Button title="Drive" variant="outline" icon="drive" style={{ flex: 1 }} onPress={() => Linking.openURL(d.drive_url!)} /> : null}
            <Button title="Download" icon="download" style={{ flex: 2 }} onPress={() => download(d)} />
          </Row>
        )
      }
    >
      <Header title={d.title} subtitle={d.subject ? `${d.subject.period.level.short_name} › ${d.subject.period.name} › ${d.subject.name}` : undefined} right={<IconButton icon="moreV" label="More actions" onPress={() => actionsFor(d)} />} />

      {/* ── status for my own (or moderated) document ── */}
      {d.status === 'pending' ? (
        <Card style={{ backgroundColor: colors.violetBg, gap: 6 }}>
          <Txt size={14} weight={800} color={colors.violetDeep}>
            ⏳ Waiting for review
          </Txt>
          <Txt size={12} color={colors.violetDeep}>
            {d.mine ? 'Only you and the moderators can see it for now. You will get a notification.' : 'This document is not published yet.'}
          </Txt>
          {isStaff ? (
            <Row gap={8}>
              <Button title="Approve" small loading={moderate.isPending} onPress={approve} />
              <Button title="Open queue" small variant="outline" onPress={() => router.push('/mod/queue')} />
            </Row>
          ) : null}
        </Card>
      ) : d.status === 'rejected' ? (
        <Card style={{ backgroundColor: colors.dangerBg, gap: 4 }}>
          <Txt size={14} weight={800} color={colors.dangerText}>
            ❌ Rejected: {REJECT_TEXT[d.reject_reason ?? 'other'] ?? d.reject_reason}
          </Txt>
          {d.reject_note ? (
            <Txt size={12} color={colors.dangerText}>
              {d.reject_note}
            </Txt>
          ) : null}
        </Card>
      ) : d.status === 'hidden' ? (
        <Card style={{ backgroundColor: '#E8E9F2' }}>
          <Txt size={13} weight={700} color="#55597A">
            Hidden{d.hidden_reason === 'reports' ? ' after several reports' : d.hidden_reason === 'drive_missing' ? ': the file is no longer on Google Drive' : ' by a moderator'}.
          </Txt>
        </Card>
      ) : null}

      {/* ── preview ── */}
      {isFolder ? (
        <>
          <SectionTitle title={`Files in this folder${children.data ? ` · ${children.data.length}` : ''}`} />
          <ErrorNote error={children.error} />
          {children.isLoading ? (
            <Loading />
          ) : children.data?.length ? (
            <Card style={{ padding: 0 }}>
              {children.data.map((c, i) => (
                <FileRow key={c.id} doc={c} last={i === children.data!.length - 1} onPress={() => open(c)} onDownload={() => download(c)} onMore={() => actionsFor(c)} />
              ))}
            </Card>
          ) : (
            <EmptyState icon="folder" title={approved ? 'Importing…' : 'Not imported yet'} body={approved ? 'The files appear here in a minute. Pull to refresh.' : 'Files are imported once a moderator approves the folder.'} />
          )}
        </>
      ) : (
        <View style={[{ height: 460, borderRadius: 22, overflow: 'hidden', backgroundColor: '#E2E3F3' }, shadows.soft]}>
          {preview.url ? (
            <WebView
              source={{ uri: preview.url }}
              startInLoadingState
              renderLoading={() => <ActivityIndicator style={{ flex: 1 }} color={colors.royal} />}
              style={{ flex: 1, backgroundColor: '#E2E3F3' }}
            />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 }}>
              {linkError ? (
                <ErrorNote error={linkError} />
              ) : preview.unavailable ? (
                <Txt size={14} weight={600} color={colors.muted} style={{ textAlign: 'center' }}>
                  Preview not available here — tap Download.
                </Txt>
              ) : (
                <Loading label="Preparing preview…" />
              )}
            </View>
          )}
        </View>
      )}

      {/* ── actions ── */}
      <Row gap={8}>
        <Action
          emoji="👍"
          label={`Useful · ${d.useful_count}`}
          active={d.voted_useful}
          disabled={!approved || d.mine}
          onPress={() => useful.mutate(d.id, { onError: (e) => Alert.alert('Error', e.message) })}
        />
        <Action icon="star" label={d.starred ? 'Starred' : 'Star'} active={d.starred} disabled={!approved} onPress={() => star.mutate({ id: d.id, starred: d.starred })} />
        <Action icon="share" label="Share" onPress={() => share(d)} />
        {!isFolder ? <Action icon="offline" label="Offline" onPress={() => saveOffline(d)} /> : null}
        {!d.mine && approved ? <Action icon="flag" label="Report" onPress={() => askReport(d)} /> : null}
      </Row>
      {canNewVersion ? <Button title="Upload a new version" icon="upload" variant="outline" onPress={() => router.push(`/documents/version/${d.id}`)} /> : null}

      {/* ── links between exams and corrections ── */}
      {d.type === 'correction' && d.correction_of_id ? (
        <Card onPress={() => router.push(`/documents/file/${d.correction_of_id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name="doc" size={20} color={colors.royal} />
          <Txt size={14} weight={700} style={{ flex: 1 }}>
            See the exam
          </Txt>
          <Icon name="chevronRight" size={18} color={colors.iconMuted} />
        </Card>
      ) : null}
      {d.type === 'exam' ? (
        <>
          <SectionTitle title="Corrections" />
          {d.corrections.length ? (
            <Card style={{ padding: 0 }}>
              {d.corrections.map((c, i) => (
                <FileRow key={c.id} doc={c} last={i === d.corrections.length - 1} onPress={() => open(c)} onDownload={() => download(c)} />
              ))}
            </Card>
          ) : (
            <EmptyState
              icon="check"
              title="No correction yet"
              body="Solved this exam? Share your correction."
              action="Add a correction"
              onAction={() =>
                router.push({
                  pathname: '/documents/upload',
                  params: { mode: 'file', subjectId: d.subject_id, correctionOf: d.id, levelId: '', periodId: '' },
                })
              }
            />
          )}
        </>
      ) : null}

      {/* ── details ── */}
      <Card style={{ gap: 12 }}>
        <Row>
          <Avatar name={d.uploader?.full_name} dark />
          <View style={{ flex: 1, gap: 2 }}>
            <Row gap={6}>
              <Txt size={14} weight={700}>
                {d.uploader?.full_name ?? (d.parent_folder_doc_id || isFolder ? 'Google Drive' : 'Former student')}
              </Txt>
              {isVerifiedUploader(d) ? <Badge label="✓ Verified" tone="navy" /> : null}
            </Row>
            <Txt size={12} color={colors.muted}>
              Added {shortDate(d.created_at)}
              {d.uploader?.level && d.uploader.level in LEVEL_LABEL ? ` · ${LEVEL_LABEL[d.uploader.level as LevelCode]}` : ''}
            </Txt>
          </View>
        </Row>
        <Row gap={0} style={{ backgroundColor: colors.bg, borderRadius: 14, paddingVertical: 10 }}>
          {[
            ['Opens', d.open_count],
            ['Downloads', d.download_count],
            ['Useful', d.useful_count],
          ].map(([label, n]) => (
            <View key={label as string} style={{ flex: 1, alignItems: 'center' }}>
              <Txt size={16} weight={800} color={colors.navy}>
                {n}
              </Txt>
              <Txt size={11} color={colors.muted}>
                {label}
              </Txt>
            </View>
          ))}
        </Row>
        <Txt size={12} color={colors.muted}>
          {[typeLabel, d.academic_year, isFolder ? 'Google Drive folder' : `${d.file_ext.toUpperCase()} · ${fileSize(d.size_bytes)}`, d.version > 1 ? `version ${d.version}` : null]
            .filter(Boolean)
            .join(' · ')}
        </Txt>
      </Card>
      {sheet}
    </Screen>
  );
}
