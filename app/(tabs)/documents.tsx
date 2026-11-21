import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { FileRow, FolderCard } from '@/components/cards';
import { AddDocumentSheet, ContributorsStrip } from '@/components/docs';
import { FileIcon } from '@/components/Illustrations';
import { Button, Card, ChipRow, EmptyState, ErrorNote, IconButton, Loading, Row, Screen, SearchBar, SectionTitle, Txt } from '@/components/ui';
import { Icon, IconName } from '@/components/Icon';
import { useDebounced } from '@/lib/useDebounced';
import { useDocumentSearch, useLevels, useMyClass, useRecentDocuments, useStarredDocuments, useTopContributors } from '@/api/documents';
import { useOfflineDocs } from '@/lib/offline';
import { useFileActions } from '@/components/useFileActions';
import { colors, folderPalette, shadows } from '@/theme';
import { timeAgo } from '@/lib/format';
import { DOC_FILTERS, DocType } from '@/types/db';

function Shortcut({ icon, label, count, onPress }: { icon: IconName; label: string; count?: number; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [{ flex: 1, backgroundColor: colors.card, borderRadius: 16, paddingVertical: 12, alignItems: 'center', gap: 6 }, shadows.soft, pressed && { opacity: 0.8 }]}
    >
      <Icon name={icon} size={20} color={colors.royal} />
      <Txt size={12} weight={700}>
        {label}
        {count ? ` · ${count}` : ''}
      </Txt>
    </Pressable>
  );
}

export default function DocumentsHome() {
  const [q, setQ] = useState('');
  const [type, setType] = useState<DocType | 'all'>('all');
  const [adding, setAdding] = useState(false);
  const query = useDebounced(q, 300);
  const myClass = useMyClass();
  const levels = useLevels();
  const recent = useRecentDocuments();
  const starred = useStarredDocuments();
  const offline = useOfflineDocs();
  const top = useTopContributors();
  const searching = query.trim().length >= 2 || type !== 'all';
  const results = useDocumentSearch(query, type);
  const { open, download, actionsFor, sheet } = useFileActions();
  const cls = myClass.data;

  const refresh = () => {
    myClass.refetch();
    levels.refetch();
    recent.refetch();
    starred.refetch();
    offline.refetch();
    top.refetch();
    if (searching) results.refetch();
  };

  return (
    <Screen withTabBar refreshing={myClass.isRefetching || levels.isRefetching} onRefresh={refresh}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt size={26} weight={800} accessibilityRole="header">
          Documents
        </Txt>
        <IconButton icon="plus" label="Add a document" color={colors.white} bg={colors.navy} onPress={() => setAdding(true)} />
      </Row>
      <SearchBar value={q} onChangeText={setQ} placeholder="Search courses, TDs, exams…" />
      <ChipRow options={DOC_FILTERS} value={type} onChange={setType} />

      {searching ? (
        <>
          <SectionTitle title={`Results${results.data ? ` · ${results.data.length}` : ''}`} />
          <ErrorNote error={results.error} />
          {results.isLoading ? (
            <Loading />
          ) : results.data?.length ? (
            <Card style={{ padding: 0 }}>
              {results.data.map((d, i) => (
                <FileRow
                  key={d.id}
                  doc={d}
                  last={i === results.data!.length - 1}
                  onPress={() => open(d)}
                  onDownload={() => download(d)}
                  onMore={() => actionsFor(d)}
                  onCorrection={() => d.correction_id && open({ id: d.correction_id })}
                />
              ))}
            </Card>
          ) : (
            <EmptyState icon="search" title="Nothing found" body="Try another keyword, or add the document yourself." action="Add a document" onAction={() => setAdding(true)} />
          )}
        </>
      ) : (
        <>
          <Row gap={10}>
            <Shortcut icon="clock" label="Recent" onPress={() => router.push('/documents/recent')} />
            <Shortcut icon="star" label="Starred" count={starred.data?.length} onPress={() => router.push('/profile/saved')} />
            <Shortcut icon="offline" label="Offline" count={offline.data?.length} onPress={() => router.push('/documents/offline')} />
            <Shortcut icon="upload" label="Mine" onPress={() => router.push('/documents/contributions')} />
          </Row>

          {/* ── My class ── */}
          <SectionTitle
            title={cls?.level ? `My class · ${cls.level.short_name}${cls.period ? ` · ${cls.period.name}` : ''}` : 'My class'}
            action={cls?.level ? 'All semesters' : undefined}
            onAction={() => cls?.level && router.push(`/documents/level/${cls.level.id}`)}
          />
          <ErrorNote error={myClass.error} />
          {myClass.isLoading ? (
            <Loading />
          ) : !cls?.level ? (
            <EmptyState icon="user" title="Choose your level" body="Set your level in your profile to see your subjects here." action="Edit profile" onAction={() => router.push('/profile/edit')} />
          ) : !cls.subjects.length ? (
            <EmptyState icon="folder" title="No subjects yet" body="An admin has not added the subjects of this semester yet." />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }}>
              {cls.subjects.map((s, i) => (
                <View key={s.id} style={{ width: 160 }}>
                  <FolderCard
                    title={s.code ? `${s.name} · ${s.code}` : s.name}
                    color={s.color ?? folderPalette[i % folderPalette.length]}
                    files={s.files}
                    lastUpdated={s.last_updated}
                    onPress={() => router.push(`/documents/subject/${s.id}`)}
                  />
                </View>
              ))}
            </ScrollView>
          )}
          {cls?.track ? (
            <Txt size={12} color={colors.muted}>
              Showing common subjects + option {cls.track.name}.
            </Txt>
          ) : null}

          {/* ── Recently opened ── */}
          {recent.data?.length ? (
            <>
              <SectionTitle title="Recently opened" action="See all" onAction={() => router.push('/documents/recent')} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }}>
                {recent.data.slice(0, 8).map((d) => (
                  <Pressable
                    key={d.id}
                    onPress={() => open(d)}
                    style={[{ width: 216, height: 60, backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }, shadows.soft]}
                  >
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

          {/* ── Browse all levels ── */}
          <SectionTitle title="Browse all levels" />
          <ErrorNote error={levels.error} />
          {levels.isLoading ? (
            <Loading />
          ) : !levels.data?.length ? (
            <EmptyState title="No levels yet" body="An admin needs to create the academic structure." />
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {levels.data.map((l, i) => (
                <View key={l.id} style={{ width: '48%', flexGrow: 1 }}>
                  <FolderCard
                    title={l.name}
                    color={folderPalette[i % folderPalette.length]}
                    files={l.files}
                    lastUpdated={l.last_updated}
                    highlighted={cls?.level?.id === l.id}
                    onPress={() => router.push(`/documents/level/${l.id}`)}
                  />
                </View>
              ))}
            </View>
          )}

          {/* ── Top contributors ── */}
          {top.data?.length ? (
            <>
              <SectionTitle title="Top contributors" />
              <ContributorsStrip people={top.data} />
            </>
          ) : null}

          <Button title="Add a document" variant="gradient" icon="plus" onPress={() => setAdding(true)} />
        </>
      )}
      <AddDocumentSheet
        visible={adding}
        onClose={() => setAdding(false)}
        levelId={cls?.level?.id}
        periodId={cls?.period?.id}
      />
      {sheet}
    </Screen>
  );
}
