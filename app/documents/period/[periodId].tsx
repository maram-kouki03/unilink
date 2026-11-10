import React, { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Breadcrumbs, DashedAction, FolderCard } from '@/components/cards';
import { Card, EmptyState, ErrorNote, Header, Loading, Row, Screen, SearchBar, Txt } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { ViewToggle } from '@/components/ViewToggle';
import { usePeriod, useSubjects } from '@/api/documents';
import { colors, folderPalette } from '@/theme';

export default function PeriodScreen() {
  const { periodId } = useLocalSearchParams<{ periodId: string }>();
  const period = usePeriod(periodId);
  const subjects = useSubjects(periodId);
  const [q, setQ] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const list = (subjects.data ?? []).filter((s) => s.name.toLowerCase().includes(q.trim().toLowerCase()));
  const total = list.reduce((n, s) => n + s.files, 0);
  const level = period.data?.level;

  return (
    <Screen refreshing={subjects.isRefetching} onRefresh={() => subjects.refetch()}>
      <Header title={period.data?.label ?? 'Period'} right={<ViewToggle value={view} onChange={setView} />} />
      <Breadcrumbs
        items={[
          { label: 'Documents', href: '/documents' },
          { label: level?.short_name ?? '…', href: level ? `/documents/level/${level.id}` : undefined },
          { label: period.data?.name ?? '…' },
        ]}
      />
      <SearchBar value={q} onChangeText={setQ} placeholder="Search a subject…" />
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt size={16} weight={800}>
          Subjects
        </Txt>
        <Txt size={12} weight={600} color={colors.muted}>
          {list.length} folders · {total} files
        </Txt>
      </Row>
      <ErrorNote error={subjects.error} />
      {subjects.isLoading ? (
        <Loading />
      ) : !list.length ? (
        <EmptyState title="No subjects" body="Nothing matches your search." />
      ) : view === 'grid' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {list.map((s, i) => (
            <View key={s.id} style={{ width: '48%', flexGrow: 1 }}>
              <FolderCard title={s.name} color={s.color ?? folderPalette[i % folderPalette.length]} files={s.files} lastUpdated={s.last_updated} onPress={() => router.push(`/documents/subject/${s.id}`)} />
            </View>
          ))}
          <View style={{ width: '48%', flexGrow: 1 }}>
            <DashedAction label="Upload here" icon="upload" height={112} onPress={() => router.push({ pathname: '/documents/upload', params: { levelId: String(level?.id ?? ''), periodId } })} />
          </View>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {list.map((s, i) => (
            <Card key={s.id} onPress={() => router.push(`/documents/subject/${s.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Icon name="folder" size={28} color={s.color ?? folderPalette[i % folderPalette.length]} />
              <View style={{ flex: 1 }}>
                <Txt size={15} weight={700}>
                  {s.name}
                </Txt>
                <Txt size={12} color={colors.muted}>
                  {s.files} files
                </Txt>
              </View>
              <Icon name="chevronRight" size={18} color={colors.iconMuted} />
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
