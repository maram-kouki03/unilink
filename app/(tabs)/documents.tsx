import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Breadcrumbs, DashedAction, FileRow, FolderCard } from '@/components/cards';
import { FileIcon } from '@/components/Illustrations';
import { Card, ChipRow, EmptyState, ErrorNote, Loading, Row, Screen, SearchBar, SectionTitle, Txt } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { useDebounced } from '@/lib/useDebounced';
import { useDocumentSearch, useLevels, useRecentDocuments, useStarredDocuments } from '@/api/documents';
import { useFileActions } from '@/components/useFileActions';
import { ViewToggle } from '@/components/ViewToggle';
import { colors, folderPalette, shadows } from '@/theme';
import { timeAgo } from '@/lib/format';
import { DOC_FILTERS, DocType } from '@/types/db';

export default function DocumentsRoot() {
  const [q, setQ] = useState('');
  const [type, setType] = useState<DocType | 'all'>('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const query = useDebounced(q, 300);
  const levels = useLevels();
  const recent = useRecentDocuments();
  const starred = useStarredDocuments();
  const searching = query.trim().length >= 2 || type !== 'all';
  const results = useDocumentSearch(query, type);
  const { open, actionsFor, sheet } = useFileActions();

  return (
    <Screen
      withTabBar
      refreshing={levels.isRefetching}
      onRefresh={() => {
        levels.refetch();
        recent.refetch();
        starred.refetch();
      }}
    >
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt size={26} weight={800} accessibilityRole="header">
          Documents
        </Txt>
        <ViewToggle value={view} onChange={setView} />
      </Row>
      <Breadcrumbs items={[{ label: 'Documents' }]} />
      <SearchBar value={q} onChangeText={setQ} placeholder="Search for courses, exams…" />
      <ChipRow options={DOC_FILTERS} value={type} onChange={setType} />

      {searching ? (
        <>
          <SectionTitle title={`Results${results.data ? ` · ${results.data.length}` : ''}`} />
          {results.isLoading ? (
            <Loading />
          ) : results.data?.length ? (
            <Card style={{ padding: 0 }}>
              {results.data.map((d, i) => (
                <FileRow key={d.id} doc={d} last={i === results.data!.length - 1} onPress={() => open(d)} onMore={() => actionsFor(d)} />
              ))}
            </Card>
          ) : (
            <EmptyState icon="search" title="Nothing found" body="Try another keyword or upload the document yourself." action="Upload" onAction={() => router.push('/documents/upload')} />
          )}
        </>
      ) : (
        <>
          {recent.data?.length ? (
            <>
              <SectionTitle title="Recently opened" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }}>
                {recent.data.map((d) => (
                  <Pressable key={d.id} onPress={() => open(d)} style={[{ width: 216, height: 60, backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }, shadows.soft]}>
                    <FileIcon ext={d.file_ext} size={22} />
                    <View style={{ flex: 1 }}>
                      <Txt size={13} weight={700} numberOfLines={1}>
                        {d.title}
                      </Txt>
                      <Txt size={11} color={colors.muted}>
                        Opened · {timeAgo(d.opened_at)}
                      </Txt>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          ) : null}

          <SectionTitle title="Levels" />
          <ErrorNote error={levels.error} />
          {levels.isLoading ? (
            <Loading />
          ) : view === 'grid' ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {levels.data?.map((l, i) => (
                <View key={l.id} style={{ width: '48%', flexGrow: 1 }}>
                  <FolderCard title={l.name} color={folderPalette[i % folderPalette.length]} files={l.files} lastUpdated={l.last_updated} onPress={() => router.push(`/documents/level/${l.id}`)} />
                </View>
              ))}
              <View style={{ width: '48%', flexGrow: 1 }}>
                <DashedAction label="Upload a document" onPress={() => router.push('/documents/upload')} height={112} />
              </View>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {levels.data?.map((l, i) => (
                <Card key={l.id} onPress={() => router.push(`/documents/level/${l.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Icon name="folder" size={28} color={folderPalette[i % folderPalette.length]} />
                  <View style={{ flex: 1 }}>
                    <Txt size={15} weight={700}>
                      {l.name}
                    </Txt>
                    <Txt size={12} color={colors.muted}>
                      {l.files} files
                    </Txt>
                  </View>
                  <Icon name="chevronRight" size={18} color={colors.iconMuted} />
                </Card>
              ))}
            </View>
          )}

          {starred.data?.length ? (
            <>
              <Row gap={6}>
                <Icon name="star" size={16} color={colors.violet} />
                <Txt size={16} weight={800}>
                  Starred
                </Txt>
              </Row>
              <Card style={{ padding: 0 }}>
                {starred.data.map((d, i) => (
                  <FileRow key={d.id} doc={d} last={i === starred.data!.length - 1} onPress={() => open(d)} onMore={() => actionsFor(d)} />
                ))}
              </Card>
            </>
          ) : null}
        </>
      )}
      {sheet}
    </Screen>
  );
}
