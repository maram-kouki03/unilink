import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, formFile, saveToken } from '@/lib/api';
import { closeSocket, connectSocket } from '@/lib/socket';
import { AdminReport, Profile, ReportTargetType } from '@/types/db';

/* ───────────── Profile picture ───────────── */

/** Upload a new profile picture (JPG/PNG/WEBP, 5 MB). Returns the updated profile. */
export function useUploadAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { uri: string; mimeType?: string | null }) => {
      const ext = (p.uri.split('?')[0].split('.').pop() ?? '').toLowerCase();
      const kind = ext === 'png' ? 'png' : ext === 'webp' ? 'webp' : 'jpg';
      const form = new FormData();
      form.append('avatar', formFile(p.uri, `avatar.${kind}`, p.mimeType || (kind === 'jpg' ? 'image/jpeg' : `image/${kind}`)));
      return api<Profile>('/me', { method: 'PATCH', body: form });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profileStats'] }),
  });
}

export function useRemoveAvatar() {
  return useMutation({
    mutationFn: () => api<Profile>('/me', { method: 'PATCH', body: { removeAvatar: true } }),
  });
}

/* ───────────── Password / sessions / account ───────────── */

/** Other devices are signed out; this one keeps working with the new token. */
export function useChangePassword() {
  return useMutation({
    mutationFn: async (p: { currentPassword: string; newPassword: string }) => {
      const { token } = await api<{ ok: true; token: string }>('/me/change-password', { body: p });
      await saveToken(token);
      // The server closed the live connection: reopen it with the new token.
      closeSocket();
      connectSocket(token);
    },
  });
}

/** Signs out every device, this one included: call signOut() afterwards. */
export async function logoutEverywhere() {
  await api('/auth/logout-all', { method: 'POST' });
}

/** Deletes the account and all its data. Call signOut() afterwards. */
export async function deleteAccount(password: string) {
  await api('/me', { method: 'DELETE', body: { password } });
}

/* ───────────── Push notifications (Expo) ───────────── */

export async function registerPushToken(token: string, platform: 'ios' | 'android' | 'web') {
  await api('/me/push-token', { body: { token, platform } });
}

export async function unregisterPushToken(token: string) {
  await api('/me/push-token', { method: 'DELETE', body: { token } });
}

/* ───────────── Reports ───────────── */

export async function report(targetType: ReportTargetType, targetId: string, reason: string) {
  await api('/reports', { body: { targetType, targetId, reason } });
}

/* ───────────── Admin ───────────── */

export function useAdminReports(status: 'open' | 'dismissed' | 'resolved' | 'all' = 'open') {
  return useQuery({
    queryKey: ['adminReports', status],
    queryFn: () => api<AdminReport[]>('/admin/reports', { query: { status } }),
  });
}

export function useResolveReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { id: string; action: 'dismiss' | 'delete_content' | 'ban_user'; reason?: string }) =>
      api(`/admin/reports/${p.id}/resolve`, { body: { action: p.action, reason: p.reason ?? null } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['adminReports'] }),
  });
}

export async function banUser(userId: string, reason?: string) {
  await api(`/admin/users/${userId}/ban`, { body: { reason: reason ?? null } });
}

export async function unbanUser(userId: string) {
  await api(`/admin/users/${userId}/unban`, { method: 'POST' });
}
