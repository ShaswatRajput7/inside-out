-- Run once in a NEW Supabase project's SQL Editor. All operations are transactional.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null check (length(display_name) between 3 and 24),
  created_at timestamptz not null default now()
);
-- Only lowercase ASCII usernames are stored: the UNIQUE constraint is case-insensitive by construction.
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct', 'group')),
  name text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  direct_key text unique,
  check ((type = 'direct' and name is null and direct_key is not null) or
         (type = 'group' and length(btrim(name)) between 1 and 60 and direct_key is null))
);
create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on public.conversation_members(user_id, conversation_id);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  content text not null check (length(btrim(content)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index messages_history_idx on public.messages(conversation_id, created_at desc, id desc);
create index messages_sender_idx on public.messages(sender_id);
create index conversations_creator_idx on public.conversations(created_by);

-- A failing profile insert rolls back the Auth user insert, including username collisions.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uname text := lower(btrim(new.raw_user_meta_data->>'username'));
begin
  if uname is null or uname !~ '^[a-z0-9_]{3,24}$'
     or new.email is distinct from uname || '@insideout.invalid' then
    raise exception 'Invalid Inside Out username or identity';
  end if;
  insert into public.profiles(id, username, display_name) values (new.id, uname, uname);
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function private.handle_new_user();

-- Definer helpers bypass RLS internally, avoiding recursive membership policies.
-- They always scope checks to auth.uid(), never a supplied caller identity.
create function private.is_member(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversation_members where conversation_id = cid and user_id = (select auth.uid()));
$$;
create function private.can_view_profile(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select pid = (select auth.uid()) or exists (
    select 1 from public.conversation_members mine
    join public.conversation_members theirs using (conversation_id)
    where mine.user_id = (select auth.uid()) and theirs.user_id = pid
  ) or exists (
    select 1 from public.messages m
    join public.conversation_members mine on mine.conversation_id = m.conversation_id
    where mine.user_id = (select auth.uid()) and m.sender_id = pid
  );
$$;

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
revoke all on public.profiles, public.conversations, public.conversation_members, public.messages from anon, authenticated;
grant select on public.profiles, public.conversations, public.conversation_members, public.messages to authenticated;
-- Clients cannot set timestamps or edit existing messages/membership directly.
grant insert (id, conversation_id, sender_id, content) on public.messages to authenticated;
create policy profiles_shared on public.profiles for select to authenticated using (private.can_view_profile(id));
create policy conversations_member on public.conversations for select to authenticated using (private.is_member(id));
create policy members_shared on public.conversation_members for select to authenticated using (private.is_member(conversation_id));
create policy messages_member on public.messages for select to authenticated using (private.is_member(conversation_id));
create policy messages_send on public.messages for insert to authenticated
with check (sender_id = (select auth.uid()) and private.is_member(conversation_id));

create function public.lookup_username(exact_username text)
returns table(id uuid, username text, display_name text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.display_name from public.profiles p
  where (select auth.uid()) is not null and p.username = lower(btrim(exact_username))
  and lower(btrim(exact_username)) ~ '^[a-z0-9_]{3,24}$' limit 1;
$$;

create function public.create_direct(other_user_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); pair text; cid uuid;
begin
  if uid is null then raise exception 'Please sign in'; end if;
  if uid = other_user_id then raise exception 'Choose another user'; end if;
  if not exists(select 1 from public.profiles where id = other_user_id) then raise exception 'User not found'; end if;
  pair := least(uid::text, other_user_id::text) || ':' || greatest(uid::text, other_user_id::text);
  perform pg_advisory_xact_lock(hashtextextended(pair, 0));
  select id into cid from public.conversations where direct_key = pair;
  if cid is null then
    insert into public.conversations(type, created_by, direct_key) values ('direct', uid, pair) returning id into cid;
    insert into public.conversation_members(conversation_id, user_id) values (cid, uid), (cid, other_user_id);
  end if;
  return cid;
end;
$$;

create function public.create_group(group_name text, member_ids uuid[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); cid uuid;
begin
  if uid is null then raise exception 'Please sign in'; end if;
  if group_name is null or length(btrim(group_name)) not between 1 and 60 then raise exception 'Group name must be 1–60 characters'; end if;
  if coalesce(cardinality(member_ids), 0) > 29 then raise exception 'A group can have up to 30 people'; end if;
  if exists(select 1 from unnest(member_ids) m(id) where id is null or not exists(select 1 from public.profiles p where p.id = m.id)) then raise exception 'User not found'; end if;
  insert into public.conversations(type, name, created_by) values ('group', btrim(group_name), uid) returning id into cid;
  insert into public.conversation_members(conversation_id, user_id, role) values (cid, uid, 'admin');
  insert into public.conversation_members(conversation_id, user_id)
    select cid, id from (select distinct unnest(member_ids) as id) members where id <> uid;
  return cid;
end;
$$;

create function public.add_group_member(target_conversation uuid, exact_username text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); target_user uuid; owner_id uuid;
begin
  -- Row lock serializes membership changes, including the size check.
  select created_by into owner_id from public.conversations where id = target_conversation and type = 'group' for update;
  if uid is null or owner_id is distinct from uid then raise exception 'Only the group creator can manage members'; end if;
  select id into target_user from public.profiles where username = lower(btrim(exact_username));
  if target_user is null then raise exception 'User not found'; end if;
  if exists(select 1 from public.conversation_members where conversation_id = target_conversation and user_id = target_user) then return; end if;
  if (select count(*) from public.conversation_members where conversation_id = target_conversation) >= 30 then raise exception 'A group can have up to 30 people'; end if;
  insert into public.conversation_members(conversation_id, user_id) values (target_conversation, target_user);
end;
$$;

create function public.remove_group_member(target_conversation uuid, target_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); owner_id uuid;
begin
  select created_by into owner_id from public.conversations where id = target_conversation and type = 'group' for update;
  if uid is null or owner_id is distinct from uid then raise exception 'Only the group creator can manage members'; end if;
  if target_user = owner_id then raise exception 'The group creator cannot be removed'; end if;
  delete from public.conversation_members where conversation_id = target_conversation and user_id = target_user;
end;
$$;

revoke all on function private.handle_new_user(), private.is_member(uuid), private.can_view_profile(uuid) from public, anon, authenticated;
grant execute on function private.is_member(uuid), private.can_view_profile(uuid) to authenticated;
revoke all on function public.lookup_username(text), public.create_direct(uuid), public.create_group(text, uuid[]), public.add_group_member(uuid,text), public.remove_group_member(uuid,uuid) from public, anon, authenticated;
grant execute on function public.lookup_username(text), public.create_direct(uuid), public.create_group(text,uuid[]), public.add_group_member(uuid,text), public.remove_group_member(uuid,uuid) to authenticated;

-- Supabase normally creates this publication. Also works on a fresh local test DB.
do $$ begin
  if not exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
alter publication supabase_realtime add table public.messages, public.conversation_members, public.conversations;
commit;
