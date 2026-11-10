import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { FileIcon } from '@/components/Illustrations';
import { Button, ChipRow, ErrorNote, Field, Header, Loading, Row, Screen, Txt } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { useFolderTree, useUploadDocument } from '@/api/documents';
import { useAuth } from '@/providers/AuthProvider';
import { fileSize } from '@/lib/format';
import { extOf } from '@/lib/storage';
import { colors, shadows } from '@/theme';
import { DocType } from '@/types/db';

const TYPES: { value: DocType; label: string }[] = [
  { value: 'exam', label: 'Exam' },
  { value: 'course', label: 'Course' },
  { value: 'summary', label: 'Summary' },
  { value: 'td_tp', label: 'TD/TP' },
];

const thisYear = new Date().getMonth() >= 8 ? new Date().getFullYear() : new Date().getFullYear() - 1;
const YEARS = [0, 1, 2, 3].map((i) => `${thisYear - i}-${thisYear - i + 1}`);

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

export default function Upload() {
  const params = useLocalSearchParams<{ levelId?: string; periodId?: string; subjectId?: string }>();
  const { profile } = useAuth();
  const tree = useFolderTree();
  const upload = useUploadDocument();

  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [levelId, setLevelId] = useState<string>(params.levelId ?? '');
  const [periodId, setPeriodId] = useState<string>(params.periodId ?? '');
  const [subjectId, setSubjectId] = useState<string>(params.subjectId ?? '');
  const [type, setType] = useState<DocType>('exam');
  const [year, setYear] = useState(YEARS[0]);
  const [title, setTitle] = useState('');
  const [driveUrl, setDriveUrl] = useState('');

  // Default to the student's own level
  useEffect(() => {
    if (!levelId && tree.data && profile?.level) {
      const l = tree.data.find((x) => x.code === profile.level);
      if (l) setLevelId(String(l.id));
    }
  }, [tree.data, profile?.level, levelId]);

  const level = useMemo(() => tree.data?.find((l) => String(l.id) === levelId), [tree.data, levelId]);
  const periods = useMemo(() => [...(level?.periods ?? [])].sort((a, b) => a.sort - b.sort), [level]);
  const period = periods.find((p) => p.id === periodId);
  const subjects = period?.subjects ?? [];
  const subject = subjects.find((s) => s.id === subjectId);

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
    if ((f.size ?? 0) > 50 * 1024 * 1024) return Alert.alert('File too large', 'Maximum size is 50 MB.');
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
  };

  const submit = () => {
    if (!file) return Alert.alert('Choose a file first');
    if (!subjectId) return Alert.alert('Choose level, period and subject');
    if (title.trim().length < 3) return Alert.alert('Add a clear title');
    upload.mutate(
      { subjectId, title, docType: type, academicYear: type === 'summary' ? '' : year, file: { uri: file.uri, name: file.name, size: file.size, mimeType: file.mimeType }, driveUrl },
      {
        onSuccess: () => {
          Alert.alert('Published 🎉', 'Thanks for sharing with your promo!');
          router.replace(`/documents/subject/${subjectId}`);
        },
      },
    );
  };

  if (tree.isLoading) return <Screen><Header title="Upload a document" /><Loading /></Screen>;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen footer={<Button title="Publish document" variant="gradient" arrow loading={upload.isPending} onPress={submit} />}>
        <Header title="Upload a document" />

        <Pressable accessibilityRole="button" onPress={pick} style={[{ backgroundColor: colors.card, borderRadius: 20, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }, shadows.card, !file && { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.dashed }]}>
          {file ? (
            <>
              <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: '#FDECEC', alignItems: 'center', justifyContent: 'center' }}>
                <FileIcon ext={extOf(file.name)} size={24} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt size={14} weight={700} numberOfLines={1}>
                  {file.name}
                </Txt>
                <Txt size={12} color={colors.muted}>
                  {fileSize(file.size)} · tap to change
                </Txt>
                {upload.isPending ? (
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.tile, marginTop: 6, overflow: 'hidden' }}>
                    <View style={{ width: '60%', height: '100%', backgroundColor: colors.violet }} />
                  </View>
                ) : null}
              </View>
            </>
          ) : (
            <>
              <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.tile, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="upload" size={24} color={colors.royal} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt size={14} weight={700} color={colors.royal}>
                  Choose a file
                </Txt>
                <Txt size={12} color={colors.muted}>
                  PDF, Word, PowerPoint or image · max 50 MB
                </Txt>
              </View>
            </>
          )}
        </Pressable>

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
            <Step n={2} title="Period" />
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
            <ChipRow wrap options={subjects.map((s) => ({ value: s.id, label: s.name }))} value={subjectId} onChange={setSubjectId} />
          </View>
        ) : null}

        <View style={{ gap: 10 }}>
          <Step n={4} title="Type" />
          <ChipRow wrap options={TYPES} value={type} onChange={setType} />
        </View>

        {type !== 'summary' ? (
          <View style={{ gap: 10 }}>
            <Txt size={13} weight={700}>
              Academic year
            </Txt>
            <ChipRow wrap options={YEARS.map((y) => ({ value: y, label: y }))} value={year} onChange={setYear} activeColor={colors.violet} />
          </View>
        ) : null}

        <Field label="Title" placeholder="e.g. Examen Réseaux – Session principale" value={title} onChangeText={setTitle} />
        <Field label="Google Drive link (optional)" placeholder="https://drive.google.com/…" autoCapitalize="none" value={driveUrl} onChangeText={setDriveUrl} />

        {subject ? (
          <Row gap={10} style={{ backgroundColor: colors.tile, borderRadius: 16, padding: 12, alignItems: 'flex-start' }}>
            <Icon name="info" size={18} color={colors.royal} />
            <Txt size={12} color={colors.navy} style={{ flex: 1, lineHeight: 18 }}>
              Saved to Documents › {level?.short_name} › {period?.name} › {subject.name}
            </Txt>
          </Row>
        ) : null}
        <ErrorNote error={upload.error} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
