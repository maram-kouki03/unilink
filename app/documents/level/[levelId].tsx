import React from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Breadcrumbs } from '@/components/cards';
import { Badge, Button, Card, EmptyState, ErrorNote, Header, Loading, Row, Screen, SectionTitle, Txt } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { useLevel, usePeriods } from '@/api/documents';
import { useAuth } from '@/providers/AuthProvider';
import { colors } from '@/theme';

export default function LevelScreen() {
  const { levelId } = useLocalSearchParams<{ levelId: string }>();
  const id = Number(levelId);
  const level = useLevel(id);
  const periods = usePeriods(id);
  const { profile } = useAuth();

  return (
    <Screen refreshing={periods.isRefetching} onRefresh={() => periods.refetch()}>
      <Header title={level.data?.name ?? 'Level'} />
      <Breadcrumbs items={[{ label: 'Documents', href: '/documents' }, { label: level.data?.short_name ?? '…' }]} />
      <SectionTitle title="Periods" />
      <ErrorNote error={periods.error} />
      {periods.isLoading ? (
        <Loading />
      ) : !periods.data?.length ? (
        <EmptyState title="No periods yet" body="An admin needs to create the folders for this level." />
      ) : (
        <View style={{ gap: 10 }}>
          {periods.data.map((p) => {
            const current = profile?.period === p.name && level.data?.code === profile?.level;
            if (p.files === 0)
              return (
                <View key={p.id} style={{ minHeight: 68, borderRadius: 18, borderWidth: 2, borderStyle: 'dashed', borderColor: '#C9CBEA', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Pressable onPress={() => router.push(`/documents/period/${p.id}`)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' }}>
                      <Txt size={14} weight={800} color={colors.muted}>
                        {p.name}
                      </Txt>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Txt size={15} weight={700}>
                        {p.label} · empty
                      </Txt>
                      <Txt size={12} color={colors.muted}>
                        No files yet. Be the first to share!
                      </Txt>
                    </View>
                  </Pressable>
                  <Button title="Upload" small onPress={() => router.push({ pathname: '/documents/upload', params: { levelId: String(id), periodId: p.id } })} />
                </View>
              );
            return (
              <Card key={p.id} onPress={() => router.push(`/documents/period/${p.id}`)} style={[{ flexDirection: 'row', alignItems: 'center', gap: 12 }, current && { borderWidth: 2, borderColor: colors.royal }]}>
                <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: current ? colors.navy : colors.tileAlt, alignItems: 'center', justifyContent: 'center' }}>
                  <Txt size={14} weight={800} color={current ? colors.white : colors.royal}>
                    {p.name}
                  </Txt>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Row gap={8}>
                    <Txt size={15} weight={700}>
                      {p.label}
                    </Txt>
                    {current ? <Badge label="CURRENT" /> : null}
                  </Row>
                  <Txt size={12} color={colors.muted}>
                    {[p.months, `${p.subjects} subjects`].filter(Boolean).join(' · ')}
                  </Txt>
                </View>
                <Txt size={12} weight={700} color={colors.muted}>
                  {p.files} files
                </Txt>
                <Icon name="chevronRight" size={18} color={colors.iconMuted} />
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
