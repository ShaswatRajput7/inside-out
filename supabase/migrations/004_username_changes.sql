-- Additive: no existing accounts, profiles, messages, or memberships are rewritten.
-- Apply before deploying the change-username Edge Function. Do not rerun 001/002/003.
begin;

-- Supabase's Auth API owns the email/identity update. This trigger participates in
-- that same transaction, so a profile uniqueness failure rolls back the Auth change.
-- Mutable user_metadata is deliberately not an authority for the username.
create function private.sync_username_from_auth() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uname text := split_part(new.email, '@', 1);
begin
  if uname is null or uname !~ '^[a-z0-9_]{3,24}$'
     or new.email is distinct from uname || '@insideout.invalid' then
    raise exception 'Invalid Inside Out username or identity';
  end if;
  update public.profiles set username=uname,
    display_name=case when display_name=username then uname else display_name end
  where id=new.id;
  if not found then raise exception 'Inside Out profile unavailable'; end if;
  return new;
end;
$$;
create trigger on_auth_username_changed after update of email on auth.users
for each row when (old.email is distinct from new.email)
execute function private.sync_username_from_auth();
revoke all on function private.sync_username_from_auth() from public,anon,authenticated;

-- Fail closed if the function is deployed before its migration or the trigger is disabled.
create function public.username_change_ready() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from pg_catalog.pg_trigger
    where tgrelid='auth.users'::regclass and tgname='on_auth_username_changed'
      and tgenabled in ('O','A') and not tgisinternal
      and tgfoid='private.sync_username_from_auth()'::regprocedure);
$$;
revoke all on function public.username_change_ready() from public,anon,authenticated;
grant execute on function public.username_change_ready() to service_role;
commit;
