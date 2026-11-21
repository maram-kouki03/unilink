import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { FileIcon } from '@/components/Illustrations';
import { Button, Card, ErrorNote, Field, Header, Loading, Row, Screen, SegmentedTabs, Txt } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { useDocument, useNewVersion } from '@/api/documents';
import { ApiError } from '@/lib/api';
import { fileSize } from '@/lib/format';
import { extOf } from '@/lib/storage';
import { colors } from '@/theme';

const MAX_MB = 10;

/** New version of one of my documents: same subject/type/number/year, the old one is replaced once approved. */
export default function NewVersion() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const doc = useDocument(id);
  const newVersion = useNewVersion();
  const [mode, setMode] = useState<'file' | 'drive'>('file');
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [url, setUrl] = useState('');

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (res.canceled) return;
    const f = res.assets[0];
    if ((f.size ?? 0) > MAX_MB * 1024 * 1024) {
      Alert.alert('File too large', `Files can be up to ${MAX_MB} MB. Put it on Google Drive and use a Drive link instead.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Use a Drive link', onPress: () => setMode('drive') },
      ]);
      return;
    }
    setFile(f);
  };

  const submit = () => {
    if (mode === 'file' && !file) return Alert.alert('Choose a file first');
    if (mode === 'drive' && !/drive\.google\.com|docs\.google\.com/.test(url)) return Alert.alert('Paste a Google Drive file link');
    newVersion.mutate(
      mode === 'file' ? { id, file: { uri: file!.uri, name: file!.name, size: file!.size, mimeType: file!.mimeType } } : { id, url },
      {
        onSuccess: (d) => {
          Alert.alert(
            d.status === 'approved' ? 'New version published 🎉' : 'Sent for review ⏳',
            d.status === 'approved' ? 'It replaces the previous version.' : 'The current version stays visible until a moderator approves the new one.',
          );
          router.replace(`/documents/file/${d.id}`);
        },
        onError: (e) => {
          const dup = e instanceof ApiError && e.status === 409 ? (e.data.duplicateOf as string | undefined) : undefined;
          if (dup)
            Alert.alert('This file already exists', e.message, [
              { text: 'OK', style: 'cancel' },
              { text: 'Open it', onPress: () => router.push(`/documents/file/${dup}`) },
            ]);
        },
      },
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen footer={<Button title="Upload the new version" variant="gradient" arrow loading={newVersion.isPending} onPress={submit} />}>
        <Header title="New version" subtitle={doc.data?.title} />
        {doc.isLoading ? <Loading /> : null}
        <ErrorNote error={doc.error} />
        {doc.data ? (
          <Card style={{ backgroundColor: colors.tile, gap: 4 }}>
            <Txt size={13} weight={700}>
              Current: version {doc.data.version}
            </Txt>
            <Txt size={12} color={colors.muted}>
              The subject, type, number and year stay the same. Students see the newest approved version only.
            </Txt>
          </Card>
        ) : null}
        <SegmentedTabs
          options={[
            { value: 'file', label: '📄 File' },
            { value: 'drive', label: '🔗 Drive link' },
          ]}
          value={mode}
          onChange={setMode}
        />
        {mode === 'file' ? (
          <Pressable accessibilityRole="button" onPress={pick} style={{ borderRadius: 20, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.dashed, padding: 18, alignItems: 'center', gap: 8, backgroundColor: colors.card }}>
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
                  Choose the new file
                </Txt>
                <Txt size={12} color={colors.muted}>
                  max {MAX_MB} MB
                </Txt>
              </>
            )}
          </Pressable>
        ) : (
          <Field label="Google Drive file link" placeholder="https://drive.google.com/file/d/…" autoCapitalize="none" autoCorrect={false} keyboardType="url" value={url} onChangeText={setUrl} icon="drive" />
        )}
        <ErrorNote error={newVersion.error && !(newVersion.error instanceof ApiError && newVersion.error.status === 409) ? newVersion.error : null} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
