import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Badge, Button, Card, ChipRow, EmptyState, ErrorNote, Loading, Row, Txt } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { ModReport, useModReports, useResolveReport } from '@/api/documents';
import { timeAgo } from '@/lib/format';
import { colors } from '@/theme';
import { DOC_TYPE_LABEL, REPORT_REASON_LABEL } from '@/types/db';

const ACTION_TEXT = { dismiss: 'Dismissed', hide_document: 'Document hidden', delete_document: 'Document deleted' } as const;

function ReportCard({ r }: { r: ModReport }) {
  const resolve = useResolveReport();
  const d = r.document;
  const act = (action: 'dismiss' | 'hide_document' | 'delete_document') =>
    resolve.mutate({ id: r.id, action }, { onError: (e) => Alert.alert('Error', e.message) });
  const confirmDelete = () =>
    Alert.alert('Delete this document?', `“${d.title}” is removed for everyone. This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => act('delete_document') },
    ]);

  return (
    <Card style={{ gap: 10 }}>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        <Badge label={REPORT_REASON_LABEL[r.reason]} tone="danger" />
        <Badge label={`${d.report_count} report${d.report_count > 1 ? 's' : ''}`} tone="neutral" />
        {d.status !== 'approved' ? <Badge label={d.status === 'hidden' ? 'Hidden' : d.status} tone="neutral" /> : null}
      </Row>
      {r.comment ? (
        <Txt size={13} style={{ fontStyle: 'italic' }}>
          “{r.comment}”
        </Txt>
      ) : null}
      <Pressable accessibilityRole="button" onPress={() => router.push(`/documents/file/${d.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bg, borderRadius: 14, padding: 10 }}>
        <Icon name={d.source === 'drive_folder' ? 'folder' : 'doc'} size={22} color={colors.royal} />
        <View style={{ flex: 1 }}>
          <Txt size={14} weight={700} numberOfLines={2}>
            {d.title}
          </Txt>
          <Txt size={11} color={colors.muted} numberOfLines={1}>
            {d.level.short_name} · {d.subject.name} · {DOC_TYPE_LABEL[d.type]} · by {d.uploader?.full_name ?? 'unknown'}
          </Txt>
        </View>
        <Txt size={12} weight={700} color={colors.royal}>
          Preview
        </Txt>
      </Pressable>
      <Txt size={11} color={colors.muted}>
        Reported by {r.reporter.full_name} · {timeAgo(r.created_at)}
      </Txt>
      {r.status === 'open' ? (
        <Row gap={8}>
          <Button title="Dismiss" small variant="outline" style={{ flex: 1 }} loading={resolve.isPending} onPress={() => act('dismiss')} />
          <Button title="Hide" small variant="violet" style={{ flex: 1 }} onPress={() => act('hide_document')} />
          <Button title="Delete" small variant="ghost" style={{ flex: 1 }} onPress={confirmDelete} />
        </Row>
      ) : (
        <Txt size={12} weight={700} color={colors.success}>
          ✓ {r.action ? ACTION_TEXT[r.action] : 'Resolved'}
          {r.resolved_at ? ` · ${timeAgo(r.resolved_at)}` : ''}
        </Txt>
      )}
    </Card>
  );
}

export function ReportsTab() {
  const [status, setStatus] = useState<'open' | 'resolved'>('open');
  const reports = useModReports(status);
  return (
    <>
      <ChipRow
        variant="outline"
        activeColor={colors.violet}
        options={[
          { value: 'open', label: 'Open' },
          { value: 'resolved', label: 'Resolved' },
        ]}
        value={status}
        onChange={setStatus}
      />
      <ErrorNote error={reports.error} />
      {reports.isLoading ? (
        <Loading />
      ) : !reports.data?.length ? (
        <EmptyState icon="flag" title={status === 'open' ? 'No open reports' : 'Nothing resolved yet'} body="Reports from students on documents of your levels appear here." />
      ) : (
        reports.data.map((r) => <ReportCard key={r.id} r={r} />)
      )}
    </>
  );
}
