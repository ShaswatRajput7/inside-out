-- Incremental: existing conversations without a row keep their original background.
begin;

create table public.conversation_themes (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  kind text not null check (kind in ('default', 'builtin', 'custom')),
  builtin_key text,
  custom_path text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint conversation_theme_config check (
    (kind = 'default' and builtin_key is null and custom_path is null) or
    (kind = 'builtin' and builtin_key is not null and builtin_key in ('grand-line', 'purple-hour', 'sakura-dream', 'neon-rain', 'sky-meadow') and custom_path is null) or
    (kind = 'custom' and builtin_key is null and custom_path is not null and split_part(custom_path, '/', 1) = conversation_id::text)
  )
);
alter table public.conversation_themes enable row level security;
revoke all on public.conversation_themes from anon, authenticated;
grant select on public.conversation_themes to authenticated;
grant all on public.conversation_themes to service_role;
create policy conversation_themes_member on public.conversation_themes for select to authenticated
  using (private.is_member(conversation_id));

-- Immutable objects: members cannot overwrite another participant's background.
-- Read access follows the CURRENT theme, so old/abandoned uploads are not exposed.
create function private.can_upload_conversation_theme(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|png)$'
    then split_part(path, '/', 2) = auth.uid()::text and private.is_member(split_part(path, '/', 1)::uuid)
    else false end;
$$;
create function private.can_read_conversation_theme(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.conversation_themes t
    where t.kind = 'custom' and t.custom_path = path and private.is_member(t.conversation_id));
$$;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('conversation-themes', 'conversation-themes', false, 512000, array['image/jpeg', 'image/png', 'image/webp']);
create policy conversation_themes_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'conversation-themes' and private.can_upload_conversation_theme(name));
create policy conversation_themes_download on storage.objects for select to authenticated
  using (bucket_id = 'conversation-themes' and private.can_read_conversation_theme(name));

create function public.set_conversation_theme(target_conversation uuid, theme_kind text, theme_key text default null, image_path text default null)
returns public.conversation_themes language plpgsql security definer set search_path = '' as $$
declare result public.conversation_themes;
begin
  -- Lock membership until commit so a concurrent group removal cannot race this write.
  perform 1 from public.conversation_members where conversation_id = target_conversation and user_id = auth.uid() for share;
  if not found then raise exception 'Conversation unavailable'; end if;
  if theme_kind is null or theme_kind not in ('default', 'builtin', 'custom') then raise exception 'Invalid theme type'; end if;
  if theme_kind = 'custom' then
    if image_path is null or split_part(image_path, '/', 1) <> target_conversation::text
      or not (private.can_upload_conversation_theme(image_path) or exists(
        select 1 from public.conversation_themes where conversation_id = target_conversation and custom_path = image_path
      )) then raise exception 'Invalid theme image path'; end if;
    if not exists(select 1 from storage.objects where bucket_id = 'conversation-themes' and name = image_path
      and metadata->>'mimetype' in ('image/jpeg', 'image/png', 'image/webp')
      and (metadata->>'size')::bigint between 1 and 512000) then raise exception 'Theme image upload is unavailable'; end if;
  end if;
  insert into public.conversation_themes(conversation_id, kind, builtin_key, custom_path, updated_by)
    values(target_conversation, theme_kind, theme_key, image_path, auth.uid())
    on conflict (conversation_id) do update set kind = excluded.kind, builtin_key = excluded.builtin_key,
      custom_path = excluded.custom_path, updated_by = excluded.updated_by, updated_at = clock_timestamp()
    returning * into result;
  return result;
end;
$$;
revoke all on function private.can_upload_conversation_theme(text), private.can_read_conversation_theme(text), public.set_conversation_theme(uuid,text,text,text) from public, anon, authenticated;
grant execute on function private.can_upload_conversation_theme(text), private.can_read_conversation_theme(text), public.set_conversation_theme(uuid,text,text,text) to authenticated;
alter publication supabase_realtime add table public.conversation_themes;
commit;
