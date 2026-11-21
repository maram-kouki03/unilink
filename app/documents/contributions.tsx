import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { router } from 'expo-router';
import { FileRow } from '@/components/cards';
import { AddDocumentSheet, useRole } from '@/components/docs';
import { Badge, Button, Card, ChipRow, EmptyState, ErrorNote, Header, Loading, Row, Screen, Txt } from '@/components/ui';
import { useDeleteDocument, useMyContributions } from '@/api/documents';
import { useFileActions } from '@/components/useFileActions';
import { colors } from '@/theme';
import { DocStatus } from '@/types/db';

const REJECT_TEXT: Record<string, string> = {
  duplicate: 'duplicate',
  unreadable: 'unreadable file',
  wrong_subject: 'wrong subject',
  copyrighted: 'copyrighted content',
  other: 'does not follow the rules',
};

const FILTERS: { value: DocStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'approved', label: 'Published' },
  { value: 'pending', label: '⏳ Pending' },
  { value: 'rejected', label: '❌ Rejected' },
  { value: 'hidden', label: 'Hidden' },
];

export default function MyContributions() {
  const list = useMyContributions();
  const del = useDeleteDocument();
  const { trusted, isStaff } = useRole();
  const [filter, setFilter] = useState<DocStatus | 'all'>('all');
  const [adding, setAdding] = useState(false);
  const { open, actionsFor, sheet } = useFileActions();
  const all = list.data ?? [];
  const docs = all.filter((d) => filter === 'all' || d.status === filter);
  const count = (s: DocStatus) => all.filter((d) => d.status === s).length;
  const totals = all.reduce((t, d) => ({ opens: t.opens + d.open_count, downloads: t.downloads + d.download_count, useful: t.useful + d.useful_count }), { opens: 0, downloads: 0, useful: 0 });

  const remove = (id: string, title: string) =>
    Alert.alert('Delete this document?', title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => del.mutate(id, { onError: (e) => Alert.alert('Error', e.message) }) },
    ]);

  return (
    <Screen refreshing={list.isRefetching} onRefresh={() => list.refetch()} footer={<Button title="Add a document" variant="gradient" icon="plus" onPress={() => setAdding(true)} />}>
      <Header title="My contributions" />
      <Card style={{ gap: 12 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt size={15} weight={800}>
            {count('approved')} published · {count('pending')} pending
          </Txt>
          {trusted || isStaff ? <Badge label="✓ Verified" tone="navy" /> : null}
        </Row>
        <Row gap={0} style={{ backgroundColor: colors.bg, borderRadius: 14, paddingVertical: 10 }}>
          {[
            ['Opens', totals.opens],
            ['Downloads', totals.downloads],
            ['👍 Useful', totals.useful],
          ].map(([label, n]) => (
            <View key={label as string} style={{ flex: 1, alignItems: 'center' }}>
              <Txt size={17} weight={800} color={colors.navy}>
                {n}
              </Txt>
              <Txt size={11} color={colors.muted}>
                {label}
              </Txt>
            </View>
          ))}
        </Row>
        {!trusted && !isStaff ? (
          <Txt size={12} color={colors.muted}>
            After 5 approved documents you become a verified contributor and your documents are published right away.
          </Txt>
        ) : null}
      </Card>
      <ChipRow options={FILTERS} value={filter} onChange={setFilter} />
      <ErrorNote error={list.error} />
      {list.isLoading ? (
        <Loading />
      ) : !docs.length ? (
        <EmptyState icon="upload" title={all.length ? 'Nothing in this filter' : 'No contributions yet'} body="Share your courses, TDs and exams with your promo." action="Add a document" onAction={() => setAdding(true)} />
      ) : (
        <View style={{ gap: 10 }}>
          {docs.map((d) => (
            <Card key={d.id} style={{ padding: 0 }}>
              <FileRow doc={{ ...d, mine: true }} last onPress={() => open(d)} onMore={() => actionsFor(d)} />
              <View style={{ paddingHorizontal: 14, paddingBottom: 12, gap: 8 }}>
                {d.status === 'rejected' ? (
                  <Txt size={12} weight={600} color={colors.dangerText}>
                    Reason: {REJECT_TEXT[d.reject_reason ?? 'other'] ?? d.reject_reason}
                    {d.reject_note ? ` – ${d.reject_note}` : ''}
                  </Txt>
                ) : null}
                <Row style={{ justifyContent: 'space-between' }}>
                  <Txt size={12} color={colors.muted}>
                    {d.subject?.name} · {d.open_count} opens · {d.download_count} downloads
                    {d.source === 'drive_folder' && d.children_count != null ? ` · ${d.children_count} files` : ''}
                  </Txt>
                  <Row gap={14}>
                    {d.status !== 'rejected' && d.source !== 'drive_folder' ? (
                      <Txt size={12} weight={700} color={colors.royal} onPress={() => router.push(`/documents/version/${d.id}`)}>
                        New version
                      </Txt>
                    ) : null}
                    <Txt size={12} weight={700} color={colors.dangerText} onPress={() => remove(d.id, d.title)}>
                      Delete
                    </Txt>
                  </Row>
                </Row>
              </View>
            </Card>
          ))}
        </View>
      )}
      <AddDocumentSheet visible={adding} onClose={() => setAdding(false)} />
      {sheet}
    </Screen>
  );
}
