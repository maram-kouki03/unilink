import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ChipRow, EmptyState, Header, Screen } from '@/components/ui';
import { useRole } from '@/components/docs';
import { useModStats } from '@/api/documents';
import { QueueTab } from '@/components/mod/QueueTab';
import { ReportsTab } from '@/components/mod/ReportsTab';
import { UsersTab } from '@/components/mod/UsersTab';
import { StatsTab } from '@/components/mod/StatsTab';
import { StructureTab } from '@/components/mod/StructureTab';

type Tab = 'queue' | 'reports' | 'users' | 'stats' | 'structure';

/** Moderation: moderators see their levels, the admin sees everything (+ Structure). */
export default function Moderation() {
  const { tab: raw } = useLocalSearchParams<{ tab: string }>();
  const { isStaff, isAdmin } = useRole();
  const stats = useModStats(isStaff);
  const qc = useQueryClient();
  const tabs: { value: Tab; label: string }[] = [
    { value: 'queue', label: `Queue${stats.data?.pending ? ` · ${stats.data.pending}` : ''}` },
    { value: 'reports', label: `Reports${stats.data?.open_reports ? ` · ${stats.data.open_reports}` : ''}` },
    { value: 'users', label: 'Users' },
    { value: 'stats', label: 'Stats' },
    ...(isAdmin ? [{ value: 'structure' as Tab, label: 'Structure' }] : []),
  ];
  const tab: Tab = tabs.some((t) => t.value === raw) ? (raw as Tab) : 'queue';

  if (!isStaff) {
    return (
      <Screen>
        <Header title="Moderation" />
        <EmptyState icon="shield" title="Moderators only" body="This area is for moderators and admins." />
      </Screen>
    );
  }

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['modQueue'] });
    qc.invalidateQueries({ queryKey: ['modReports'] });
    qc.invalidateQueries({ queryKey: ['modUsers'] });
    qc.invalidateQueries({ queryKey: ['modStats'] });
    qc.invalidateQueries({ queryKey: ['folderTree'] });
    qc.invalidateQueries({ queryKey: ['periods'] });
    qc.invalidateQueries({ queryKey: ['subjects'] });
    qc.invalidateQueries({ queryKey: ['tracks'] });
  };

  return (
    <Screen refreshing={false} onRefresh={refresh}>
      <Header title="Moderation" subtitle={isAdmin ? 'Admin · every level' : 'Moderator · your levels'} />
      <ChipRow options={tabs} value={tab} onChange={(t) => router.setParams({ tab: t })} />
      {tab === 'queue' ? <QueueTab /> : null}
      {tab === 'reports' ? <ReportsTab /> : null}
      {tab === 'users' ? <UsersTab /> : null}
      {tab === 'stats' ? <StatsTab /> : null}
      {tab === 'structure' && isAdmin ? <StructureTab /> : null}
    </Screen>
  );
}
