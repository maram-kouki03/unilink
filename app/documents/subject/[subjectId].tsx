import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Breadcrumbs, FileRow } from '@/components/cards';
import { Button, Card, ChipRow, EmptyState, ErrorNote, Header, Loading, Screen, SearchBar, SectionTitle } from '@/components/ui';
import { useDocuments, useSubject } from '@/api/documents';
import { useFileActions } from '@/components/useFileActions';
import { useDebounced } from '@/lib/useDebounced';
import { DOC_FILTERS, DocType } from '@/types/db';

export default function SubjectScreen() {
  const { subjectId } = useLocalSearchParams<{ subjectId: string }>();
  const subject = useSubject(subjectId);
  const [q, setQ] = useState('');
  const [type, setType] = useState<DocType | 'all'>('all');
  const query = useDebounced(q, 300);
  const docs = useDocuments(subjectId, type, query);
  const { open, download, actionsFor, sheet } = useFileActions();
  const period = subject.data?.period;

  const upload = () =>
    router.push({
      pathname: '/documents/upload',
      params: { levelId: String(period?.level.id ?? ''), periodId: period?.id ?? '', subjectId },
    });

  return (
    <Screen
      refreshing={docs.isRefetching}
      onRefresh={() => docs.refetch()}
      footer={<Button title="Upload to this folder" variant="gradient" icon="upload" onPress={upload} />}
    >
      <Header title={subject.data?.name ?? 'Subject'} />
      <Breadcrumbs
        items={[
          { label: 'Documents', href: '/documents' },
          { label: period?.level.short_name ?? '…', href: period ? `/documents/level/${period.level.id}` : undefined },
          { label: period?.name ?? '…', href: period ? `/documents/period/${period.id}` : undefined },
          { label: subject.data?.name ?? '…' },
        ]}
      />
      <SearchBar value={q} onChangeText={setQ} placeholder="Search for courses, exams…" />
      <ChipRow options={DOC_FILTERS} value={type} onChange={setType} />
      <SectionTitle title="Files" />
      <ErrorNote error={docs.error} />
      {docs.isLoading ? (
        <Loading />
      ) : !docs.data?.length ? (
        <EmptyState
          icon="doc"
          title={type === 'all' && !query ? 'This folder is empty' : 'No matching files'}
          body="Have last year's exam or a good summary? Share it with your promo."
          action="Upload a document"
          onAction={upload}
        />
      ) : (
        <Card style={{ padding: 0 }}>
          {docs.data.map((d, i) => (
            <FileRow key={d.id} doc={d} last={i === docs.data!.length - 1} onPress={() => open(d)} onDownload={() => download(d)} onMore={() => actionsFor(d)} />
          ))}
        </Card>
      )}
      {sheet}
    </Screen>
  );
}
