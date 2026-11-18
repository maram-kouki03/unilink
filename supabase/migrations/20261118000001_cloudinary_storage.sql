-- Files move from the server disk to Cloudinary.
-- documents.file_path now holds the Cloudinary public_id; these columns say how to build its signed link.
-- Safe to run more than once.

alter table public.documents add column if not exists storage_resource_type text;  -- 'raw' or 'image' (null = old local file)
alter table public.documents add column if not exists storage_format text;         -- e.g. 'jpg' for images, null for raw files

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'documents_storage_resource_type_check') then
    alter table public.documents
      add constraint documents_storage_resource_type_check
      check (storage_resource_type is null or storage_resource_type in ('raw', 'image'));
  end if;
end $$;

comment on column public.documents.file_path is 'Cloudinary public_id (private, type "authenticated")';
comment on column public.items.photo_path is 'Full https URL of the photo on Cloudinary';
comment on column public.lost_found.photo_path is 'Full https URL of the photo on Cloudinary';
