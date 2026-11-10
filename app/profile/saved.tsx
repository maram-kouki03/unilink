import React from 'react';
import { router } from 'expo-router';
import { FileRow } from '@/components/cards';
import { Card, EmptyState, Header, Loading, Screen } from '@/components/ui';
import { useStarredDocuments } from '@/api/documents';
import { useFileActions } from '@/components/useFileActions';

export default function SavedDocuments() {
  const starred = useStarredDocuments();
  const { open, download, actionsFor, sheet } = useFileActions();
  return (
    <Screen refreshing={starred.isRefetching} onRefresh={() => starred.refetch()}>
      <Header title="Saved Documents" />
      {starred.isLoading ? (
        <Loading />
      ) : starred.data?.length ? (
        <Card style={{ padding: 0 }}>
          {starred.data.map((d, i) => (
            <FileRow key={d.id} doc={d} last={i === starred.data!.length - 1} onPress={() => open(d)} onDownload={() => download(d)} onMore={() => actionsFor(d)} />
          ))}
        </Card>
      ) : (
        <EmptyState icon="star" title="No saved documents" body="Tap ☆ on any file to keep it here." action="Browse documents" onAction={() => router.navigate('/documents')} />
      )}
      {sheet}
    </Screen>
  );
}
