import React, { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Avatar, Badge, Row, Txt } from '@/components/ui';
import { Icon, IconName } from '@/components/Icon';
import { TopContributor } from '@/api/documents';
import { useAuth } from '@/providers/AuthProvider';
import { colors, shadows } from '@/theme';
import { DocType, DOC_TYPE_LABEL, REPORT_REASON_LABEL, ReportReason } from '@/types/db';

/* ───────────── Role ───────────── */

export function useRole() {
  const { profile } = useAuth();
  const role = profile?.role ?? 'student';
  return { role, isStaff: role === 'moderator' || role === 'admin', isAdmin: role === 'admin', trusted: !!profile?.trusted };
}

/* ───────────── Bottom sheet with any content ───────────── */

export function Sheet({ visible, title, onClose, children, footer }: { visible: boolean; title?: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable accessibilityLabel="Close" style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          {title ? (
            <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <Txt size={17} weight={800} style={{ flex: 1 }} numberOfLines={2}>
                {title}
              </Txt>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={10}>
                <Icon name="close" size={20} color={colors.muted} />
              </Pressable>
            </Row>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 8 }} style={{ maxHeight: 520 }}>
            {children}
          </ScrollView>
          {footer ? <View style={{ paddingTop: 10 }}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** One tappable line in a sheet. */
export function SheetOption({ icon, emoji, title, body, onPress, danger }: { icon?: IconName; emoji?: string; title: string; body?: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.bg }]}>
      <View style={styles.optionIcon}>
        {emoji ? <Txt size={20}>{emoji}</Txt> : icon ? <Icon name={icon} size={20} color={danger ? colors.dangerText : colors.navy} /> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt size={15} weight={700} color={danger ? colors.dangerText : colors.text}>
          {title}
        </Txt>
        {body ? (
          <Txt size={12} color={colors.muted} style={{ lineHeight: 17 }}>
            {body}
          </Txt>
        ) : null}
      </View>
      <Icon name="chevronRight" size={16} color={colors.iconMuted} />
    </Pressable>
  );
}

/* ───────────── "+ Add" sheet ───────────── */

export type AddMode = 'file' | 'drive_file' | 'drive_folder';

/** Opens the contribution form with the subject prefilled. */
export function openAddForm(mode: AddMode, params: { levelId?: string | number; periodId?: string; subjectId?: string; correctionOf?: string } = {}) {
  router.push({
    pathname: '/documents/upload',
    params: {
      mode,
      levelId: params.levelId != null ? String(params.levelId) : '',
      periodId: params.periodId ?? '',
      subjectId: params.subjectId ?? '',
      correctionOf: params.correctionOf ?? '',
    },
  });
}

export function AddDocumentSheet({
  visible,
  onClose,
  levelId,
  periodId,
  subjectId,
}: {
  visible: boolean;
  onClose: () => void;
  levelId?: string | number;
  periodId?: string;
  subjectId?: string;
}) {
  const go = (mode: AddMode) => {
    onClose();
    openAddForm(mode, { levelId, periodId, subjectId });
  };
  return (
    <Sheet visible={visible} title="Add a document" onClose={onClose}>
      <SheetOption emoji="📄" title="Upload a file" body="PDF, Word, PowerPoint, Excel or image · max 10 MB" onPress={() => go('file')} />
      <SheetOption emoji="🔗" title="Google Drive file link" body="A file shared as “Anyone with the link”" onPress={() => go('drive_file')} />
      <SheetOption emoji="📁" title="Google Drive folder link" body="Every file inside is imported once a moderator approves it" onPress={() => go('drive_folder')} />
    </Sheet>
  );
}

/* ───────────── Report reasons ───────────── */

const REPORT_HELP: Record<ReportReason, string> = {
  wrong_file: 'The file does not match the title',
  unreadable: 'Blurry, broken or empty',
  wrong_subject: 'It belongs to another subject or level',
  copyrighted: 'Should not be shared publicly',
  duplicate: 'The same document is already here',
  other: 'Something else',
};

export function ReportSheet({ visible, title, onClose, onPick }: { visible: boolean; title?: string; onClose: () => void; onPick: (reason: ReportReason) => void }) {
  return (
    <Sheet visible={visible} title={title ? `Report “${title}”` : 'Report this document'} onClose={onClose}>
      <Txt size={13} color={colors.muted}>
        Moderators will review it. After 5 reports a document is hidden automatically.
      </Txt>
      {(Object.keys(REPORT_REASON_LABEL) as ReportReason[]).map((r) => (
        <SheetOption
          key={r}
          icon="flag"
          title={REPORT_REASON_LABEL[r]}
          body={REPORT_HELP[r]}
          onPress={() => {
            onClose();
            onPick(r);
          }}
        />
      ))}
    </Sheet>
  );
}

/* ───────────── Top contributors ───────────── */

export function ContributorsStrip({ people }: { people: TopContributor[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }}>
      {people.map((p, i) => (
        <View key={p.id} style={[styles.person, shadows.soft]}>
          <View>
            <Avatar name={p.full_name} size={46} dark={i === 0} />
            {i < 3 ? (
              <View style={styles.rank}>
                <Txt size={10} weight={800} color={colors.white}>
                  {i + 1}
                </Txt>
              </View>
            ) : null}
          </View>
          <Txt size={12} weight={700} numberOfLines={1} style={{ maxWidth: 92, textAlign: 'center' }}>
            {p.full_name}
          </Txt>
          <Txt size={11} color={colors.muted}>
            {p.approved_count} docs{p.useful_total ? ` · 👍 ${p.useful_total}` : ''}
          </Txt>
          {p.trusted || p.role !== 'student' ? <Badge label="✓ Verified" tone="navy" /> : null}
        </View>
      ))}
    </ScrollView>
  );
}

/* ───────────── Titles (same rule as the server) ───────────── */

/** Words used in auto-built titles (French, as on the server). */
const TITLE_LABEL: Record<DocType, string> = { course: 'Cours', td: 'TD', tp: 'TP', exam: 'Examen', correction: 'Corrigé', other: 'Document' };

export function previewTitle(type: DocType, number: number | null, subjectName: string | undefined, year: string | null) {
  const label = TITLE_LABEL[type];
  const head = number == null ? label : type === 'td' || type === 'tp' ? `${label}${number}` : `${label} ${number}`;
  return [head, subjectName, year].filter(Boolean).join(' – ');
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(18,21,61,0.35)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 34 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: '#DCDDF0', marginBottom: 12 },
  option: { minHeight: 60, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, paddingVertical: 8 },
  optionIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.tile, alignItems: 'center', justifyContent: 'center' },
  person: { width: 112, backgroundColor: colors.card, borderRadius: 18, padding: 12, alignItems: 'center', gap: 4 },
  rank: { position: 'absolute', right: -4, top: -4, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.violet, borderWidth: 2, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' },
});
