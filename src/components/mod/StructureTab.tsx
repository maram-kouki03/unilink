import React, { useState } from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';
import { Sheet } from '@/components/docs';
import { Badge, Button, Card, ChipRow, EmptyState, ErrorNote, Field, Loading, Row, Txt } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { StructureKind, TreePeriod, TreeSubject, useDeleteStructure, useDriveSync, useFolderTree, useSaveStructure } from '@/api/documents';
import { timeAgo } from '@/lib/format';
import { colors, folderPalette } from '@/theme';

type Level = NonNullable<ReturnType<typeof useFolderTree>['data']>[number];

/** What the edit sheet is editing: kind, id (none = create) and the starting values. */
type Editing = { kind: StructureKind; id?: string | number; title: string; values: Record<string, string> };

const FIELDS: Record<StructureKind, { key: string; label: string; placeholder?: string; numeric?: boolean }[]> = {
  levels: [
    { key: 'code', label: 'Code', placeholder: 'e.g. ING1' },
    { key: 'name', label: 'Name', placeholder: 'e.g. Engineering — 1st year' },
    { key: 'short_name', label: 'Short name', placeholder: 'e.g. ING 1' },
    { key: 'sort', label: 'Order', numeric: true },
  ],
  periods: [
    { key: 'name', label: 'Short name', placeholder: 'e.g. S1 or P1' },
    { key: 'label', label: 'Label', placeholder: 'e.g. Semester 1' },
    { key: 'months', label: 'Months (text)', placeholder: 'e.g. Sept – Jan' },
    { key: 'start_month', label: 'Start month (1–12)', numeric: true },
    { key: 'end_month', label: 'End month (1–12)', numeric: true },
    { key: 'sort', label: 'Order', numeric: true },
  ],
  tracks: [
    { key: 'name', label: 'Name', placeholder: 'e.g. Data Science' },
    { key: 'code', label: 'Code (optional)', placeholder: 'e.g. DS' },
    { key: 'sort', label: 'Order', numeric: true },
  ],
  subjects: [
    { key: 'name', label: 'Name', placeholder: 'e.g. Signal processing' },
    { key: 'code', label: 'Code (optional)', placeholder: 'e.g. TS101' },
    { key: 'color', label: 'Color (optional)', placeholder: '#3D3FD9' },
    { key: 'drive_folder_id', label: 'Google Drive folder link (optional)', placeholder: 'https://drive.google.com/drive/folders/…' },
  ],
};

const KIND_LABEL: Record<StructureKind, string> = { levels: 'level', periods: 'semester', tracks: 'option', subjects: 'subject' };

const str = (v: unknown) => (v == null ? '' : String(v));
const errorAlert = (e: Error) => Alert.alert('Error', e.message);

function EditSheet({ editing, extra, onClose }: { editing: Editing | null; extra?: Record<string, unknown>; onClose: () => void }) {
  const save = useSaveStructure();
  const [values, setValues] = useState<Record<string, string>>({});
  const [trackId, setTrackId] = useState('');
  const [loadedFor, setLoadedFor] = useState<Editing | null>(null);
  if (editing && loadedFor !== editing) {
    setLoadedFor(editing);
    setValues(editing.values);
    setTrackId(editing.values.track_id ?? '');
  }
  if (!editing) return null;
  const tracks = (extra?.tracks as Level['tracks'] | undefined) ?? [];

  const submit = () => {
    const body: Record<string, unknown> = { ...((extra?.parent as Record<string, unknown>) ?? {}) };
    for (const f of FIELDS[editing.kind]) {
      const v = (values[f.key] ?? '').trim();
      if (f.numeric) body[f.key] = v === '' ? (f.key === 'sort' ? undefined : null) : Number(v);
      else if (v === '' && editing.id == null) continue;
      else body[f.key] = v === '' ? null : v;
    }
    if (editing.kind === 'subjects') body.track_id = trackId || null;
    save.mutate({ kind: editing.kind, id: editing.id, body }, { onSuccess: onClose, onError: errorAlert });
  };

  return (
    <Sheet visible title={editing.title} onClose={onClose} footer={<Button title={editing.id == null ? 'Create' : 'Save'} variant="gradient" loading={save.isPending} onPress={submit} />}>
      {FIELDS[editing.kind].map((f) => (
        <Field
          key={f.key}
          label={f.label}
          placeholder={f.placeholder}
          value={values[f.key] ?? ''}
          autoCapitalize={f.key === 'code' ? 'characters' : f.key === 'drive_folder_id' || f.key === 'color' ? 'none' : 'sentences'}
          keyboardType={f.numeric ? 'number-pad' : f.key === 'drive_folder_id' ? 'url' : 'default'}
          onChangeText={(t) => setValues((s) => ({ ...s, [f.key]: f.numeric ? t.replace(/[^0-9]/g, '') : t }))}
        />
      ))}
      {editing.kind === 'subjects' && tracks.length ? (
        <>
          <Txt size={13} weight={700}>
            Option
          </Txt>
          <ChipRow wrap options={[{ value: '', label: 'Common (all options)' }, ...tracks.map((t) => ({ value: t.id, label: t.name }))]} value={trackId} onChange={setTrackId} />
        </>
      ) : null}
      {editing.kind === 'subjects' ? (
        <Txt size={12} color={colors.muted}>
          With a Drive folder, its files are imported and kept in sync automatically. Clear the link to unlink.
        </Txt>
      ) : null}
    </Sheet>
  );
}

function SmallLink({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Txt size={12} weight={700} color={danger ? colors.dangerText : colors.royal} onPress={onPress} suppressHighlighting>
      {label}
    </Txt>
  );
}

export function StructureTab() {
  const tree = useFolderTree();
  const del = useDeleteStructure();
  const save = useSaveStructure();
  const sync = useDriveSync();
  const [levelId, setLevelId] = useState<number | null>(null);
  const [openPeriod, setOpenPeriod] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [extra, setExtra] = useState<Record<string, unknown> | undefined>();

  if (tree.isLoading) return <Loading />;
  const levels = tree.data ?? [];
  const level = levels.find((l) => l.id === levelId) ?? levels[0];

  const edit = (e: Editing, x?: Record<string, unknown>) => {
    setExtra(x);
    setEditing(e);
  };
  const remove = (kind: StructureKind, id: string | number, name: string) =>
    Alert.alert(`Delete ${KIND_LABEL[kind]} “${name}”?`, 'Only possible when it has no documents.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => del.mutate({ kind, id }, { onError: errorAlert }) },
    ]);

  const syncSubject = (s: TreeSubject) =>
    sync.mutate(s.id, {
      onSuccess: (r) =>
        'added' in r
          ? Alert.alert('Drive synced', `${r.added} added · ${r.updated} updated · ${r.hidden} hidden${r.errors.length ? `\n\n${r.errors.join('\n')}` : ''}`)
          : Alert.alert('Sync started'),
      onError: errorAlert,
    });
  const unlink = (s: TreeSubject) =>
    Alert.alert('Unlink the Drive folder?', 'Documents already imported stay in the library.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unlink', style: 'destructive', onPress: () => save.mutate({ kind: 'subjects', id: s.id, body: { drive_folder_id: null } }, { onError: errorAlert }) },
    ]);

  const subjectValues = (s: TreeSubject) => ({
    name: s.name,
    code: str(s.code),
    color: str(s.color),
    drive_folder_id: s.drive_folder_id ? `https://drive.google.com/drive/folders/${s.drive_folder_id}` : '',
    track_id: str(s.track_id),
  });
  const periodValues = (p: TreePeriod) => ({
    name: p.name,
    label: p.label,
    months: str(p.months),
    start_month: str(p.start_month),
    end_month: str(p.end_month),
    sort: str(p.sort),
  });

  return (
    <>
      <ErrorNote error={tree.error} />
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt size={13} weight={800}>
          Levels
        </Txt>
        <SmallLink label="+ Add level" onPress={() => edit({ kind: 'levels', title: 'New level', values: { sort: String(levels.length + 1) } })} />
      </Row>
      {levels.length ? (
        <ChipRow
          options={levels.map((l) => ({ value: String(l.id), label: l.short_name }))}
          value={String(level?.id ?? '')}
          onChange={(v) => {
            setLevelId(Number(v));
            setOpenPeriod(null);
          }}
        />
      ) : (
        <EmptyState icon="grid" title="No level yet" body="Start by adding a level (e.g. ING 1)." />
      )}

      {level ? (
        <>
          <Card style={{ gap: 6 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Txt size={15} weight={800}>
                  {level.name}
                </Txt>
                <Txt size={12} color={colors.muted}>
                  Code {level.code} · {level.periods.length} semesters · {level.tracks.length} options
                </Txt>
              </View>
              <Row gap={14}>
                <SmallLink
                  label="Edit"
                  onPress={() => edit({ kind: 'levels', id: level.id, title: 'Edit level', values: { code: level.code, name: level.name, short_name: level.short_name, sort: str(level.sort) } })}
                />
                <SmallLink label="Delete" danger onPress={() => remove('levels', level.id, level.short_name)} />
              </Row>
            </Row>
          </Card>

          {/* Options (tracks) */}
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt size={13} weight={800}>
              Options
            </Txt>
            <SmallLink label="+ Add option" onPress={() => edit({ kind: 'tracks', title: `New option in ${level.short_name}`, values: {} }, { parent: { level_id: level.id } })} />
          </Row>
          {level.tracks.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {level.tracks.map((t) => (
                <Pressable
                  key={t.id}
                  accessibilityRole="button"
                  onPress={() => edit({ kind: 'tracks', id: t.id, title: 'Edit option', values: { name: t.name, code: str(t.code), sort: str(t.sort) } })}
                  onLongPress={() => remove('tracks', t.id, t.name)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border }}
                >
                  <Txt size={13} weight={700}>
                    {t.name}
                    {t.code ? ` · ${t.code}` : ''}
                  </Txt>
                  <Icon name="edit" size={13} color={colors.muted} />
                </Pressable>
              ))}
            </View>
          ) : (
            <Txt size={12} color={colors.muted}>
              No option: every subject is common to the level.
            </Txt>
          )}
          {level.tracks.length ? (
            <Txt size={11} color={colors.muted}>
              Tap an option to edit it, long-press to delete it.
            </Txt>
          ) : null}

          {/* Semesters and subjects */}
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt size={13} weight={800}>
              Semesters & subjects
            </Txt>
            <SmallLink
              label="+ Add semester"
              onPress={() => edit({ kind: 'periods', title: `New semester in ${level.short_name}`, values: { sort: String(level.periods.length + 1) } }, { parent: { level_id: level.id } })}
            />
          </Row>
          {!level.periods.length ? <EmptyState icon="calendar" title="No semester yet" body="Add the semesters of this level, then their subjects." /> : null}
          {level.periods.map((p) => {
            const expanded = openPeriod === p.id;
            return (
              <Card key={p.id} style={{ gap: 10 }}>
                <Pressable accessibilityRole="button" onPress={() => setOpenPeriod(expanded ? null : p.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Txt size={14} weight={800}>
                      {p.name} · {p.label}
                    </Txt>
                    <Txt size={12} color={colors.muted}>
                      {[p.months, `${p.subjects.length} subjects`].filter(Boolean).join(' · ')}
                    </Txt>
                  </View>
                  <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={18} color={colors.iconMuted} />
                </Pressable>
                {expanded ? (
                  <>
                    <Row gap={14}>
                      <SmallLink label="Edit semester" onPress={() => edit({ kind: 'periods', id: p.id, title: 'Edit semester', values: periodValues(p) }, { parent: { level_id: level.id } })} />
                      <SmallLink label="Delete" danger onPress={() => remove('periods', p.id, p.name)} />
                      <View style={{ flex: 1 }} />
                      <SmallLink
                        label="+ Subject"
                        onPress={() => edit({ kind: 'subjects', title: `New subject in ${p.name}`, values: {} }, { parent: { period_id: p.id }, tracks: level.tracks })}
                      />
                    </Row>
                    {p.subjects.map((s, i) => {
                      const track = level.tracks.find((t) => t.id === s.track_id);
                      return (
                        <View key={s.id} style={{ gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.divider }}>
                          <Row gap={10}>
                            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: s.color ?? folderPalette[i % folderPalette.length] }} />
                            <Txt size={14} weight={700} style={{ flex: 1 }} numberOfLines={1}>
                              {s.name}
                              {s.code ? ` · ${s.code}` : ''}
                            </Txt>
                            {track ? <Badge label={track.name} tone="violet" /> : null}
                          </Row>
                          {s.drive_folder_id ? (
                            <Row gap={8} style={{ flexWrap: 'wrap' }}>
                              <Badge label="Drive linked" tone="success" />
                              <Txt size={11} color={colors.muted}>
                                {s.drive_synced_at ? `synced ${timeAgo(s.drive_synced_at)}` : 'not synced yet'}
                              </Txt>
                            </Row>
                          ) : null}
                          <Row gap={14} style={{ flexWrap: 'wrap' }}>
                            <SmallLink
                              label="Edit"
                              onPress={() => edit({ kind: 'subjects', id: s.id, title: 'Edit subject', values: subjectValues(s) }, { parent: {}, tracks: level.tracks })}
                            />
                            {s.drive_folder_id ? (
                              <>
                                <SmallLink label={sync.isPending && sync.variables === s.id ? 'Syncing…' : 'Sync now'} onPress={() => syncSubject(s)} />
                                <SmallLink label="Open folder" onPress={() => Linking.openURL(`https://drive.google.com/drive/folders/${s.drive_folder_id}`)} />
                                <SmallLink label="Unlink" danger onPress={() => unlink(s)} />
                              </>
                            ) : (
                              <SmallLink
                                label="Link Drive folder"
                                onPress={() => edit({ kind: 'subjects', id: s.id, title: `Link a Drive folder to ${s.name}`, values: subjectValues(s) }, { parent: {}, tracks: level.tracks })}
                              />
                            )}
                            <SmallLink label="Delete" danger onPress={() => remove('subjects', s.id, s.name)} />
                          </Row>
                        </View>
                      );
                    })}
                    {!p.subjects.length ? (
                      <Txt size={12} color={colors.muted}>
                        No subject yet.
                      </Txt>
                    ) : null}
                  </>
                ) : null}
              </Card>
            );
          })}
          <Button title="Sync every linked Drive folder" icon="drive" variant="outline" loading={sync.isPending && sync.variables === undefined} onPress={() => sync.mutate(undefined, { onSuccess: () => Alert.alert('Sync started', 'Every linked folder is being synced.'), onError: errorAlert })} />
        </>
      ) : null}
      <EditSheet editing={editing} extra={extra} onClose={() => setEditing(null)} />
    </>
  );
}
