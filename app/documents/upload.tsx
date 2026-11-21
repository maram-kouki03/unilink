import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { FileIcon } from '@/components/Illustrations';
import { Button, Card, ChipRow, ErrorNote, Field, Header, Loading, Row, Screen, SegmentedTabs, Txt } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { AddMode, previewTitle, useRole } from '@/components/docs';
import { useAddDriveFile, useAddDriveFolder, useDocuments, useFolderTree, useUploadDocument } from '@/api/documents';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { fileSize } from '@/lib/format';
import { extOf } from '@/lib/storage';
import { colors, shadows } from '@/theme';
import { currentAcademicYear, DOC_TYPE_LABEL, DOC_TYPES, DocType, DocumentRow } from '@/types/db';

const MAX_MB = 10;
const thisYear = Number(currentAcademicYear().slice(0, 4));
const YEARS = [0, 1, 2, 3, 4, 5].map((i) => `${thisYear - i}/${String((thisYear - i + 1) % 100).padStart(2, '0')}`);

const MODES: { value: AddMode; label: string }[] = [
  { value: 'file', label: '📄 File' },
  { value: 'drive_file', label: '🔗 Drive file' },
  { value: 'drive_folder', label: '📁 Folder' },
];

function Step({ n, title }: { n: number; title: string }) {
  return (
    <Row gap={8}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' }}>
        <Txt size={11} weight={800} color={colors.white}>
          {n}
        </Txt>
      </View>
      <Txt size={13} weight={800}>
        {title}
      </Txt>
    </Row>
  );
}

export default function AddDocument() {
  const params = useLocalSearchParams<{ mode?: string; levelId?: string; periodId?: string; subjectId?: string; correctionOf?: string }>();
  const { profile } = useAuth();
  const { isStaff, trusted } = useRole();
  const tree = useFolderTree();
  const uploadFile = useUploadDocument();
  const addDriveFile = useAddDriveFile();
  const addDriveFolder = useAddDriveFolder();

  const [mode, setMode] = useState<AddMode>((['file', 'drive_file', 'drive_folder'] as string[]).includes(params.mode ?? '') ? (params.mode as AddMode) : 'file');
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [url, setUrl] = useState('');
  const [levelId, setLevelId] = useState(params.levelId ?? '');
  const [periodId, setPeriodId] = useState(params.periodId ?? '');
  const [subjectId, setSubjectId] = useState(params.subjectId ?? '');
  const [type, setType] = useState<DocType>(params.correctionOf ? 'correction' : 'course');
  const [number, setNumber] = useState('');
  const [year, setYear] = useState<string>(YEARS[0]);
  const [correctionOf, setCorrectionOf] = useState(params.correctionOf ?? '');

  // Prefill level/period from the subject, else my own level.
  useEffect(() => {
    if (!tree.data) return;
    if (subjectId && (!levelId || !periodId)) {
      for (const l of tree.data)
        for (const p of l.periods)
          if (p.subjects.some((s) => s.id === subjectId)) {
            setLevelId(String(l.id));
            setPeriodId(p.id);
            return;
          }
    }
    if (!levelId && profile?.level) {
      const l = tree.data.find((x) => x.code === profile.level);
      if (l) setLevelId(String(l.id));
    }
  }, [tree.data, subjectId, levelId, periodId, profile?.level]);

  const level = useMemo(() => tree.data?.find((l) => String(l.id) === levelId), [tree.data, levelId]);
  const periods = useMemo(() => [...(level?.periods ?? [])].sort((a, b) => a.sort - b.sort), [level]);
  const period = periods.find((p) => p.id === periodId);
  const subjects = period?.subjects ?? [];
  const subject = subjects.find((s) => s.id === subjectId);

  // Exams of this subject, for "Correction of".
  const exams = useDocuments(type === 'correction' && subjectId ? subjectId : '', 'exam', '', 'recent');
  const examOptions = (type === 'correction' && subjectId ? exams.data ?? [] : []).filter((d) => d.status === 'approved' || d.mine);

  const n = number.trim() ? Number(number.trim()) : null;
  const numberValid = n === null || (Number.isInteger(n) && n >= 0 && n <= 999);
  const title = previewTitle(type, numberValid ? n : null, subject?.name, year === 'none' ? null : year);
  const busy = uploadFile.isPending || addDriveFile.isPending || addDriveFolder.isPending;
  const error = mode === 'file' ? uploadFile.error : mode === 'drive_file' ? addDriveFile.error : addDriveFolder.error;
  const autoPublish = isStaff || trusted;

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'image/*',
      ],
      copyToCacheDirectory: true,
    });
    if (res.canceled) return;
    const f = res.assets[0];
    if ((f.size ?? 0) > MAX_MB * 1024 * 1024) {
      Alert.alert(
        'File too large',
        `This file is ${fileSize(f.size)}. Files can be up to ${MAX_MB} MB.\n\nPut it on Google Drive, share it as “Anyone with the link” and add the link instead.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Use a Drive link', onPress: () => setMode('drive_file') },
        ],
      );
      return;
    }
    setFile(f);
    // Guess the type and number from the file name.
    const name = f.name.toLowerCase();
    const m = /\b(td|tp)\s*[-_]?\s*(\d{1,3})\b/.exec(name);
    if (m) {
      setType(m[1] as DocType);
      setNumber(m[2]);
    } else if (/corrig|correction/.test(name)) setType('correction');
    else if (/exam|ds\b|devoir/.test(name)) setType('exam');
  };

  const onDone = (doc: DocumentRow) => {
    const published = doc.status === 'approved';
    Alert.alert(
      published ? 'Published 🎉' : 'Sent for review ⏳',
      published
        ? mode === 'drive_folder'
          ? 'The folder is published. Its files are being imported, they appear in a minute.'
          : 'Thanks for sharing with your promo!'
        : 'A moderator will check it soon. You will get a notification. Track it in My contributions.',
    );
    router.replace(`/documents/subject/${doc.subject_id}`);
  };

  const onFail = (e: Error) => {
    const dup = e instanceof ApiError && e.status === 409 ? (e.data.duplicateOf as string | undefined) : undefined;
    if (dup) {
      Alert.alert('This file already exists', e.message, [
        { text: 'OK', style: 'cancel' },
        { text: 'Open it', onPress: () => router.push(`/documents/file/${dup}`) },
      ]);
    }
  };

  const submit = () => {
    if (!subjectId) return Alert.alert('Choose the level, semester and subject');
    if (!numberValid) return Alert.alert('The number must be between 0 and 999');
    const fields = {
      subjectId,
      type,
      number: n,
      academicYear: year === 'none' ? null : year,
      correctionOfId: type === 'correction' && correctionOf ? correctionOf : null,
    };
    const handlers = { onSuccess: onDone, onError: onFail };
    if (mode === 'file') {
      if (!file) return Alert.alert('Choose a file first');
      uploadFile.mutate({ ...fields, file: { uri: file.uri, name: file.name, size: file.size, mimeType: file.mimeType } }, handlers);
    } else {
      if (!/drive\.google\.com|docs\.google\.com/.test(url)) return Alert.alert('Paste a Google Drive link', 'It starts with https://drive.google.com/…');
      if (mode === 'drive_file') addDriveFile.mutate({ ...fields, url }, handlers);
      else {
        const { correctionOfId: _ignored, ...folderFields } = fields;
        addDriveFolder.mutate({ ...folderFields, url }, handlers);
      }
    }
  };

  if (tree.isLoading) {
    return (
      <Screen>
        <Header title="Add a document" />
        <Loading />
      </Screen>
    );
  }

  const types = mode === 'drive_folder' ? DOC_TYPES.filter((t) => t !== 'correction') : DOC_TYPES;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen footer={<Button title={autoPublish ? 'Publish' : 'Send for review'} variant="gradient" arrow loading={busy} onPress={submit} />}>
        <Header title="Add a document" />
        <ErrorNote error={tree.error} />
        <SegmentedTabs options={MODES} value={mode} onChange={setMode} />

        {mode === 'file' ? (
          <Pressable accessibilityRole="button" onPress={pick} style={[{ borderRadius: 20, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.dashed, padding: 18, alignItems: 'center', gap: 8, backgroundColor: colors.card }, shadows.soft]}>
            {file ? (
              <Row gap={12}>
                <FileIcon ext={extOf(file.name)} size={30} />
                <View style={{ flex: 1 }}>
                  <Txt size={14} weight={700} numberOfLines={1}>
                    {file.name}
                  </Txt>
                  <Txt size={12} color={colors.muted}>
                    {fileSize(file.size)} · tap to change
                  </Txt>
                </View>
              </Row>
            ) : (
              <>
                <Icon name="upload" size={28} color={colors.royal} />
                <Txt size={14} weight={700}>
                  Choose a file
                </Txt>
                <Txt size={12} color={colors.muted}>
                  PDF, Word, PowerPoint, Excel or image · max {MAX_MB} MB
                </Txt>
              </>
            )}
          </Pressable>
        ) : (
          <View style={{ gap: 8 }}>
            <Field
              label={mode === 'drive_file' ? 'Google Drive file link' : 'Google Drive folder link'}
              placeholder={mode === 'drive_file' ? 'https://drive.google.com/file/d/…' : 'https://drive.google.com/drive/folders/…'}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              value={url}
              onChangeText={setUrl}
              icon="drive"
            />
            <Row gap={8} style={{ alignItems: 'flex-start' }}>
              <Icon name="info" size={16} color={colors.royal} />
              <Txt size={12} color={colors.muted} style={{ flex: 1, lineHeight: 17 }}>
                In Drive: Share › General access › “Anyone with the link”.
                {mode === 'drive_folder' ? ' Once approved, every file in the folder (and sub-folders) is added and kept in sync.' : ''}
              </Txt>
            </Row>
          </View>
        )}

        <View style={{ gap: 10 }}>
          <Step n={1} title="Level" />
          <ChipRow
            wrap
            options={(tree.data ?? []).map((l) => ({ value: String(l.id), label: l.short_name }))}
            value={levelId}
            onChange={(v) => {
              setLevelId(v);
              setPeriodId('');
              setSubjectId('');
            }}
          />
        </View>
        {level ? (
          <View style={{ gap: 10 }}>
            <Step n={2} title="Semester" />
            <ChipRow
              wrap
              options={periods.map((p) => ({ value: p.id, label: p.name }))}
              value={periodId}
              onChange={(v) => {
                setPeriodId(v);
                setSubjectId('');
              }}
            />
          </View>
        ) : null}
        {period ? (
          <View style={{ gap: 10 }}>
            <Step n={3} title="Subject" />
            {subjects.length ? (
              <ChipRow
                wrap
                options={subjects.map((s) => ({ value: s.id, label: s.code ? `${s.name} (${s.code})` : s.name }))}
                value={subjectId}
                onChange={(v) => {
                  setSubjectId(v);
                  setCorrectionOf('');
                }}
              />
            ) : (
              <Txt size={12} color={colors.muted}>
                No subject in this semester yet.
              </Txt>
            )}
          </View>
        ) : null}

        <View style={{ gap: 10 }}>
          <Step n={4} title="Type" />
          <ChipRow wrap options={types.map((t) => ({ value: t, label: DOC_TYPE_LABEL[t] }))} value={type} onChange={setType} />
        </View>
        <Field
          label="Number (optional)"
          placeholder={type === 'td' || type === 'tp' ? 'e.g. 3 for TD3' : 'e.g. 2 for chapter 2'}
          keyboardType="number-pad"
          value={number}
          onChangeText={(t) => setNumber(t.replace(/[^0-9]/g, '').slice(0, 3))}
        />
        <View style={{ gap: 10 }}>
          <Txt size={13} weight={700}>
            Academic year
          </Txt>
          <ChipRow wrap options={[...YEARS.map((y) => ({ value: y, label: y })), { value: 'none', label: 'No year' }]} value={year} onChange={setYear} activeColor={colors.violet} />
        </View>

        {type === 'correction' && mode !== 'drive_folder' ? (
          <View style={{ gap: 10 }}>
            <Txt size={13} weight={700}>
              Correction of (optional)
            </Txt>
            {!subjectId ? (
              <Txt size={12} color={colors.muted}>
                Choose the subject first.
              </Txt>
            ) : exams.isLoading ? (
              <Loading />
            ) : examOptions.length ? (
              <Card style={{ padding: 6, gap: 2 }}>
                {[{ id: '', title: 'Not linked to an exam' }, ...examOptions].map((e) => {
                  const active = correctionOf === e.id;
                  return (
                    <Pressable
                      key={e.id || 'none'}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      onPress={() => setCorrectionOf(e.id)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, backgroundColor: active ? colors.tile : 'transparent' }}
                    >
                      <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.royal, alignItems: 'center', justifyContent: 'center' }}>
                        {active ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.royal }} /> : null}
                      </View>
                      <Txt size={13} weight={active ? 700 : 500} style={{ flex: 1 }} numberOfLines={2}>
                        {e.title}
                      </Txt>
                    </Pressable>
                  );
                })}
              </Card>
            ) : (
              <Txt size={12} color={colors.muted}>
                No exam in this subject yet.
              </Txt>
            )}
          </View>
        ) : null}

        <Card style={{ gap: 6, backgroundColor: colors.tile }}>
          <Txt size={11} weight={700} color={colors.muted}>
            TITLE PREVIEW
          </Txt>
          <Txt size={16} weight={800} color={colors.navy}>
            {subject ? title : 'Choose a subject…'}
          </Txt>
          <Txt size={12} color={colors.muted}>
            {autoPublish ? 'You are a verified contributor: it is published right away.' : 'A moderator checks it before it is published.'}
          </Txt>
        </Card>
        <ErrorNote error={error && !(error instanceof ApiError && error.status === 409) ? error : null} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
