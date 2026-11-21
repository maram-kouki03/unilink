import React from 'react';
import { router } from 'expo-router';
import { FileRow } from '@/components/cards';
import { Card, EmptyState, ErrorNote, Header, Loading, Screen } from '@/components/ui';
import { useRecentDocuments } from '@/api/documents';
import { useFileActions } from '@/components/useFileActions';

export default function RecentDocuments() {
  const recent = useRecentDocuments();
  const { open, download, actionsFor, sheet } = useFileActions();
  return (
    <Screen refreshing={recent.isRefetching} onRefresh={() => recent.refetch()}>
      <Header title="Recently opened" />
      <ErrorNote error={recent.error} />
      {recent.isLoading ? (
        <Loading />
      ) : recent.data?.length ? (
        <Card style={{ padding: 0 }}>
          {recent.data.map((d, i) => (
            <FileRow key={d.id} doc={d} last={i === recent.data!.length - 1} onPress={() => open(d)} onDownload={() => download(d)} onMore={() => actionsFor(d)} />
          ))}
        </Card>
      ) : (
        <EmptyState icon="clock" title="Nothing opened yet" body="Documents you open appear here." action="Browse documents" onAction={() => router.navigate('/documents')} />
      )}
      {sheet}
    </Screen>
  );
}
