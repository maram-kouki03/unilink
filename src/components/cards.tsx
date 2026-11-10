import React, { ReactNode } from 'react';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Icon, IconName } from '@/components/Icon';
import { EVENT_GRADIENTS, EventGlyph, FileIcon, ItemArt } from '@/components/Illustrations';
import { Avatar, Badge, Row, Txt } from '@/components/ui';
import { colors, radius, shadows } from '@/theme';
import { dayLabel, fileSize, hhmm, shortDate, timeAgo, updatedLabel } from '@/lib/format';
import { publicImageUrl } from '@/lib/storage';
import {
  DOC_TYPE_LABEL,
  DocumentRow,
  EventFeed,
  ItemRow,
  LEVEL_LABEL,
  LostFoundRow,
  PostFeed,
  RideFeed,
} from '@/types/db';

/* ───────────── Breadcrumbs ───────────── */

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <View accessibilityRole="header" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
      {items.map((it, i) => {
        const last = i === items.length - 1;
        return (
          <Row key={`${it.label}-${i}`} gap={4}>
            {i === 0 ? <Icon name="folder" size={15} color={colors.royal} /> : null}
            <Pressable disabled={last || !it.href} onPress={() => it.href && router.navigate(it.href as never)} hitSlop={6}>
              <Txt size={13} weight={last ? 800 : 600} color={last ? colors.navy : colors.muted}>
                {it.label}
              </Txt>
            </Pressable>
            {!last ? <Icon name="chevronRight" size={13} color={colors.iconMuted} /> : null}
          </Row>
        );
      })}
    </View>
  );
}

/* ───────────── Folder card ───────────── */

export function FolderIcon({ color, size = 24 }: { color: string; size?: number }) {
  return (
    <View style={{ width: size + 18, height: size + 18, borderRadius: 12, backgroundColor: colors.tileAlt, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="folder" size={size} color={color} />
    </View>
  );
}

export function FolderCard({
  title,
  color,
  files,
  lastUpdated,
  onPress,
  highlighted,
}: {
  title: string;
  color: string;
  files: number;
  lastUpdated: string | null;
  onPress: () => void;
  highlighted?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${files} files`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.folder,
        shadows.card,
        highlighted && { borderWidth: 2, borderColor: colors.royal },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <FolderIcon color={color} />
        <Txt size={11} weight={700} color={colors.muted}>
          {files} files
        </Txt>
      </Row>
      <View style={{ gap: 2 }}>
        <Txt size={14} weight={700} numberOfLines={2}>
          {title}
        </Txt>
        <Txt size={11} color={colors.muted}>
          {updatedLabel(lastUpdated)}
        </Txt>
      </View>
    </Pressable>
  );
}

export function DashedAction({ label, icon = 'plus', onPress, height = 108 }: { label: string; icon?: IconName; onPress: () => void; height?: number }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.dashed, { height }]}>
      <Icon name={icon} size={24} color={colors.royal} />
      <Txt size={13} weight={700} color={colors.royal}>
        {label}
      </Txt>
    </Pressable>
  );
}

/* ───────────── File row ───────────── */

export function FileRow({
  doc,
  onPress,
  onDownload,
  onMore,
  last,
}: {
  doc: DocumentRow;
  onPress: () => void;
  onDownload?: () => void;
  onMore?: () => void;
  last?: boolean;
}) {
  const meta = [doc.doc_type === 'summary' ? 'Résumé' : `${DOC_TYPE_LABEL[doc.doc_type]} ${doc.academic_year ?? ''}`.trim(), fileSize(doc.size_bytes)]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={[styles.fileRow, !last && { borderBottomWidth: 1, borderBottomColor: colors.divider }]}>
      <FileIcon ext={doc.file_ext} />
      <Pressable accessibilityRole="button" onPress={onPress} style={{ flex: 1, gap: 3 }}>
        <Txt size={14} weight={700} numberOfLines={1}>
          {doc.title}
        </Txt>
        <Txt size={12} color={colors.muted} numberOfLines={1}>
          {meta}
        </Txt>
      </Pressable>
      {onDownload ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Download" onPress={onDownload} hitSlop={6} style={styles.rowBtn}>
          <Icon name="download" size={20} color={colors.royal} />
        </Pressable>
      ) : null}
      {onMore ? (
        <Pressable accessibilityRole="button" accessibilityLabel="More actions" onPress={onMore} hitSlop={6} style={styles.rowBtn}>
          <Icon name="moreV" size={18} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/* ───────────── Action sheet ───────────── */

export function ActionSheet({
  visible,
  title,
  onClose,
  actions,
}: {
  visible: boolean;
  title?: string;
  onClose: () => void;
  actions: { label: string; icon: IconName; onPress: () => void; danger?: boolean }[];
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        {title ? (
          <Txt size={15} weight={800} numberOfLines={1} style={{ marginBottom: 6 }}>
            {title}
          </Txt>
        ) : null}
        {actions.map((a) => (
          <Pressable
            key={a.label}
            accessibilityRole="menuitem"
            onPress={() => {
              onClose();
              a.onPress();
            }}
            style={({ pressed }) => [styles.sheetItem, pressed && { backgroundColor: colors.bg }]}
          >
            <Icon name={a.icon} size={20} color={a.danger ? '#C92A2F' : colors.navy} />
            <Txt size={15} weight={600} color={a.danger ? '#C92A2F' : colors.text}>
              {a.label}
            </Txt>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

/* ───────────── Ride card ───────────── */

export function RouteDots({ height = 14 }: { height?: number }) {
  return (
    <View style={{ alignItems: 'center', gap: 3 }}>
      <View style={{ width: 11, height: 11, borderRadius: 6, borderWidth: 2.5, borderColor: colors.royal }} />
      <View style={{ width: 2, height, backgroundColor: colors.dashed }} />
      <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: colors.violet }} />
    </View>
  );
}

export function RideCard({ ride, onPress }: { ride: RideFeed; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.card, shadows.card, { gap: 12 }, pressed && { opacity: 0.88 }]}>
      <Row gap={10}>
        <Avatar name={ride.driver_name} />
        <View style={{ flex: 1 }}>
          <Txt size={15} weight={700}>
            {ride.driver_name}
          </Txt>
          <Row gap={4}>
            <Icon name="star" size={13} color={colors.star} />
            <Txt size={12} color={colors.muted}>
              {ride.driver_rating ? ride.driver_rating.toFixed(1) : 'New'} · {ride.driver_rides} rides
            </Txt>
          </Row>
        </View>
        <Badge label={ride.recurring ? 'Daily' : 'One-time'} />
      </Row>
      <Row gap={10}>
        <RouteDots />
        <View style={{ flex: 1, gap: 8 }}>
          <Txt size={14} weight={700} numberOfLines={1}>
            {ride.from_place}
          </Txt>
          <Txt size={14} weight={700} numberOfLines={1}>
            {ride.to_place}
          </Txt>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Txt size={18} weight={800} color={colors.navy}>
            {Number(ride.price_tnd)} TND
          </Txt>
          <Txt size={11} color={colors.muted}>
            / seat
          </Txt>
        </View>
      </Row>
      <Row gap={14} style={{ paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.divider }}>
        <Row gap={5}>
          <Icon name="calendar" size={14} color={colors.royal} />
          <Txt size={12} weight={600} color={colors.muted}>
            {dayLabel(ride.departure_at)}
          </Txt>
        </Row>
        <Row gap={5}>
          <Icon name="clock" size={14} color={colors.royal} />
          <Txt size={12} weight={600} color={colors.muted}>
            {hhmm(ride.departure_at)}
          </Txt>
        </Row>
        <Txt size={12} weight={700} color={ride.seats_left > 0 ? colors.navy : colors.dangerText} style={{ marginLeft: 'auto' }}>
          {ride.seats_left > 0 ? `${ride.seats_left} seat${ride.seats_left > 1 ? 's' : ''} left` : 'Full'}
        </Txt>
      </Row>
    </Pressable>
  );
}

/* ───────────── Item card ───────────── */

export function ItemCard({ item, onPress }: { item: ItemRow; onPress: () => void }) {
  const img = publicImageUrl(item.photo_path);
  const price = item.price_tnd ? `${Number(item.price_tnd)} TND` : 'Free';
  const unit = item.price_tnd ? `/ ${item.price_unit}` : item.max_duration ? `· ${item.max_duration}` : '';
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.itemCard, shadows.card, pressed && { opacity: 0.88 }]}>
      <View style={styles.itemImg}>
        {img ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <ItemArt category={item.category} size={72} />}
        <View style={styles.itemTag}>
          <Txt size={10} weight={800} color={colors.navy}>
            {item.category}
          </Txt>
        </View>
      </View>
      <View style={{ paddingHorizontal: 6, paddingBottom: 6, gap: 3 }}>
        <Txt size={14} weight={700} numberOfLines={1}>
          {item.title}
        </Txt>
        <Txt size={11} color={colors.muted} numberOfLines={1}>
          {item.owner?.full_name ?? ''}
          {item.location ? ` · ${item.location}` : ''}
        </Txt>
        <Txt size={15} weight={800} color={colors.royal}>
          {price}{' '}
          <Txt size={11} weight={600} color={colors.muted}>
            {unit}
          </Txt>
        </Txt>
      </View>
    </Pressable>
  );
}

/* ───────────── Lost & found row ───────────── */

export function LostRow({ item, onPress }: { item: LostFoundRow; onPress?: () => void }) {
  const img = publicImageUrl(item.photo_path);
  const tone = item.status === 'returned' ? 'neutral' : item.kind === 'lost' ? 'danger' : 'success';
  const label = item.status === 'returned' ? 'Returned' : item.kind === 'lost' ? 'Lost' : 'Found';
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.card, shadows.soft, { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }]}>
      <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: colors.tileAlt, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {img ? <Image source={{ uri: img }} style={{ width: 52, height: 52 }} /> : <ItemArt category={item.category} size={36} />}
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Txt size={14} weight={700} numberOfLines={1}>
          {item.title}
        </Txt>
        <Row gap={4}>
          <Icon name="pin" size={12} color={colors.royal} />
          <Txt size={12} color={colors.muted} numberOfLines={1}>
            {item.location} · {timeAgo(item.happened_at ?? item.created_at)}
          </Txt>
        </Row>
      </View>
      <Badge label={label} tone={tone} />
    </Pressable>
  );
}

/* ───────────── Event card ───────────── */

export function EventCard({ event, onPress, compact }: { event: EventFeed; onPress: () => void; compact?: boolean }) {
  const g = EVENT_GRADIENTS[event.category] ?? EVENT_GRADIENTS.conference;
  if (compact)
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={[styles.eventCompact, shadows.card]}>
        <LinearGradient colors={g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 92, padding: 12, justifyContent: 'space-between', flexDirection: 'row' }}>
          <View style={{ backgroundColor: colors.white, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start' }}>
            <Txt size={11} weight={700} color={colors.navy}>
              {event.category[0].toUpperCase() + event.category.slice(1)}
            </Txt>
          </View>
          <EventGlyph category={event.category} size={46} />
        </LinearGradient>
        <View style={{ padding: 12, gap: 6 }}>
          <Txt size={15} weight={700} numberOfLines={1}>
            {event.title}
          </Txt>
          <Row gap={6}>
            <Icon name="clock" size={14} color={colors.royal} />
            <Txt size={12} color={colors.muted}>
              {shortDate(event.starts_at)} · {hhmm(event.starts_at)}
            </Txt>
          </Row>
        </View>
      </Pressable>
    );
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[{ borderRadius: 22, overflow: 'hidden' }, shadows.strong]}>
      <LinearGradient colors={g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 186, padding: 18, justifyContent: 'space-between' }}>
        <View style={{ position: 'absolute', right: 18, top: 20 }}>
          <EventGlyph category={event.category} />
        </View>
        <Badge label={event.category.toUpperCase()} tone="white" />
        <View style={{ gap: 6 }}>
          <Txt size={19} weight={800} color={colors.white} style={{ maxWidth: 240 }}>
            {event.title}
          </Txt>
          <Txt size={12} weight={600} color="#E3E1FF">
            {dayLabel(event.starts_at)} · {event.location}
          </Txt>
        </View>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt size={12} weight={600} color={colors.white}>
            {event.going} going
          </Txt>
          <View style={{ backgroundColor: colors.white, borderRadius: 999, paddingHorizontal: 18, height: 38, justifyContent: 'center' }}>
            <Txt size={13} weight={800} color={colors.navy}>
              {event.registered_by_me ? 'Registered ✓' : 'Register'}
            </Txt>
          </View>
        </Row>
      </LinearGradient>
    </Pressable>
  );
}

/* ───────────── Post card ───────────── */

export function PostCard({ post, onPress, onLike, footer }: { post: PostFeed; onPress?: () => void; onLike: () => void; footer?: ReactNode }) {
  return (
    <View style={[styles.card, shadows.card, { gap: 10, paddingHorizontal: 16 }]}>
      <Row gap={10}>
        <Avatar name={post.author_name} size={40} />
        <View style={{ flex: 1 }}>
          <Txt size={14} weight={700}>
            {post.author_name}
          </Txt>
          <Txt size={12} color={colors.muted}>
            {post.author_level ? LEVEL_LABEL[post.author_level] : 'SUP’COM'} · {timeAgo(post.created_at)}
          </Txt>
        </View>
      </Row>
      <Pressable onPress={onPress} disabled={!onPress}>
        <Txt size={14} style={{ lineHeight: 21 }}>
          {post.body}
        </Txt>
      </Pressable>
      <Row gap={6}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: post.liked_by_me }}
          accessibilityLabel={`Like, ${post.likes_count}`}
          onPress={onLike}
          style={[styles.pill, { backgroundColor: '#F6F0FF' }]}
        >
          <Icon name={post.liked_by_me ? 'heart' : 'heartOutline'} size={18} color={colors.violet} />
          <Txt size={13} weight={700} color={colors.violetDeep}>
            {post.likes_count}
          </Txt>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`${post.comments_count} comments`} onPress={onPress} style={[styles.pill, { backgroundColor: '#EEF0FB' }]}>
          <Icon name="chat" size={18} color={colors.royal} />
          <Txt size={13} weight={700} color={colors.royal}>
            {post.comments_count}
          </Txt>
        </Pressable>
        {post.topic ? (
          <View style={{ marginLeft: 'auto' }}>
            <Badge label={post.topic} tone="navy" />
          </View>
        ) : null}
      </Row>
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 14 },
  folder: { height: 112, backgroundColor: colors.card, borderRadius: 18, padding: 14, justifyContent: 'space-between' },
  dashed: { borderRadius: 18, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.dashed, alignItems: 'center', justifyContent: 'center', gap: 6 },
  fileRow: { minHeight: 64, paddingLeft: 14, paddingRight: 4, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowBtn: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(18,21,61,0.35)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 36, gap: 2 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: '#DCDDF0', marginBottom: 12 },
  sheetItem: { height: 52, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10 },
  itemCard: { flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, padding: 8, gap: 10 },
  itemImg: { height: 108, borderRadius: 14, backgroundColor: colors.tileAlt, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  itemTag: { position: 'absolute', left: 8, top: 8, backgroundColor: colors.white, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  eventCompact: { width: 224, backgroundColor: colors.card, borderRadius: radius.lg, overflow: 'hidden' },
  pill: { height: 36, paddingLeft: 10, paddingRight: 12, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6 },
});
