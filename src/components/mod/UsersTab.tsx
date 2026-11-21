import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { Sheet, useRole } from '@/components/docs';
import { Avatar, Badge, Button, Card, ChipRow, EmptyState, ErrorNote, Field, Loading, Row, SearchBar, Txt } from '@/components/ui';
import { ModUser, useLevels, useModerateUser, useModUsers, UserAction } from '@/api/documents';
import { useAuth } from '@/providers/AuthProvider';
import { useDebounced } from '@/lib/useDebounced';
import { colors } from '@/theme';

const errorAlert = (e: Error) => Alert.alert('Error', e.message);

/** Admin: choose which levels a moderator handles. */
function PromoteSheet({ user, onClose }: { user: ModUser | null; onClose: () => void }) {
  const levels = useLevels();
  const moderate = useModerateUser();
  const [picked, setPicked] = useState<number[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (user && loadedFor !== user.id) {
    setLoadedFor(user.id);
    setPicked(user.moderated_level_ids);
  }
  if (!user) return null;
  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <Sheet
      visible
      title={user.role === 'moderator' ? `Levels of ${user.full_name}` : `Make ${user.full_name} moderator`}
      onClose={onClose}
      footer={
        <Button
          title={user.role === 'moderator' ? 'Save levels' : 'Make moderator'}
          variant="gradient"
          loading={moderate.isPending}
          onPress={() => {
            if (!picked.length) return Alert.alert('Pick at least one level');
            moderate.mutate({ kind: 'promote-moderator', id: user.id, levelIds: picked }, { onSuccess: onClose, onError: errorAlert });
          }}
        />
      }
    >
      <Txt size={13} color={colors.muted}>
        The moderator reviews documents and reports of these levels only.
      </Txt>
      {levels.isLoading ? (
        <Loading />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(levels.data ?? []).map((l) => {
            const on = picked.includes(l.id);
            return (
              <Button key={l.id} title={`${on ? '✓ ' : ''}${l.short_name}`} small variant={on ? 'primary' : 'outline'} onPress={() => toggle(l.id)} />
            );
          })}
        </View>
      )}
    </Sheet>
  );
}

function SuspendSheet({ user, onClose }: { user: ModUser | null; onClose: () => void }) {
  const moderate = useModerateUser();
  const [reason, setReason] = useState('');
  if (!user) return null;
  return (
    <Sheet
      visible
      title={`Suspend ${user.full_name}?`}
      onClose={onClose}
      footer={
        <Button
          title="Suspend"
          loading={moderate.isPending}
          onPress={() => moderate.mutate({ kind: 'suspend', id: user.id, reason: reason.trim() || undefined }, { onSuccess: onClose, onError: errorAlert })}
        />
      }
    >
      <Txt size={13} color={colors.muted}>
        They are signed out and can no longer use Unilink until you unsuspend them.
      </Txt>
      <Field label="Reason (optional)" value={reason} onChangeText={setReason} multiline maxLength={300} />
    </Sheet>
  );
}

function UserCard({ u, onPromote, onSuspend }: { u: ModUser; onPromote: () => void; onSuspend: () => void }) {
  const { isAdmin } = useRole();
  const { profile } = useAuth();
  const moderate = useModerateUser();
  const me = profile?.id === u.id;
  const run = (a: UserAction) => moderate.mutate(a, { onError: errorAlert });
  return (
    <Card style={{ gap: 10 }}>
      <Row gap={10}>
        <Avatar name={u.full_name} size={42} dark={u.role !== 'student'} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt size={14} weight={800} numberOfLines={1}>
            {u.full_name}
            {me ? ' (you)' : ''}
          </Txt>
          <Txt size={11} color={colors.muted} numberOfLines={1}>
            {u.email}
            {u.level ? ` · ${u.level}` : ''}
          </Txt>
        </View>
      </Row>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        {u.role !== 'student' ? <Badge label={u.role === 'admin' ? 'Admin' : 'Moderator'} tone="navy" /> : null}
        {u.trusted ? <Badge label="✓ Verified" tone="success" /> : null}
        {u.suspended ? <Badge label="Suspended" tone="danger" /> : null}
        <Badge label={`${u.approved_count} approved`} tone="neutral" />
        {u.pending_count ? <Badge label={`${u.pending_count} pending`} tone="violet" /> : null}
        {u.rejected_count ? <Badge label={`${u.rejected_count} rejected`} tone="neutral" /> : null}
      </Row>
      {me || u.role === 'admin' ? null : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {u.trusted ? (
            <Button title="Untrust" small variant="outline" loading={moderate.isPending} onPress={() => run({ kind: 'untrust', id: u.id })} />
          ) : (
            <Button title="Trust" small variant="outline" loading={moderate.isPending} onPress={() => run({ kind: 'trust', id: u.id })} />
          )}
          {isAdmin ? (
            <>
              <Button title={u.role === 'moderator' ? 'Edit levels' : 'Make moderator'} small variant="violet" onPress={onPromote} />
              {u.role === 'moderator' ? (
                <Button
                  title="Remove moderator"
                  small
                  variant="ghost"
                  onPress={() =>
                    Alert.alert('Remove moderator?', u.full_name, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => run({ kind: 'demote', id: u.id }) },
                    ])
                  }
                />
              ) : null}
              {u.suspended ? (
                <Button title="Unsuspend" small variant="ghost" onPress={() => run({ kind: 'unsuspend', id: u.id })} />
              ) : (
                <Button title="Suspend" small variant="ghost" onPress={onSuspend} />
              )}
            </>
          ) : null}
        </View>
      )}
      {u.trusted_locked ? (
        <Txt size={11} color={colors.muted}>
          Trust set by hand (not changed automatically).
        </Txt>
      ) : null}
    </Card>
  );
}

export function UsersTab() {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'staff' | 'trusted' | 'suspended'>('all');
  const query = useDebounced(q, 300);
  const users = useModUsers(query);
  const [promoting, setPromoting] = useState<ModUser | null>(null);
  const [suspending, setSuspending] = useState<ModUser | null>(null);
  const list = (users.data ?? []).filter((u) =>
    filter === 'staff' ? u.role !== 'student' : filter === 'trusted' ? u.trusted : filter === 'suspended' ? u.suspended : true,
  );
  return (
    <>
      <SearchBar value={q} onChangeText={setQ} placeholder="Search by name or e-mail" />
      <ChipRow
        variant="outline"
        activeColor={colors.violet}
        options={[
          { value: 'all', label: 'All' },
          { value: 'staff', label: 'Staff' },
          { value: 'trusted', label: 'Verified' },
          { value: 'suspended', label: 'Suspended' },
        ]}
        value={filter}
        onChange={setFilter}
      />
      <ErrorNote error={users.error} />
      {users.isLoading ? (
        <Loading />
      ) : !list.length ? (
        <EmptyState icon="user" title="No user found" body="Try another name or e-mail." />
      ) : (
        list.map((u) => <UserCard key={u.id} u={u} onPromote={() => setPromoting(u)} onSuspend={() => setSuspending(u)} />)
      )}
      <PromoteSheet user={promoting} onClose={() => setPromoting(null)} />
      <SuspendSheet user={suspending} onClose={() => setSuspending(null)} />
    </>
  );
}
