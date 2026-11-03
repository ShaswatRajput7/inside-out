-- Additive, direct-conversation appearance only. No existing rows/themes are changed.
begin;
create table public.conversation_magic (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  effect_id text,
  applied_by uuid references public.profiles(id) on delete set null,
  applied_at timestamptz not null,
  expires_at timestamptz not null,
  constraint conversation_magic_effect check (effect_id is null or effect_id in (
    'starry-night','falling-stars','sakura-rain','fireflies','aurora','heart-bloom',
    'golden-celebration','winter-whisper','bubble-dream','cosmic-pulse','sunrise-glow','butterfly-wishes')),
  constraint conversation_magic_duration check (
    (effect_id is null and expires_at=applied_at) or
    (effect_id is not null and expires_at>=applied_at+interval '1 minute' and expires_at<=applied_at+interval '24 hours'))
);
alter table public.conversation_magic enable row level security;
revoke all on public.conversation_magic from anon,authenticated;
grant select on public.conversation_magic to authenticated;
grant all on public.conversation_magic to service_role;
create policy conversation_magic_members on public.conversation_magic for select to authenticated
using (private.is_member(conversation_id) and exists(
  select 1 from public.conversations c where c.id=conversation_id and c.type='direct'));

create function public.get_conversation_magic(target_conversation uuid)
returns table(conversation_id uuid,effect_id text,applied_by uuid,applied_at timestamptz,expires_at timestamptz,server_now timestamptz)
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.conversations c
    where c.id=target_conversation and c.type='direct' and private.is_member(c.id)) then
    raise exception 'Conversation unavailable';
  end if;
  -- Always return a server clock, including when no setting has ever been applied.
  return query select target_conversation,m.effect_id,m.applied_by,m.applied_at,m.expires_at,clock_timestamp()
    from (select 1) base left join public.conversation_magic m on m.conversation_id=target_conversation;
end;
$$;
create function public.set_conversation_magic(target_conversation uuid,effect_key text,duration_seconds integer default 3600)
returns table(conversation_id uuid,effect_id text,applied_by uuid,applied_at timestamptz,expires_at timestamptz,server_now timestamptz)
language plpgsql security definer set search_path='' as $$
declare stamp timestamptz;
begin
  -- Serialize simultaneous participant changes; the final committed selection wins.
  perform 1 from public.conversations c where c.id=target_conversation and c.type='direct'
    and private.is_member(c.id) for update;
  if auth.uid() is null or not found then raise exception 'Conversation unavailable'; end if;
  if effect_key is not null and effect_key not in ('starry-night','falling-stars','sakura-rain','fireflies','aurora',
    'heart-bloom','golden-celebration','winter-whisper','bubble-dream','cosmic-pulse','sunrise-glow','butterfly-wishes') then
    raise exception 'Unknown magical atmosphere';
  end if;
  if effect_key is not null and (duration_seconds is null or duration_seconds not between 60 and 86400) then
    raise exception 'Choose a duration from 1 minute to 24 hours';
  end if;
  stamp:=clock_timestamp();
  insert into public.conversation_magic as m(conversation_id,effect_id,applied_by,applied_at,expires_at)
    values(target_conversation,effect_key,auth.uid(),stamp,
      case when effect_key is null then stamp else stamp+make_interval(secs=>duration_seconds) end)
    on conflict on constraint conversation_magic_pkey do update set effect_id=excluded.effect_id,applied_by=excluded.applied_by,
      applied_at=excluded.applied_at,expires_at=excluded.expires_at;
  -- Removal is an UPDATE tombstone, so member-authorized Realtime stays simple.
  return query select * from public.get_conversation_magic(target_conversation);
end;
$$;
revoke all on function public.get_conversation_magic(uuid),public.set_conversation_magic(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.get_conversation_magic(uuid),public.set_conversation_magic(uuid,text,integer) to authenticated;
alter publication supabase_realtime add table public.conversation_magic;
commit;
