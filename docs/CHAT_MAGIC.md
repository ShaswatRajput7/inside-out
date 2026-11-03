# Chat Magic

Direct conversations have a sparkles button beside the theme button. Choose an animated atmosphere, choose a duration, and apply. Both participants share one server-timed setting, and either can replace or remove it. Groups do not expose this feature. It is appearance metadata, never a message or notification.

All twelve atmospheres have distinct procedural motion: twinkling stars; recurring meteor trails; rotating/drifting sakura petals; living fireflies and trails; flowing aurora curtains; rising hearts and small sparkle blooms; slow gold confetti and occasional bursts; layered snowflakes; iridescent bubbles; expanding cosmic waves; shifting sunlight and dust; and fluttering, drifting butterflies. No emoji graphics, image/video downloads, external animation services, 3D engines, or new packages are used.

## Duration and expiry

Presets: 5, 15, 30 minutes; 1, 3, 6, 12, 24 hours. Custom: integer minutes from 1 to 1,440. The database accepts only integer seconds between 60 and 86,400 and generates both timestamps itself. The client cannot supply an expiry or actor.

The response includes `server_now`, even for an unset conversation. The hook anchors the local clock to this value with a round-trip estimate. A lightweight one-second check updates React only when the visible minute label or active state changes; it does not write to Supabase. The renderer independently checks expiry before drawing. Refresh, online, visibility/wake events and a visible-tab 30-second reconciliation fetch recover missed changes. Sleep or clock discontinuities pause the effect until a fresh server reading arrives. Initial client date skew is ignored.

Expired settings are immediately treated as inactive by the UI. Their bounded metadata row may remain in PostgreSQL until the next change. Removal writes an inactive tombstone with equal timestamps so both participants receive a simple Realtime UPDATE. **No Cron job, Edge Function, file cleanup, new Storage bucket, or secret is needed.**

The existing theme remains mounted underneath the temporary tint/Canvas layer. Message bubbles and controls stay above it; the animation layer has no pointer events. Expiry/removal removes only that layer, restoring the exact selected built-in/custom background without modifying `conversation_themes`.

## Performance and compatibility

- One active Canvas scene per conversation, with genuinely different scene geometry rather than one recolored particle system.
- Approximately 13–120 primary elements depending on the scene, capped at 30 drawn frames per second. DPR is capped at 1.5 (1 for very large canvases); mobile/preview density is lower.
- Small cached glow and bubble sprites avoid per-particle shadow filters. All artwork is procedural and bundled.
- RequestAnimationFrame stops when hidden, offscreen, unmounted, or behind the picker/theme modal. The picker runs only its selected large preview; card animations run on hover/focus/selection and pause in hidden tabs.
- `prefers-reduced-motion` draws a calm still scene and disables card animation. It does not disable the expiry timer or shared setting.
- Browser and Tauri share the same React/Canvas code. No native capability, Rust dependency, CSP, Cloudflare routing, or desktop packaging change is needed.

These are implementation limits, not claimed CPU/GPU benchmark results. Windows/Linux native execution has not been retested for this feature.

## Database and Realtime

`005_chat_magic.sql` adds only `conversation_magic` plus two narrowly scoped RPCs:

- `get_conversation_magic(target_conversation)` returns the member-visible setting and database clock.
- `set_conversation_magic(target_conversation,effect_key,duration_seconds)` validates direct membership, effect and duration; serializes updates on the conversation; and upserts one shared row. Passing null for the effect removes magic.

The table stores `conversation_id`, `effect_id`, `applied_by`, `applied_at`, `expires_at`. Authenticated users have SELECT via RLS; direct INSERT/UPDATE/DELETE are revoked. Anonymous callers and group conversations are denied. No existing user, message, membership, theme or conversation row is rewritten by the migration.

The migration adds `conversation_magic` to `supabase_realtime`. Its changes reuse the **existing opened-conversation private message channel**, including reconnect cleanup. No extra Presence/Broadcast channel, global subscription, heartbeat, or new private-topic policy is added. If the RPC/migration is absent, the message hook omits that optional binding so ordinary messaging can still connect. Refresh open clients after backend rollout so they attach the new binding.

## Rollout (backend completed 2026-11-03)

The owner approved deployment to project `pltouimydjmomxrrbnoi`. Preflight confirmed migration 005 was absent. Applied **only migration 005**; the table, member-restricted RPCs and Realtime publication entry are now configured. No Edge Function, Storage, secret, scheduler, authentication setting or existing record required modification. No database reset or backup was performed, in accordance with the owner's backup waiver.

Verified RLS is enabled, authenticated users have SELECT and RPC execution but no direct mutation privileges, anonymous RPC access is denied, and `conversation_magic` appears exactly once in `supabase_realtime`. The real REST API returned **401 / 42501** for anonymous read and write attempts.

A server-side authenticated-role test exercised two existing DM members: applying an atmosphere, reading identical shared timestamps, peer replacement/removal, invalid-duration rejection, and outsider denial through both table RLS and RPCs. **The entire test transaction was rolled back**, so it committed no appearance setting or Realtime event. These are database-role tests, not two signed-in browser sessions.

Before/after fingerprints preserved 10 Auth users, 10 Auth identities, 10 profiles, 8 conversations, 16 memberships, both existing theme rows, and every field compared on all 211 original messages. Messages increased to 212 due to concurrent activity; the new message was retained. No original record was missing or changed. Fingerprints are temporary local verification records, not backups, at `/private/tmp/inside-out-magic-before.json` and `/private/tmp/inside-out-magic-after.json`.

**Frontend publication remains pending.** Refresh/reopen the local app to attach the new table binding, then run the two-session checklist below. Do not rerun migration 005 on this project.

The following commands are retained for future projects or reference, when migration 005 is absent and rollout is approved:

```sh
cd /Users/shaswatkumar/Code/inside-out
# If present, inspect it instead of rerunning the migration.
npx --yes supabase@3.0.0 db query --remote=pltouimydjmomxrrbnoi --read-only \
  "select to_regclass('public.conversation_magic') is not null as already_applied;"
npx --yes supabase@3.0.0 db query --remote=pltouimydjmomxrrbnoi \
  --file supabase/migrations/005_chat_magic.sql --yes
npx --yes supabase@3.0.0 db query --remote=pltouimydjmomxrrbnoi --read-only \
  "select schemaname,tablename from pg_publication_tables where pubname='supabase_realtime' and tablename='conversation_magic';"
```

Do not reset the database or rerun migrations 001–004. No Realtime service settings need changing. Publish the normal frontend only after approved backend setup, then refresh/reopen clients. No additional hosting configuration is needed.

## Verification

Run `npm run lint`, `npm test`, `npm run build`. **77 tests pass**, including 14 new checks using real PostgreSQL/PGlite and pure clock logic: all previous rows preserved, all 12 shared effects, either-member changes/removal, no group/outsider/anonymous access, denied direct writes, server timestamps, duration bounds, expiry after reopening, initial clock skew, sleep/wake resync, and unchanged original theme/history. No large test framework was added.

The real picker/renderer components were exercised in an isolated local browser fixture without signing in or writing to Supabase: all 12 selections, live scene rendering, custom duration validation, applying Aurora for 42 minutes, readable messages and visible countdown, sending a local text message beneath an active atmosphere, and removal retaining the exact original Purple Hour image URL while removing the atmosphere layer. Temporary fixture files were removed after checks. Hosted RPC/RLS checks passed as described above; two-account browser Realtime, actual cross-device sleep/wake, and native desktop rendering remain manual verification after frontend rollout.

Manual checklist:

1. A and B open their DM in separate sessions. A applies an effect for five minutes; B sees the same effect and expiry, including after refresh/reopening. Check a group has no Magic control and cannot call its RPC.
2. B replaces A's selection, then removes it. Both clients update; original built-in/custom theme, messages, reactions and memberships remain intact. An outsider must not read the row or change the setting.
3. Leave a five-minute effect open until expiry. Animation and header indicator disappear automatically and the original theme returns. Repeat with a minimized/hidden app or sleep/wake. Do not backdate real production rows for testing.
4. Try the eight presets, valid custom minutes, zero/negative/fractional/over-24-hour durations, and rejected direct table writes. Server-side validation must also deny unsupported effect IDs and supplied timestamps.
5. Send/edit/react to text/image messages while effects run. Open the picker/theme modal, switch chats, reconnect and log out; no animation or listener should survive the old conversation. Check reduced-motion mode is calm, and inspect each scene on macOS/Windows/Linux when native builds are available.
