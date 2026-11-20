# Shadow Mode and Clear Chat

Shadow Mode is a device preference (`inside-out:shadow-mode` in localStorage), shared across conversations and browser tabs, defaulting off. Cached random common words replace message content; source whitespace and approximate text length are retained. Only the rendered content changes. Nothing masked is sent to Supabase.

Hold a bubble with the left mouse button, or hold its eye button on touch (250 ms threshold, so taps do not reveal). Focus the eye and hold Space or Enter for keyboard access. Release, cancellation, pointer exit, focus loss, tab visibility changes, scrolling, and conversation changes hide the content. One reveal can be active at a time. Images stay blurred except during a hold. Editing, image previews, downloads, selection and message copying are blocked in Shadow Mode. Emoji reactions, themes, Chat Magic, names and timestamps are retained. The composer remains available for writing new messages.

Both web and Tauri notification paths replace bodies with “New message” in Shadow Mode and recheck the stored preference at delivery. Existing OS notifications already delivered before enabling the mode cannot be recalled by this feature. This is visual privacy, not encryption or protection against developer tools. The current app has no sidebar message previews or message search UI to mask.

Clear Chat is in direct chats' three-dot conversation menu. Its confirmation explains that only the current user's view changes and that clearing cannot be undone. `clear_conversation_history` takes only a conversation ID, checks authentication, direct-chat type and membership, locks the caller's membership, and sets `cleared_at` using server time. It also advances the read cursor. No shared messages, reactions, images, or Storage files are deleted or changed.

Message SELECT RLS filters every retrieval path using the caller's cutoff, including pagination, ID fetches, future search queries and Realtime subscriber authorization. Related reactions, image metadata and Storage reads respect the same cutoff. Unread aggregation explicitly excludes cleared history. The open conversation remounts after a successful clear to discard loaded history and in-flight requests; membership Realtime and polling propagate clears from another session. New messages after the cutoff are available normally. Existing keyset pagination and message Realtime synchronization remain in use.

## Files

- `src/lib/shadow.js`: word bank, masking and preference lookup.
- `src/hooks/useShadowMode.js`, `useHoldReveal.js`: preference synchronization and hold lifecycle.
- `src/components/ShadowMessage.jsx`: masked text and accessible reveal control.
- `src/components/ChatWindow.jsx`, `MessageList.jsx`, `ImageMessage.jsx`: toggle, clear dialog/menu and privacy-safe rendering.
- `src/pages/Chat.jsx`: device preference and history lifecycle.
- `src/hooks/useChatActivity.js`, `src/platform/notifications.js`: notification privacy and unread refresh.
- `src/services/chatService.js`: membership cutoff loading and clear RPC.
- `src/index.css`: small controls, blur and selection styles.
- `supabase/migrations/006_private_history.sql`: additive cutoff column, secure RPC and read policies.
- `tests/private-history.test.js`, `shadow.test.js`, `shadow-ui.mjs`, `fixtures/shadow.*`: database, notification, masking and browser regression checks.

## Verification

`npm test` runs isolated PostgreSQL-compatible PGlite tests with Alice, Bob and an outsider. Coverage includes the full migration chain, data preservation, direct-only clearing, caller-only permissions, other chats/groups, 65+ old messages, ID fetches, SQL search, pagination, reactions, image metadata and Storage authorization, unread reset, fresh incoming messages and persisted cutoffs across sessions. The shadow tests cover random word variety, approximate size, whitespace, source-word exclusion, and both web and Tauri notification delivery with mocked OS notifications.

The optional browser regression script requires Playwright and installed Google Chrome (no production dependency added). Start `npm run dev -- --port 5174`, then run `SHADOW_TEST_URL=http://127.0.0.1:5174 node tests/shadow-ui.mjs`. It uses a local fixture with mocked image downloads and blocks Supabase network calls. It checks mouse, native Chromium touch input, keyboard, one-at-a-time reveal, release/cancel/blur/scroll/visibility behavior, stable masking on unrelated renders, new incoming messages, blur/reveal, disabled previews/downloads, copying, conversation switching and reload persistence.

Run `npm run lint`, `npm run build`, and `npm run desktop:build -- --no-bundle` for source and production checks. Windows/Linux native builds and OS-level notification rendering must be checked on those platforms.

## Rollout

1. Migration `006_private_history.sql` was reviewed, explicitly approved, and applied to the existing live Supabase project on 2026-11-20. No backup was requested or created; no reset or record deletion was performed. See the rollout result below.
2. Apply it after migrations 001–005 through the project's usual migration process. It adds a nullable column without rewriting existing message data. Do not reset the database.
3. Release the updated web and desktop clients after the migration; the new client selects `cleared_at` and needs the migration present.
4. In staging with two real accounts, send enough messages to paginate plus an image and reaction. Clear as Alice; verify Alice's empty history, zero unreads and persistent hiding after reload, while Bob retains everything. Send new messages in both directions and check Realtime, reconnect, pagination and unread counts. Clear in another Alice tab and verify the active chat reloads.
5. Enable notifications and background the app. Verify Shadow Mode hides real bodies in browser and native OS notifications. Check mouse, touch and keyboard holds on target devices and themes/Chat Magic while enabled.

The isolated fixtures do not exercise real browser sessions or actual OS notification rendering. The rollback-only production database checks below verify the deployed RPC and policies under both participant roles, while end-to-end browser/Realtime and OS checks remain manual.

## Rollout result — 2026-11-20

The owner approved the rollout after migration review and waived a backup. The frontend `.env`, recorded project configuration and authenticated Supabase project listing identify **Inside Out Project**, `pltouimydjmomxrrbnoi` (`eu-central-1`, PostgreSQL 17.11), which was healthy.

Migration 005 was verified directly from the live schema: `conversation_magic`, its constraints and member policy, the Realtime publication entry and both RPCs were present; both RPC source hashes exactly matched 005. The replacement function source hashes from 002 also matched the expected baseline. This project has no `supabase_migrations.schema_migrations` table because earlier migrations were applied through SQL Editor. No `db push`, history repair, reset, or baseline replay was used.

Only the reviewed `006_private_history.sql` was applied with the authenticated CLI's explicit production target. It adds one nullable column and changes policies/functions/grants inside a transaction. It does not run DML against existing records during migration, delete data, change Auth users, or touch Storage files. The UPDATE inside the new RPC runs only when an authenticated member invokes Clear Chat.

Post-application checks confirmed all six deployed function bodies match 006 exactly, with fixed empty search paths and security-definer execution. The new cutoff is nullable with no default. Anonymous RPC execution is denied; authenticated execution is allowed; direct authenticated membership/cutoff updates remain denied. Message, reaction, image metadata and Storage policies use the intended cutoff-aware checks.

A live rollback-only transaction used an existing direct conversation and switched to each participant's authenticated database role. Checks passed for A's empty history and zero unreads after clearing, B's retained complete history and unchanged membership, B's independent clear, fresh messages visible to both, new incoming unread counts and read cursor, and another A clear leaving B's new history intact. The transaction rolled back every test cutoff and QA insertion. No actual participant was left with a cleared history; all 16 `cleared_at` values were null afterward.

Before/after counts and non-reversible row fingerprints matched for all existing records. These are verification aggregates, not a backup or record export:

| Data | Unchanged rows |
| --- | ---: |
| Auth users / profiles | 10 / 10 |
| Conversations / memberships | 8 / 16 |
| Messages / reactions | 460 / 5 |
| Image metadata / Storage objects | 7 / 15 |
| Conversation themes / Chat Magic | 3 / 3 |

Local rollout checks passed: `npm run lint` with zero warnings, all 80 `npm test` checks, and `npm run build`. The implementation's mouse/touch/keyboard browser suite and macOS native release build had already passed before this rollout.

Frontend publication is pending at the owner’s explicit request. The existing `wrangler.toml` targets the static `dist` output and the documented Pages project is `inside-out`. Wrangler reported no authenticated account. Automatic approval review blocked opening OAuth with `account:read`, `user:read`, and `pages:write` until the owner explicitly approves the access grant. The owner then chose “Leave frontend deployment pending.” No OAuth flow, frontend deployment or Cloudflare configuration change occurred.

If frontend rollout is resumed later: explicitly authorize the Cloudflare access grant, complete Cloudflare sign-in, verify that the existing `inside-out` Pages project belongs to the intended account, deploy this built frontend to its production branch, and verify the production HTML/assets. No database migration needs to be rerun. Remaining manual checks: two real logged-in browser/device sessions, live Realtime/reconnect and cross-tab clears, real OS notification privacy, and Windows/Linux native behavior. Do not clear a real conversation for testing unless that participant intends to hide its history.
