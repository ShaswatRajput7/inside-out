# Messaging upgrade: rollout and verification

The source implementation is complete. Deploy the backend additions before publishing the updated frontend. Existing accounts, memberships, and message rows are preserved by the incremental migration; do not rerun 001 or reset the database. Check the project-specific status below before running setup commands.

**Rollout update (2026-11-02):** the configured project already had 002 applied, with all 15 function bodies matching this repository. Do **not** apply 002 again. With explicit owner approval and the owner's explicit backup waiver, the cleanup Edge Function, server secret, Vault entries, pg_cron/pg_net, and daily job have now been deployed and verified. All original records were preserved. Frontend publication and the public-channel switch remain pending. See [the project-specific rollout](ROLLOUT_CURRENT_PROJECT.md) for results, exact commands, and two-account checks.

## What changed

- Sender-only text editing and soft deletion with content erased from normal queries; image deletion queues physical Storage removal.
- The full Emoji Mart Unicode collection, search, categories, tones, recents, cursor-aware insertion, and reactions using one reusable picker. Picker code/data are lazy-loaded from the app's own assets, with native Unicode rendering and no emoji CDN.
- Persistent per-membership read cursors and sidebar unread badges. Only other users' non-deleted, non-expired messages count. An IntersectionObserver marks only messages actually visible in a focused/visible window; scrolling through old history does not mark unseen new messages read.
- Private conversation Presence (multiple sessions per user) and throttled Broadcast typing indicators with three-second stale expiry. There is no global online directory or database heartbeat.
- Per-user/device notification setting; permission is requested only when clicking the sidebar control. Browser Notification API / official Tauri notification plugin, live inserts only, own-message and active-chat suppression, and bounded local deduplication with Web Locks when supported. Notifications work only while the app runs.
- JPEG/PNG/WebP selection or clipboard paste, signature validation, 15 MB original limit, Canvas compression to <=1600 px and <=500 KiB, previews and private authenticated downloads. Images can be sent alone or with a caption. WebP is preferred, with JPEG fallback.
- Actual 30-day expiry is derived from Storage's server-side upload timestamp. Access is denied at expiry even before scheduled physical cleanup. Messages retain sender/date/order with an expired-image placeholder.

## 1. Database and Storage (owner action, after approval)

1. Take your normal database backup/export before applying a schema change.
2. Open Supabase SQL Editor and run the complete `supabase/migrations/002_messaging_upgrade.sql` once, after the existing 001 migration. This is one transaction; a SQL failure rolls back the upgrade.
3. Verify the private `chat-images` bucket exists, **Public is off**, max size **512000 bytes**, and MIME types are `image/webp`, `image/jpeg`, `image/png`. The migration configures all of this, along with bucket RLS.
4. Under Database > Publications > `supabase_realtime`, ensure `messages`, `conversation_members`, `conversations`, and **`message_reactions`** are enabled. The first three came from 001; 002 adds reactions.
5. In Realtime Settings, disable **Allow public access** before enabling the upgraded app for friends. All upgraded app channels use `private: true`. The migration supplies `realtime.messages` policies for `conversation:<uuid>` and `conversation:<uuid>:messages`, and own-account activity/conversation channels. Old open app versions should be refreshed during rollout.
6. Keep the existing frontend `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. No new frontend environment variables or secret keys are needed.

### Schema additions

`messages`: `kind`, `image_id`, `edited_at`, `deleted_at`, `updated_at`; existing rows default to text. `conversation_members`: `last_read_at`, `last_read_id`; existing history initializes as read. New tables: `message_reactions` (unique message/user/Unicode emoji) and `chat_image_uploads` (private upload reservations, expiry metadata, durable cleanup leases/retries). RLS and narrowly scoped RPC grants enforce access. Direct message UPDATE/DELETE and direct reaction mutations remain revoked; ownership-checked RPCs perform changes. Original timestamps stay intact.

Storage paths are server-generated `<conversation>/<sender>/<random UUID>.<ext>`. Only a pending reservation's owner/member may upload, with no overwrite or direct client delete path. Only current members can retrieve a ready, unexpired, non-deleted message's image. The frontend uses authenticated Storage downloads and short-lived in-memory blob URLs, not public object URLs or a service-role key. Storage RLS also blocks issuing new signed links after expiry. Anyone who has already downloaded a file can retain that copy; previously issued signed URLs remain usable until their own TTL expires.

## 2. Deploy the cleanup Edge Function (owner action)

The only new server secret is **`IMAGE_CLEANUP_SECRET`**, a long random value. Do not place it in a `VITE_*` variable, frontend bundle, Git commit, or client request. Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions automatically; the service-role key stays server-side.

Using the Supabase CLI, when ready to deploy:

```sh
npx --yes supabase@3.0.0 login
cp supabase/functions/.env.example supabase/functions/.env
# Edit that ignored file with a long random IMAGE_CLEANUP_SECRET (e.g. openssl rand -hex 32).
npx --yes supabase@3.0.0 secrets set --remote=YOUR_PROJECT_REF --env-file supabase/functions/.env
npx --yes supabase@3.0.0 functions deploy cleanup-images --remote=YOUR_PROJECT_REF --no-verify-jwt --use-api
```

The CLI version is pinned because v3 uses `--remote` for these commands. `--use-api` bundles on Supabase, so Docker is not needed. Do not overwrite an existing secret file; the project-specific guide includes a non-overwriting generator.

`supabase/config.toml` also records `verify_jwt = false`. The handler performs its own authorization: a matching dedicated cleanup secret permits a scheduled sweep; a verified normal Supabase Auth JWT only permits cleanup of that user's already queued image. There is no anonymous cleanup operation. The frontend immediately nudges this function after sender deletion/cancel; if unavailable, SQL has already revoked file access and the durable queue remains for a retry.

The worker claims bounded batches with expiring leases, removes objects using `storage.from('chat-images').remove(...)`, and only then marks metadata expired/deleted. Missing objects are treated as already removed. Transient errors retry up to three times per invocation; failed items retain an error and become claimable again. Multiple workers/reruns are safe. A stale pending upload (>1 hour) is also swept, so interrupted uploads do not become permanent orphans. No internal Storage rows are deleted by SQL. Sweep limits are 500 objects / roughly 50 seconds before starting another batch; unusually large backlogs may need repeated runs or a more frequent schedule.

## 3. Schedule daily removal

Supabase documents scheduling Edge Functions using `pg_cron` + `pg_net` and Vault: [official scheduling guide](https://supabase.com/docs/guides/functions/schedule-functions). These use existing project resources and the included function allowance; normal free-tier limits and idle-project pauses still apply.

1. Enable `pg_cron` and `pg_net` in Database > Extensions.
2. In Vault create `inside_out_project_url` containing the project HTTPS URL and `inside_out_image_cleanup_secret` containing exactly the same value as Edge `IMAGE_CLEANUP_SECRET`.
3. Run `supabase/setup/schedule_image_cleanup.sql` in SQL Editor. It replaces only this app's named job and invokes the function **daily at 03:17 UTC**. It contains no hardcoded secret.
4. Verify the job's run status and the HTTP response in `net._http_response`, and inspect Edge logs. A successful response reports `removed` and `failed` counts. Metadata `cleanup_error` and `cleanup_attempts` are accessible to server administration, not normal clients.
5. Test a manual authenticated sender deletion, then check that the actual bucket object disappears. To test 30-day expiry, use a separate test project and move only a disposable fixture's expiry into the past. Never change real users' dates for testing.

If Cron cannot be enabled, use GitHub Actions as the free scheduled alternative within your included Actions quota: create a manually controlled workflow with `workflow_dispatch` and (when ready) `schedule: [{cron: '17 3 * * *'}]`; store `INSIDE_OUT_PROJECT_URL` and `IMAGE_CLEANUP_SECRET` as repository Actions secrets and POST `{}` to `https://<project>/functions/v1/cleanup-images` with `x-cleanup-secret`. The ready-to-copy workflow is `supabase/setup/image-cleanup-workflow.yml`; it is outside `.github/workflows` so it cannot accidentally run before you opt in. Use either scheduler, not both. Keep the project active/resumed for cleanup to execute. Access expiry itself is enforced in SQL and the UI even if a job is delayed.

## 4. Browser/desktop notifications

Click **Notifications off** in the sidebar to request permission and enable. Settings persist per account and device. Disable with the same control. Browser notifications require a supported secure context (HTTPS/localhost); an HTTP LAN URL may not support them. If denied, change the site/system permission and toggle again. There is no request during login or app startup.

Tauri has the official Rust/JS notification plugin registered and only notification plus notification-click window-focus permissions granted. Build from the same React codebase on macOS/Windows/Linux. Browser builds lazy-import the native plugin only in Tauri. Notification clicks navigate/focus when the platform reports an action; Windows Action Center clicks after a toast has disappeared are not always reported by the plugin. Windows native notifications should be tested in an installed development/release app as required by the OS, and macOS/Linux depend on system notification settings. No signing/updater is added.

Cross-tab deduplication uses shared storage and Web Locks where available; fallback browser tags suppress duplicate visible notifications. Separate devices may each show one notification, which is intentional. Notifications are not generated for fetched historical messages or missed-history reconciliation. Presence and typing are approximate on disconnect; Realtime private-channel authorization is cached by Supabase until rejoin/token refresh. Database and Storage permissions are checked immediately for every query. Removing membership also causes this app to remove its channels on its next conversation refresh (at most 15 seconds). Other members filter Presence/typing against their current membership list.

## 5. Publish frontend only after backend setup

Keep the existing Cloudflare Pages build command `npm run build`, output `dist`, and both frontend environment variables. Publish the normal updated React build after the migration/function/private-channel setup is ready. The only header change adds `blob:` to image CSP for private image previews; no routing or hosting configuration changes are needed. Desktop builds use the identical backend and features.

## Verification and manual checklist

Locally verified: production React build; lint; 44 tests (original auth/chat/privacy tests, upgraded SQL/RLS tests against PGlite, Unicode insertion/full picker data, compression bounds/file validation, unread/deletion/image authorization/expiry rules, private topic authorization, notification deduplication, and API-based cleanup retry/missing-file logic); macOS Rust `cargo check` including notification capabilities; Deno type-check of the Edge Function. Browser UI checks use a local-only fixture, with no hosted writes: full picker search/categories/skin-tone controls, repeated mid-draft emoji insertion, Enter-to-send, reaction/edited/deleted/expired states, and actual clipboard Canvas compression (2000×1000 PNG to 1600×800 WebP, 6,818 bytes). File chooser automation was blocked by the browser extension's file-URL access setting; the shared compression path was verified through paste instead.

Hosted verification (2026-11-02): existing 002 function bodies match the repository; private bucket/policies/publication are correct; cleanup-images is ACTIVE with JWT verification disabled as designed; the correct Vault-authenticated pg_net call returned HTTP 200 with `removed: 0, failed: 0`; anonymous/incorrect-secret calls returned 401; the daily job is active at 03:17 UTC. Original-record fingerprints before/after this infrastructure rollout matched for 10 Auth identities, 10 profiles, 8 conversations, 16 memberships, and all 160 original messages. Three new messages arrived concurrently and were retained.

Not yet live-verified: actual Storage uploads/physical deletion (the image queue was empty), the first automatic daily execution, multi-device private channels, system notification delivery/clicks, or Windows/Linux native execution. Migration 002 was already present before this audit, so its original hosted application was not performed or retroactively verified here. Use the manual checklist below; no production dates should be changed for expiry testing.

After rollout, use two accounts/devices (and a third outsider) to check:

- Login, exact username lookup, old history, direct and group text messaging still work.
- Edit a text message containing family/skin-tone emoji; verify edited label and real-time update. Try editing/deleting another user's message through the API: denied.
- Delete a message: tombstone everywhere, empty content through ordinary queries, no edit/reaction allowed.
- Open the full picker, search "developer", switch categories/skin tones, insert in the middle of text multiple times, send emoji-only messages, and use the same picker in edit/reaction flows. Toggle multiple reactions and verify counts across clients.
- Keep one conversation scrolled above the newest message, unfocus another tab/device, and send messages. Check unread badges; only actually visible messages are marked read. A read on one device clears the other device's badge.
- Check online dots across two sessions for one account; closing one should keep the user online while another remains. Check group member dots and typing disappearance after ~3 seconds, disconnect and switch-chat cleanup.
- Explicitly enable notifications; unfocus the window and send text/image messages from the other account. Check sender/group preview, one notification per message per device, click navigation, active-chat/own-message suppression, no notifications for old history, and disabling the setting.
- Attach/paste landscape/portrait JPEG/PNG/WebP, verify aspect ratio and <=500 KiB / <=1600 px outputs, preview then send. GIF, disguised files, and >15 MB originals must be rejected. Try image access as an outsider and after membership removal: denied.
- Download/open a private image, test expiry in a disposable test project, verify expired placeholder and denial before the worker runs. Run cleanup twice; ensure the actual object is gone, metadata remains, and missing-file retry is safe. Test sender deletion and an abandoned upload as well.
- Repeat core flows in the Tauri app; no duplicate channels should remain after switching chats or logout.
