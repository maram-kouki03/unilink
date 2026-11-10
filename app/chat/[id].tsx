import React, { useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header, Loading, Txt } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { useConversations, useMessages, useSendMessage } from '@/api/social';
import { useAuth } from '@/providers/AuthProvider';
import { hhmm } from '@/lib/format';
import { colors, fonts, gradients } from '@/theme';

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const conv = useConversations();
  const msgs = useMessages(id);
  const send = useSendMessage(id);
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const list = useRef<FlatList>(null);
  const c = conv.data?.find((x) => x.id === id);

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    send.mutate(body);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
          <Header title={c?.other_name ?? 'Chat'} subtitle={c?.context ?? undefined} />
        </View>
        {msgs.isLoading ? (
          <Loading />
        ) : (
          <FlatList
            ref={list}
            data={msgs.data ?? []}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: 20, gap: 8 }}
            onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
            renderItem={({ item }) => {
              const mine = item.sender_id === session?.user.id;
              return (
                <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                  <Txt size={14} color={mine ? colors.white : colors.text} style={{ lineHeight: 20 }}>
                    {item.body}
                  </Txt>
                  <Txt size={10} color={mine ? '#C9CBF5' : colors.muted} style={{ alignSelf: 'flex-end' }}>
                    {hhmm(item.created_at)}
                  </Txt>
                </View>
              );
            }}
          />
        )}
        <View style={[styles.composer, { paddingBottom: insets.bottom + 12 }]}>
          <TextInput value={text} onChangeText={setText} placeholder="Write a message…" placeholderTextColor={colors.placeholder} accessibilityLabel="Write a message" multiline style={styles.input} />
          <Pressable accessibilityRole="button" accessibilityLabel="Send" onPress={submit} style={styles.send}>
            <LinearGradient colors={gradients.violet} style={StyleSheet.absoluteFill} />
            <Icon name="send" size={20} color={colors.white} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '78%', paddingHorizontal: 14, paddingVertical: 10, gap: 2 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.navy, borderTopLeftRadius: 18, borderTopRightRadius: 4, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.card, borderTopLeftRadius: 4, borderTopRightRadius: 18, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  composer: { flexDirection: 'row', gap: 10, alignItems: 'flex-end', paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  input: {
    flex: 1,
    minHeight: 50,
    maxHeight: 120,
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
    fontFamily: fonts[500],
    fontSize: 14,
    color: colors.text,
  },
  send: { width: 50, height: 50, borderRadius: 25, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
