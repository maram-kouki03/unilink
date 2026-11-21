import React, { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Sheet, previewTitle } from '@/components/docs';
import { FileIcon } from '@/components/Illustrations';
import { Avatar, Badge, Button, Card, ChipRow, EmptyState, ErrorNote, Field, Loading, Row, SearchBar, Txt } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { QueueItem, useDocumentSearch, useFolderTree, useLevels, useModerateDocument, useModQueue } from '@/api/documents';
import { useDebounced } from '@/lib/useDebounced';
import { fileSize, timeAgo } from '@/lib/format';
import { colors } from '@/theme';
import { currentAcademicYear, DOC_TYPE_LABEL, DOC_TYPES, DocType, RejectReason } from '@/types/db';

const REJECT: { value: RejectReason; label: string }[] = [
  { value: 'unreadable', label: 'Unreadable' },
  { value: 'wrong_subject', label: 'Wrong subject' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'copyrighted', label: 'Copyrighted' },
  { value: 'other', label: 'Other' },
];

const SOURCE_LABEL = { upload: 'File', drive_file: 'Drive file', drive_folder: 'Drive folder' } as const;

const thisYear = Number(currentAcademicYear().slice(0, 4));
const YEARS = [0, 1, 2, 3, 4, 5].map((i) => `${thisYear - i}/${String((thisYear - i + 1) % 100).padStart(2, '0')}`);

const errorAlert = (e: Error) => Alert.alert('Error', e.message);

/* ───────────── Edit & approve ───────────── */

function EditSheet({ item, onClose }: { item: QueueItem | null; onClose: () => void }) {
  const tree = useFolderTree();
  const moderate = useModerateDocument();
  const [title, setTitle] = useState('');
  const [titleEdited, setTitleEdited] = useState(false);
  const [subjectId, setSubjectId] = useState('');
  const [type, setType] = useState<DocType>('course');
  const [number, setNumber] = useState('');
  const [year, setYear] = useState('none');
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  if (item && loadedFor !== item.id) {
    setLoadedFor(item.id);
    setTitle(item.title);
    setTitleEdited(false);
    setSubjectId(item.subject_id);
    setType(item.type);
    setNumber(item.number != null ? String(item.number) : '');
    setYear(item.academic_year ?? 'none');
  }

  const levelId = item?.subject?.period.level.id;
  const subjects = useMemo(() => {
    const level = tree.data?.find((l) => l.id === levelId);
    return (level?.periods ?? []).flatMap((p) => p.subjects.map((s) => ({ value: s.id, label: `${p.name} · ${s.name}`, name: s.name })));
  }, [tree.data, levelId]);
  const subjectName = subjects.find((s) => s.value === subjectId)?.name ?? item?.subject?.name;
  const n = number.trim() ? Number(number) : null;
  const autoTitle = previewTitle(type, n, subjectName, year === 'none' ? null : year);
  const shownTitle = titleEdited ? title : autoTitle;

  if (!item) return null;
  const save = () => {
    const metaChanged = subjectId !== item.subject_id || type !== item.type || n !== item.number || (year === 'none' ? null : year) !== item.academic_year;
    moderate.mutate(
      {
        kind: 'approve',
        id: item.id,
        edits: {
          title: titleEdited ? title.trim() : metaChanged ? autoTitle : undefined,
          subject_id: subjectId !== item.subject_id ? subjectId : undefined,
          type: type !== item.type ? type : undefined,
          number: n !== item.number ? n : undefined,
          academic_year: (year === 'none' ? null : year) !== item.academic_year ? (year === 'none' ? null : year) : undefined,
        },
      },
      { onSuccess: onClose, onError: errorAlert },
    );
  };

  return (
    <Sheet visible title="Edit & approve" onClose={onClose} footer={<Button title="Approve" variant="gradient" icon="check" loading={moderate.isPending} onPress={save} />}>
      <Field
        label="Title"
        value={shownTitle}
        onChangeText={(t) => {
          setTitleEdited(true);
          setTitle(t);
        }}
      />
      {titleEdited ? (
        <Txt size={12} weight={700} color={colors.royal} onPress={() => setTitleEdited(false)}>
          Use the automatic title
        </Txt>
      ) : (
        <Txt size={12} color={colors.muted}>
          Built automatically from the fields below. Type to change it.
        </Txt>
      )}
      <Txt size={13} weight={700}>
        Subject
      </Txt>
      {tree.isLoading ? <Loading /> : <ChipRow wrap options={subjects} value={subjectId} onChange={setSubjectId} />}
      <Txt size={13} weight={700}>
        Type
      </Txt>
      <ChipRow wrap options={DOC_TYPES.map((t) => ({ value: t, label: DOC_TYPE_LABEL[t] }))} value={type} onChange={setType} />
      <Field label="Number" keyboardType="number-pad" value={number} onChangeText={(t) => setNumber(t.replace(/[^0-9]/g, '').slice(0, 3))} placeholder="none" />
      <Txt size={13} weight={700}>
        Academic year
      </Txt>
      <ChipRow
        wrap
        activeColor={colors.violet}
        options={[...new Set([...(item.academic_year ? [item.academic_year] : []), ...YEARS])].map((y) => ({ value: y, label: y })).concat({ value: 'none', label: 'No year' })}
        value={year}
        onChange={setYear}
      />
    </Sheet>
  );
}

/* ───────────── Reject ───────────── */

function RejectSheet({ item, onClose }: { item: QueueItem | null; onClose: () => void }) {
  const moderate = useModerateDocument();
  const [reason, setReason] = useState<RejectReason>('unreadable');
  const [note, setNote] = useState('');
  if (!item) return null;
  return (
    <Sheet
      visible
      title={`Reject “${item.title}”`}
      onClose={onClose}
      footer={
        <Button
          title="Reject"
          variant="primary"
          loading={moderate.isPending}
          onPress={() =>
            moderate.mutate(
              { kind: 'reject', id: item.id, reason, note: note.trim() || undefined },
              {
                onSuccess: () => {
                  setNote('');
                  onClose();
                },
                onError: errorAlert,
              },
            )
          }
        />
      }
    >
      <Txt size={13} weight={700}>
        Reason (sent to the student)
      </Txt>
      <ChipRow wrap options={REJECT} value={reason} onChange={setReason} activeColor={colors.danger} />
      <Field label="Note (optional)" placeholder="e.g. Pages 3–5 are missing" value={note} onChangeText={setNote} multiline maxLength={500} />
    </Sheet>
  );
}

/* ───────────── Mark duplicate ───────────── */

function DuplicateSheet({ item, onClose }: { item: QueueItem | null; onClose: () => void }) {
  const moderate = useModerateDocument();
  const [q, setQ] = useState('');
  const query = useDebounced(q, 300);
  const results = useDocumentSearch(query || (item?.subject?.name ?? ''), 'all', item?.subject_id ?? '');
  if (!item) return null;
  const pick = (id: string, title: string) =>
    Alert.alert('Mark as duplicate?', `“${item.title}” will be rejected as a duplicate of “${title}”.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark duplicate',
        style: 'destructive',
        onPress: () => moderate.mutate({ kind: 'mark-duplicate', id: item.id, duplicateOf: id }, { onSuccess: onClose, onError: errorAlert }),
      },
    ]);
  const list = (results.data ?? []).filter((d) => d.id !== item.id);
  return (
    <Sheet visible title="Duplicate of…" onClose={onClose}>
      <SearchBar value={q} onChangeText={setQ} placeholder="Search the published document" />
      <Txt size={12} color={colors.muted}>
        Showing published documents of {item.subject?.name}.
      </Txt>
      {results.isLoading ? (
        <Loading />
      ) : list.length ? (
        list.map((d) => (
          <Pressable key={d.id} accessibilityRole="button" onPress={() => pick(d.id, d.title)} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12 }, pressed && { backgroundColor: colors.bg }]}>
            <FileIcon ext={d.file_ext} size={22} />
            <View style={{ flex: 1 }}>
              <Txt size={13} weight={700} numberOfLines={2}>
                {d.title}
              </Txt>
              <Txt size={11} color={colors.muted}>
                {fileSize(d.size_bytes)} · {timeAgo(d.created_at)}
              </Txt>
            </View>
          </Pressable>
        ))
      ) : (
        <EmptyState icon="search" title="No match" body="Try another keyword." />
      )}
    </Sheet>
  );
}

/* ───────────── Queue ───────────── */

function QueueCard({ item, onEdit, onReject, onDuplicate }: { item: QueueItem; onEdit: () => void; onReject: () => void; onDuplicate: () => void }) {
  const moderate = useModerateDocument();
  const s = item.subject;
  return (
    <Card style={{ gap: 12 }}>
      <Pressable accessibilityRole="button" onPress={() => router.push(`/documents/file/${item.id}`)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        {item.source === 'drive_folder' ? <Icon name="folder" size={30} color={colors.royal} /> : <FileIcon ext={item.file_ext} size={30} />}
        <View style={{ flex: 1, gap: 3 }}>
          <Txt size={15} weight={800} numberOfLines={2}>
            {item.title}
          </Txt>
          <Txt size={12} color={colors.muted} numberOfLines={1}>
            {s ? `${s.period.level.short_name} › ${s.period.name} › ${s.name}` : ''}
          </Txt>
        </View>
        <Txt size={12} weight={700} color={colors.royal}>
          Preview
        </Txt>
      </Pressable>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        <Badge label={SOURCE_LABEL[item.source]} tone={item.source === 'upload' ? 'navy' : 'success'} />
        <Badge label={`${DOC_TYPE_LABEL[item.type]}${item.number != null ? ` ${item.number}` : ''}`} tone="violet" />
        {item.academic_year ? <Badge label={item.academic_year} tone="neutral" /> : null}
        {item.size_bytes ? <Badge label={fileSize(item.size_bytes)} tone="neutral" /> : null}
        {item.previous_version_id ? <Badge label={`New version (v${item.version})`} tone="violet" /> : null}
        {item.correction_of_id ? <Badge label="Linked to an exam" tone="neutral" /> : null}
      </Row>
      {item.uploader ? (
        <Row gap={10} style={{ backgroundColor: colors.bg, borderRadius: 14, padding: 10 }}>
          <Avatar name={item.uploader.full_name} size={34} />
          <View style={{ flex: 1 }}>
            <Txt size={13} weight={700} numberOfLines={1}>
              {item.uploader.full_name}
              {item.uploader.trusted ? ' · ✓ Verified' : ''}
            </Txt>
            <Txt size={11} color={colors.muted} numberOfLines={1}>
              {item.uploader.email} · {item.uploader.approved_count} approved · {item.uploader.rejected_count} rejected
            </Txt>
          </View>
          <Txt size={11} color={colors.muted}>
            {timeAgo(item.created_at)}
          </Txt>
        </Row>
      ) : null}
      <Row gap={8}>
        <Button
          title="Approve"
          small
          icon="check"
          style={{ flex: 1 }}
          loading={moderate.isPending}
          onPress={() => moderate.mutate({ kind: 'approve', id: item.id }, { onError: errorAlert })}
        />
        <Button title="Edit & approve" small variant="outline" style={{ flex: 1 }} onPress={onEdit} />
      </Row>
      <Row gap={8}>
        <Button title="Reject" small variant="ghost" style={{ flex: 1 }} onPress={onReject} />
        <Button title="Duplicate" small variant="ghost" style={{ flex: 1 }} onPress={onDuplicate} />
      </Row>
    </Card>
  );
}

export function QueueTab() {
  const [level, setLevel] = useState('');
  const levels = useLevels();
  const queue = useModQueue(level);
  const [editing, setEditing] = useState<QueueItem | null>(null);
  const [rejecting, setRejecting] = useState<QueueItem | null>(null);
  const [duplicating, setDuplicating] = useState<QueueItem | null>(null);

  return (
    <>
      <ChipRow
        variant="outline"
        activeColor={colors.violet}
        options={[{ value: '', label: 'All my levels' }, ...(levels.data ?? []).map((l) => ({ value: String(l.id), label: l.short_name }))]}
        value={level}
        onChange={setLevel}
      />
      <ErrorNote error={queue.error} />
      {queue.isLoading ? (
        <Loading />
      ) : !queue.data?.length ? (
        <EmptyState icon="check" title="All caught up 🎉" body="No document is waiting for review. Oldest ones appear first." />
      ) : (
        <>
          <Txt size={12} color={colors.muted}>
            {queue.data.length} waiting · oldest first
          </Txt>
          {queue.data.map((item) => (
            <QueueCard key={item.id} item={item} onEdit={() => setEditing(item)} onReject={() => setRejecting(item)} onDuplicate={() => setDuplicating(item)} />
          ))}
        </>
      )}
      <EditSheet item={editing} onClose={() => setEditing(null)} />
      <RejectSheet item={rejecting} onClose={() => setRejecting(null)} />
      <DuplicateSheet item={duplicating} onClose={() => setDuplicating(null)} />
    </>
  );
}
