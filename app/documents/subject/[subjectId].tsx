import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Breadcrumbs, FileRow } from '@/components/cards';
import { AddDocumentSheet, useRole } from '@/components/docs';
import { Button, Card, ChipRow, EmptyState, ErrorNote, Header, IconButton, Loading, Screen, SegmentedTabs, Txt } from '@/components/ui';
import { DocSort, useDocuments, useDriveSync, useSubject } from '@/api/documents';
import { useFileActions } from '@/components/useFileActions';
import { colors } from '@/theme';
import { Alert } from 'react-native';
import { DocType } from '@/types/db';

const TABS: { value: DocType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'course', label: 'Course' },
  { value: 'td', label: 'TD' },
  { value: 'tp', label: 'TP' },
  { value: 'exam', label: 'Exams' },
  { value: 'correction', label: 'Corrections' },
  { value: 'other', label: 'Other' },
];

export default function SubjectScreen() {
  const { subjectId } = useLocalSearchParams<{ subjectId: string }>();
  const subject = useSubject(subjectId);
  const { isStaff } = useRole();
  const [type, setType] = useState<DocType | 'all'>('all');
  const [year, setYear] = useState('all');
  const [sort, setSort] = useState<DocSort>('useful');
  const [adding, setAdding] = useState(false);
  const docs = useDocuments(subjectId, type, '', sort);
  const sync = useDriveSync();
  const { open, download, actionsFor, sheet } = useFileActions();
  const period = subject.data?.period;

  // Year chips come from the documents of this tab; filtering by year is instant.
  const years = useMemo(() => {
    const set = new Set((docs.data ?? []).map((d) => d.academic_year).filter((y): y is string => !!y));
    return [...set].sort().reverse();
  }, [docs.data]);
  const list = (docs.data ?? []).filter((d) => year === 'all' || d.academic_year === year);
  const mine = list.filter((d) => d.mine && d.status !== 'approved').length;

  const resync = () =>
    sync.mutate(subjectId, {
      onSuccess: (r) =>
        'added' in r
          ? Alert.alert('Drive synced', `${r.added} added · ${r.updated} updated · ${r.hidden} hidden${r.errors.length ? `\n\n${r.errors.join('\n')}` : ''}`)
          : Alert.alert('Sync started'),
      onError: (e) => Alert.alert('Sync failed', e.message),
    });

  return (
    <Screen
      refreshing={docs.isRefetching}
      onRefresh={() => {
        docs.refetch();
        subject.refetch();
      }}
      footer={<Button title="Add a document" variant="gradient" icon="plus" onPress={() => setAdding(true)} />}
    >
      <Header
        title={subject.data?.name ?? 'Subject'}
        subtitle={[subject.data?.code, subject.data?.track?.name].filter(Boolean).join(' · ') || undefined}
        right={isStaff ? <IconButton icon="drive" label="Sync Google Drive" onPress={resync} /> : undefined}
      />
      <ErrorNote error={subject.error} />
      <Breadcrumbs
        items={[
          { label: 'Documents', href: '/documents' },
          { label: period?.level.short_name ?? '…', href: period ? `/documents/level/${period.level.id}` : undefined },
          { label: period?.name ?? '…', href: period ? `/documents/period/${period.id}` : undefined },
          { label: subject.data?.name ?? '…' },
        ]}
      />
      <ChipRow
        options={TABS}
        value={type}
        onChange={(v) => {
          setType(v);
          setYear('all');
        }}
      />
      {years.length ? (
        <ChipRow options={[{ value: 'all', label: 'All years' }, ...years.map((y) => ({ value: y, label: y }))]} value={year} onChange={setYear} activeColor={colors.violet} variant="outline" />
      ) : null}
      <SegmentedTabs
        options={[
          { value: 'useful', label: '👍 Most useful' },
          { value: 'recent', label: 'Recent' },
        ]}
        value={sort}
        onChange={setSort}
      />
      {mine ? (
        <Txt size={12} color={colors.muted}>
          Your documents waiting for review (or rejected) are only visible to you.
        </Txt>
      ) : null}
      <ErrorNote error={docs.error} />
      {docs.isLoading ? (
        <Loading />
      ) : !list.length ? (
        <EmptyState
          icon="doc"
          title={type === 'all' && year === 'all' ? 'No documents yet' : 'Nothing in this filter'}
          body="Have last year's exam or a good TD? Share it with your promo."
          action="Add a document"
          onAction={() => setAdding(true)}
        />
      ) : (
        <Card style={{ padding: 0 }}>
          {list.map((d, i) => (
            <FileRow
              key={d.id}
              doc={d}
              last={i === list.length - 1}
              onPress={() => open(d)}
              onDownload={() => download(d)}
              onMore={() => actionsFor(d)}
              onCorrection={() => d.correction_id && router.push(`/documents/file/${d.correction_id}`)}
            />
          ))}
        </Card>
      )}
      <View style={{ height: 4 }} />
      <AddDocumentSheet visible={adding} onClose={() => setAdding(false)} levelId={period?.level.id} periodId={period?.id} subjectId={subjectId} />
      {sheet}
    </Screen>
  );
}
