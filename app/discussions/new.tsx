import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, ChipRow, ErrorNote, Field, Header, Screen, SegmentedTabs, Txt } from '@/components/ui';
import { useCreatePost } from '@/api/social';
import { useAuth } from '@/providers/AuthProvider';
import { colors } from '@/theme';
import { LEVEL_CODES, LEVEL_SHORT, LevelCode } from '@/types/db';

const TOPICS = ['Exams', 'Courses', 'Study group', 'Clubs', 'Hackathon', 'Internships', 'Campus life', 'Announcement'];

export default function NewPost() {
  const params = useLocalSearchParams<{ scope?: 'general' | 'level'; level?: LevelCode }>();
  const { profile } = useAuth();
  const create = useCreatePost();
  const [scope, setScope] = useState<'general' | 'level'>(params.scope ?? 'general');
  const [level, setLevel] = useState<LevelCode>(params.level ?? profile?.level ?? '1A');
  const [topic, setTopic] = useState('Exams');
  const [body, setBody] = useState('');

  const submit = () =>
    create.mutate(
      { scope, level_code: scope === 'level' ? level : null, topic, body: body.trim() },
      { onSuccess: (p) => router.replace(`/discussions/${p.id}`) },
    );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen footer={<Button title="Publish" variant="violet" icon="send" disabled={body.trim().length < 3} loading={create.isPending} onPress={submit} />}>
        <Header title="New post" />
        <SegmentedTabs
          options={[
            { value: 'general', label: 'Whole campus' },
            { value: 'level', label: 'My level' },
          ]}
          value={scope}
          onChange={setScope}
        />
        {scope === 'level' ? (
          <ChipRow options={LEVEL_CODES.map((c) => ({ value: c, label: LEVEL_SHORT[c] }))} value={level} onChange={setLevel} activeColor={colors.violet} variant="outline" />
        ) : null}
        <View style={{ gap: 8 }}>
          <Txt size={13} weight={700}>
            Topic
          </Txt>
          <ChipRow wrap options={TOPICS.map((t) => ({ value: t, label: t }))} value={topic} onChange={setTopic} />
        </View>
        <Field label="Your question or message" placeholder="Ask your promo anything…" value={body} onChangeText={setBody} multiline maxLength={2000} />
        <Txt size={12} color={colors.muted}>
          Be kind and helpful. Posts are visible to SUP'COM students only.
        </Txt>
        <ErrorNote error={create.error} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
