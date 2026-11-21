import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Avatar, Badge, Card, EmptyState, ErrorNote, Loading, Row, SectionTitle, Txt } from '@/components/ui';
import { useModStats } from '@/api/documents';
import { colors } from '@/theme';

function Stat({ value, label, onPress, tone }: { value: number; label: string; onPress?: () => void; tone?: string }) {
  return (
    <Card onPress={onPress} style={{ flex: 1, minWidth: '45%', gap: 4 }}>
      <Txt size={26} weight={800} color={tone ?? colors.navy}>
        {value}
      </Txt>
      <Txt size={12} color={colors.muted}>
        {label}
      </Txt>
    </Card>
  );
}

export function StatsTab() {
  const stats = useModStats();
  if (stats.isLoading) return <Loading />;
  if (!stats.data) return <ErrorNote error={stats.error ?? 'No stats'} />;
  const s = stats.data;
  return (
    <>
      <ErrorNote error={stats.error} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Stat value={s.pending} label="Waiting for review" tone={s.pending ? colors.violet : undefined} onPress={() => router.setParams({ tab: 'queue' })} />
        <Stat value={s.approved_this_week} label="Approved this week" tone={colors.success} />
        <Stat value={s.open_reports} label="Open reports" tone={s.open_reports ? colors.dangerText : undefined} onPress={() => router.setParams({ tab: 'reports' })} />
        <Stat value={s.hidden} label="Hidden documents" />
      </View>

      <SectionTitle title="Top contributors" />
      {s.top_contributors.length ? (
        <Card style={{ padding: 6 }}>
          {s.top_contributors.map((p, i) => (
            <Row key={p.id} gap={10} style={{ padding: 8, borderBottomWidth: i === s.top_contributors.length - 1 ? 0 : 1, borderBottomColor: colors.divider }}>
              <Txt size={13} weight={800} color={colors.muted} style={{ width: 20 }}>
                {i + 1}
              </Txt>
              <Avatar name={p.full_name} size={32} />
              <View style={{ flex: 1 }}>
                <Txt size={13} weight={700} numberOfLines={1}>
                  {p.full_name}
                </Txt>
                {p.level ? (
                  <Txt size={11} color={colors.muted}>
                    {p.level}
                  </Txt>
                ) : null}
              </View>
              {p.trusted ? <Badge label="✓" tone="success" /> : null}
              <Txt size={13} weight={800} color={colors.navy}>
                {p.approved_count}
              </Txt>
            </Row>
          ))}
        </Card>
      ) : (
        <EmptyState icon="user" title="No contributions yet" />
      )}

      <SectionTitle title={`Subjects without documents · ${s.empty_subjects.length}`} />
      {s.empty_subjects.length ? (
        <Card style={{ padding: 6 }}>
          {s.empty_subjects.map((x, i) => (
            <Row
              key={x.id}
              gap={10}
              style={{ padding: 8, borderBottomWidth: i === s.empty_subjects.length - 1 ? 0 : 1, borderBottomColor: colors.divider }}
            >
              <View style={{ flex: 1 }}>
                <Txt size={13} weight={700} numberOfLines={1} onPress={() => router.push(`/documents/subject/${x.id}`)}>
                  {x.name}
                  {x.code ? ` · ${x.code}` : ''}
                </Txt>
                <Txt size={11} color={colors.muted}>
                  {x.level} › {x.period}
                </Txt>
              </View>
            </Row>
          ))}
        </Card>
      ) : (
        <EmptyState icon="check" title="Every subject has documents 🎉" />
      )}
    </>
  );
}
