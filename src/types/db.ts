/**
 * Hand-written row types matching supabase/migrations and the JSON returned by backend/.
 */

export type LevelCode = '1A' | '2A' | '3A' | 'MASTERE' | 'DOCTORAT';
export type DocType = 'course' | 'td' | 'tp' | 'exam' | 'correction' | 'other';
export type DocStatus = 'pending' | 'approved' | 'rejected' | 'hidden';
export type DocSource = 'upload' | 'drive_file' | 'drive_folder';
export type ReportReason = 'wrong_file' | 'unreadable' | 'wrong_subject' | 'copyrighted' | 'duplicate' | 'other';
export type RejectReason = 'duplicate' | 'unreadable' | 'wrong_subject' | 'copyrighted' | 'other';
export type Role = 'student' | 'moderator' | 'admin';
export type RideScope = 'between_cities' | 'within_city';
export type ItemMode = 'rent' | 'borrow';
export type LostKind = 'lost' | 'found';
export type EventCategory = 'conference' | 'workshop' | 'hackathon' | 'club';

export interface Profile {
  id: string;
  full_name: string;
  username: string | null;
  email: string;
  level: LevelCode | null;
  period: string | null;
  avatar_url: string | null;
  bio?: string | null;
  role: Role;
  trusted?: boolean;
  track_id?: string | null;
  last_seen_at: string | null;
  created_at: string;
}

export interface Level {
  id: number;
  code: LevelCode;
  name: string;
  short_name: string;
  sort: number;
}

export interface FolderStats {
  files: number;
  last_updated: string | null;
}

export type LevelWithStats = Level & FolderStats;

export interface Period extends FolderStats {
  id: string;
  level_id: number;
  name: string;
  label: string;
  months: string | null;
  start_month?: number | null;
  end_month?: number | null;
  sort: number;
  subjects: number;
}

export interface Track {
  id: string;
  level_id: number;
  name: string;
  code: string | null;
  sort: number;
}

export interface Subject extends FolderStats {
  id: string;
  period_id: string;
  name: string;
  code?: string | null;
  color: string | null;
  track_id?: string | null;
  track?: Pick<Track, 'id' | 'name' | 'code'> | null;
  drive_folder_id?: string | null;
  drive_synced_at?: string | null;
}

export interface DocumentRow {
  id: string;
  subject_id: string;
  /** Auto-built ("TD3 – Réseaux – 2025/26"), editable by moderators. */
  title: string;
  type: DocType;
  number: number | null;
  /** 'YYYY/YY', e.g. 2025/26 */
  academic_year: string | null;
  source: DocSource;
  status: DocStatus;
  uploader_id: string | null;
  file_name: string | null;
  file_ext: string;
  size_bytes: number | null;
  mime_type: string | null;
  drive_file_id: string | null;
  drive_url: string | null;
  parent_folder_doc_id: string | null;
  correction_of_id: string | null;
  version: number;
  replaced_by_id: string | null;
  reject_reason: RejectReason | null;
  reject_note: string | null;
  reviewed_at: string | null;
  hidden_reason: string | null;
  open_count: number;
  download_count: number;
  useful_count: number;
  report_count: number;
  created_at: string;
  updated_at: string;
  /** Flags for the signed-in user. */
  mine: boolean;
  starred: boolean;
  voted_useful: boolean;
  /** Best approved correction linked to this exam. */
  correction_id?: string | null;
  uploader?: (Pick<Profile, 'id' | 'full_name' | 'level' | 'avatar_url'> & { trusted: boolean; role: Role }) | null;
  subject?: {
    id: string;
    name: string;
    code: string | null;
    period: { id: string; name: string; level: { id: number; name: string; short_name: string } };
  } | null;
  /** Folders only. */
  children_count?: number;
}

export interface RideFeed {
  id: string;
  driver_id: string;
  driver_name: string;
  driver_level: LevelCode | null;
  driver_rating: number | null;
  driver_rides: number;
  scope: RideScope;
  from_place: string;
  to_place: string;
  departure_at: string;
  seats_total: number;
  seats_left: number;
  price_tnd: number;
  recurring: boolean;
  note: string | null;
  car: string | null;
  from_lat: number | null;
  from_lng: number | null;
  to_lat: number | null;
  to_lng: number | null;
  booked_by_me: boolean;
  /** true on a ride the driver cancelled (still readable from a notification). */
  cancelled?: boolean;
  hidden_at?: string | null;
}

export interface ItemRow {
  id: string;
  owner_id: string;
  mode: ItemMode;
  title: string;
  description: string | null;
  category: string;
  price_tnd: number | null;
  price_unit: 'day' | 'week' | 'month';
  max_duration: string | null;
  condition: string | null;
  location: string | null;
  photo_path: string | null;
  available: boolean;
  created_at: string;
  owner?: Pick<Profile, 'id' | 'full_name' | 'level'> | null;
}

export interface LostFoundRow {
  id: string;
  reporter_id: string;
  kind: LostKind;
  title: string;
  category: string;
  location: string;
  happened_at: string | null;
  description: string | null;
  photo_path: string | null;
  status: 'open' | 'returned';
  returned_at?: string | null;
  created_at: string;
  reporter?: Pick<Profile, 'id' | 'full_name'> | null;
}

export interface EventFeed {
  id: string;
  title: string;
  category: EventCategory;
  organizer: string;
  starts_at: string;
  ends_at: string | null;
  location: string;
  description: string | null;
  /** Seat limit, null = unlimited. */
  seats?: number | null;
  /** null when there is no limit. */
  seats_left?: number | null;
  going: number;
  registered_by_me: boolean;
}

export interface PostFeed {
  id: string;
  author_id: string;
  author_name: string;
  author_level: LevelCode | null;
  scope: 'general' | 'level';
  level_code: LevelCode | null;
  topic: string | null;
  body: string;
  created_at: string;
  likes_count: number;
  comments_count: number;
  liked_by_me: boolean;
}

export interface CommentRow {
  id: string;
  post_id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  is_best: boolean;
  created_at: string;
  author?: Pick<Profile, 'id' | 'full_name' | 'level'> | null;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface ConversationRow {
  id: string;
  other_id: string;
  other_name: string;
  context: string | null;
  last_message: string | null;
  last_at: string | null;
  other_avatar_url?: string | null;
  last_sender_id?: string | null;
  unread_count?: number;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at?: string | null;
}

export type ReportTargetType = 'document' | 'post' | 'comment' | 'item' | 'lost_found' | 'ride' | 'user';

export interface ProfileStats {
  uploads: number;
  rides: number;
  posts: number;
  items?: number;
  lost_found?: number;
  bookings?: number;
  events?: number;
  comments?: number;
}

export interface AdminReport {
  id: string;
  target_type: ReportTargetType;
  target_id: string;
  reason: string;
  status: 'open' | 'dismissed' | 'resolved';
  action: 'dismiss' | 'delete_content' | 'ban_user' | null;
  created_at: string;
  resolved_at: string | null;
  reporter: { id: string; full_name: string; email: string } | null;
  open_reports: number;
  preview: string | null;
  owner_id: string | null;
  hidden_at: string | null;
  owner: { id: string; full_name: string; email: string; banned: boolean } | null;
}

export const LEVEL_LABEL: Record<LevelCode, string> = {
  '1A': '1ère année',
  '2A': '2ème année',
  '3A': '3ème année',
  MASTERE: 'Mastère',
  DOCTORAT: 'Doctorat',
};

export const LEVEL_SHORT: Record<LevelCode, string> = {
  '1A': '1ère',
  '2A': '2ème',
  '3A': '3ème',
  MASTERE: 'Mastère',
  DOCTORAT: 'Doctorat',
};

export const LEVEL_CODES: LevelCode[] = ['1A', '2A', '3A', 'MASTERE', 'DOCTORAT'];

export const DOC_TYPES: DocType[] = ['course', 'td', 'tp', 'exam', 'correction', 'other'];

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  course: 'Course',
  td: 'TD',
  tp: 'TP',
  exam: 'Exam',
  correction: 'Correction',
  other: 'Other',
};

export const DOC_FILTERS: { value: DocType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'course', label: 'Courses' },
  { value: 'td', label: 'TD' },
  { value: 'tp', label: 'TP' },
  { value: 'exam', label: 'Exams' },
  { value: 'correction', label: 'Corrections' },
  { value: 'other', label: 'Other' },
];

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  wrong_file: 'Wrong file',
  unreadable: 'Unreadable',
  wrong_subject: 'Wrong subject',
  copyrighted: 'Copyrighted',
  duplicate: 'Duplicate',
  other: 'Other',
};

/** Current academic year 'YYYY/YY' (starts in September). */
export function currentAcademicYear(now = new Date()) {
  const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}/${String((y + 1) % 100).padStart(2, '0')}`;
}
