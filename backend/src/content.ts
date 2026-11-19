import { one, query } from './db';
import { removeImageUrl, removeStored, type ResourceType } from './files';
import { notify } from './notify';
import { CLOSE_REPORTS_ON_TARGET, type TargetType } from './sql/moderation';

type DeletableType = Exclude<TargetType, 'user'>;

const DELETE_SQL: Record<DeletableType, string> = {
  document: `delete from public.documents where id = $1
             returning file_path, storage_resource_type`,
  post: `delete from public.posts where id = $1 returning id`,
  comment: `delete from public.comments where id = $1 returning id, post_id`,
  item: `delete from public.items where id = $1 returning photo_path`,
  lost_found: `delete from public.lost_found where id = $1 returning photo_path`,
  ride: `delete from public.rides where id = $1 returning id`,
};

const RIDE_TO_DELETE = `
  select r.from_place, r.cancelled, r.departure_at,
         coalesce((select array_agg(distinct b.passenger_id) from public.ride_bookings b
                    where b.ride_id = r.id and b.status = 'confirmed'), '{}') as passengers
    from public.rides r where r.id = $1`;

/**
 * Delete one piece of content (and its Cloudinary file), close its open reports.
 * Ownership must be checked by the caller. Returns false if it did not exist.
 */
export async function deleteContent(type: DeletableType, id: string, actorId: string): Promise<boolean> {
  // A ride with passengers: tell them before it disappears.
  let ride: { from_place: string; cancelled: boolean; departure_at: Date; passengers: string[] } | null = null;
  if (type === 'ride') ride = await one(RIDE_TO_DELETE, [id]);

  const row = await one<Record<string, unknown>>(DELETE_SQL[type], [id]);
  if (!row) return false;

  await query(CLOSE_REPORTS_ON_TARGET, [type, id, 'resolved', 'delete_content', actorId]);

  if (type === 'document' && row.storage_resource_type) {
    await removeStored(row.file_path as string, row.storage_resource_type as ResourceType, 'authenticated');
  }
  if ((type === 'item' || type === 'lost_found') && row.photo_path) {
    await removeImageUrl(row.photo_path as string);
  }
  if (ride && !ride.cancelled && new Date(ride.departure_at).getTime() > Date.now()) {
    await Promise.all(
      ride.passengers.map((p) =>
        notify({
          target: p,
          actor: actorId,
          title: 'Ride cancelled',
          body: `The ride from ${ride!.from_place} was cancelled`,
          link: '/rides/mine',
        }),
      ),
    );
  }
  return true;
}
