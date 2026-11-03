# Username changes and compact message actions

Open the settings icon beside your account at the bottom of the sidebar, enter a new username, and save. Usernames remain unique and case-insensitive, with 3–24 ASCII letters/numbers/underscores. After a rename, log in with the **new username and the same password**. Your UUID, existing conversations, memberships, messages, reactions, and images stay attached to the same account. The previous username becomes available for another account. Display names that matched the old username follow the rename; any independently customized display name is preserved.

Your messages have a three-dot button at the top-right of the bubble. It opens Edit message (text only) and Delete message; delete still requires confirmation. Reactions retain their separate button beside the timestamp on all eligible messages. Other people's messages offer reactions only. The menu supports outside click, Escape, arrow keys, Home/End, and positioning within the window; it closes when scrolling or resizing.

## How authentication stays consistent

`change-username` is a small authenticated Supabase Edge Function. It obtains the caller from `auth.getUser(token)` and calls the official server-only `auth.admin.updateUserById` for that exact user, confirming only the app's reserved synthetic identity. It never accepts a target user ID, email, password, or service key from the client. It preserves existing user metadata.

Migration **004** adds an Auth email-update trigger that synchronizes the corresponding `public.profiles` username inside the **same Auth transaction**. An invalid/duplicate profile username rolls back the whole change, including Auth's identity update. The trigger derives the username from the confirmed synthetic email, never mutable user metadata. Direct profile/Auth writes remain denied to ordinary clients. No existing rows are rewritten when applying the migration, and no new tables, dependencies, frontend environment variables, or custom secrets are required.

The server-only `username_change_ready()` RPC checks the trigger is enabled before the Edge Function attempts any rename. The client refreshes its cached Auth session and updates the account immediately. Other sessions refresh their own profile within 15 seconds or on focus/online; existing conversation/history reconciliation updates friends' names. Password storage stays entirely in Supabase Auth.

This approach avoids public email-change confirmation links to the reserved `.invalid` domain. Supabase's supported [Admin update API](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid) handles its Auth schema; app code does not directly update `auth.users` or `auth.identities`.

## Backend rollout (completed 2026-11-03)

The owner approved deployment of the username backend to `pltouimydjmomxrrbnoi`. Preflight confirmed that migration 004 and its trigger were absent and current login/profile mappings were consistent. Applied **only migration 004** and deployed **only change-username**, which is ACTIVE at version 1 with `verify_jwt=false` as designed. The existing cleanup function remains ACTIVE at its original version 1.

Verified the enabled trigger and `username_change_ready()=true` from the database owner. Only the server role has RPC access; anonymous and authenticated clients do not. The CLI's restricted `--read-only` role is intentionally denied this server-only function, so the readiness command below uses an explicit read-only transaction under the database owner instead.

The deployed endpoint returned **401** for anonymous requests and invalid user tokens, and **200** for the browser CORS preflight. Before/after fingerprints showed no missing or changed records among 10 Auth users, 10 Auth identities, 10 profiles, 8 conversations, 16 memberships, and all 200 existing messages. The comparison includes account email mappings and password hashes without exposing their values. No existing account was renamed, and no password was changed. No reset, DROP TABLE, TRUNCATE, or backup was performed.

Frontend publication remains pending. A real signed-in rename followed by password login is still a manual check; use the local frontend or an approved published build and the checklist below.

The following commands are retained for reference/future projects. **Do not rerun migration 004 on this project.**

1. Apply **only** `supabase/migrations/004_username_changes.sql`. Do not reset the database or rerun 001–003. On a new project, run all repository migrations in order.
2. Deploy only the new function after its migration. The handler validates the real user JWT itself; `verify_jwt=false` does not make renaming anonymous. Supabase automatically supplies its server-only `SUPABASE_SERVICE_ROLE_KEY`; never put it in a `VITE_*` value.
3. Verify readiness, then publish the normal shared React frontend when authorized. Cloudflare/Tauri configuration and routing are unchanged.

From this repository, for a project where the migration is absent and rollout is approved:

```sh
cd /Users/shaswatkumar/Code/inside-out
# Read-only preflight: if this returns true, review the existing migration; do not rerun it.
npx --yes supabase@3.0.0 db query --remote=pltouimydjmomxrrbnoi --read-only \
  "select to_regprocedure('public.username_change_ready()') is not null as already_applied;"

npx --yes supabase@3.0.0 db query --remote=pltouimydjmomxrrbnoi \
  --file supabase/migrations/004_username_changes.sql --yes
npx --yes supabase@3.0.0 functions deploy change-username \
  --remote=pltouimydjmomxrrbnoi --no-verify-jwt --use-api --yes
npx --yes supabase@3.0.0 db query --remote=pltouimydjmomxrrbnoi --yes \
  "begin transaction read only; select public.username_change_ready() as ready; commit;"
npx --yes supabase@3.0.0 functions list --remote=pltouimydjmomxrrbnoi
```

Expect `ready=true` and `change-username` ACTIVE with JWT verification off. The deploy command uses Supabase bundling and needs no Docker. No backup approval is a prerequisite; the owner's prior backup waiver remains in effect.

## Verification

Locally checked: lint, production build, Deno type-check, and **63 passing tests**, including nine new username tests. New tests run the SQL in PostgreSQL/PGlite and check additive migration preservation, UUID/password-hash/history/membership preservation, duplicate/invalid rollback, old-name reuse for registration/renaming, custom display names, metadata spoofing, denied direct mutations, server-only readiness, caller-only Admin API targeting, normalization, retries, and collision errors. The Auth transaction is simulated locally; real hosted Auth password login/rename still requires deployment and a manual account test.

Actual React components were checked in a local-only browser fixture without signing in or writing to Supabase: valid/invalid username form states, own/other message menus, keyboard Edit, Delete confirmation/cancel, and shared emoji picker opening. The temporary fixture is removed after verification.

After backend rollout, use two existing test accounts:

1. From account A, try account B's username and an invalid username: both rejected; A's current login still works.
2. Rename A to an unused name. Verify account/sidebar updates, unchanged message history and group membership, and B sees the new name after refresh/reconciliation.
3. Reload A, log out, then log in with the new username and original password. The old username should no longer sign in to A. Keep the new username noted before logging out.
4. Check a second open A tab refreshes to the new username. Retry the same rename after a lost response: it is idempotent.
5. On A's message, open three dots: edit/save and delete only a disposable QA message. On B's message, only Add reaction should appear. Check Escape/outside click and a narrow window.

No live account was renamed or password changed during verification or deployment. No web publication or desktop installer was generated by this task.
