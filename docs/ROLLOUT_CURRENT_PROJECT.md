# Inside Out: current project rollout

Target: **Inside Out Project**, project ref `pltouimydjmomxrrbnoi`, URL `https://pltouimydjmomxrrbnoi.supabase.co`, Free plan. Repository: `/Users/shaswatkumar/Code/inside-out`.

## Deployment completed on 2026-11-02

The owner explicitly waived the database backup and approved backend deployment. CLI login was verified. No backup was required or created, and the existing migration was **not rerun**. No database reset, DROP TABLE, TRUNCATE, or destructive data migration was executed.

- `cleanup-images` is **ACTIVE**, version 1, with `verify_jwt=false`; the handler enforces its own authorization.
- `IMAGE_CLEANUP_SECRET` is installed server-side and mirrored in Vault. Its local maintenance copy is `supabase/functions/.env` (ignored by Git, permissions 0600). No secret was added to frontend configuration. The temporary SQL file containing the setup value was removed after use.
- Enabled `pg_cron` 1.6.4 and `pg_net` 0.20.4; existing Vault 0.3.1 was retained. Created the two named Vault entries without overwriting existing values.
- Job ID **1**, `inside-out-image-cleanup`, is active at `17 3 * * *`; Cron timezone is GMT, so this is **03:17 UTC / 08:47 IST daily**.
- A real invocation through pg_net + Vault (request ID 1) returned **HTTP 200**, `{"removed":0,"failed":0}`, no timeout or error. Anonymous and incorrect-secret requests returned **401 Unauthorized**. There were no image objects eligible for cleanup, so this verifies the deployed worker and scheduler's HTTP/auth path, not a physical file deletion.
- Before/after fingerprints retained all 10 Auth identities, 10 profiles, 8 conversations, 16 memberships, and all 160 original messages with no changes to compared fields. Messages increased to 163 due to concurrent activity; the three additions were retained. Fingerprint artifacts are local temporary files `/private/tmp/inside-out-original-records-before.json` and `/private/tmp/inside-out-original-records-after.json`; they are verification records, not backups.

Remaining: run the two-account checklist in step 5, verify an actual disposable image upload/deletion, and inspect the first scheduled daily run. Frontend publication and switching off public Realtime channels were deliberately left pending for the separate cutover in step 6. No further backend setup commands need to be rerun.

## Initial read-only audit on 2026-11-02 (historical, before deployment)

| Item | Observed state |
| --- | --- |
| Existing records | 10 Auth users, 10 profiles, 8 conversations, 16 memberships, 132 messages |
| Migration 002 | Already present: all new columns/tables, 15/15 function source hashes match the repository |
| Permissions | New tables have RLS; direct client message UPDATE/DELETE and cleanup RPC access are denied |
| Storage | `chat-images` is private, limit 512000 bytes, MIME WebP/JPEG/PNG, only the two intended object policies |
| Publication | `messages`, `conversation_members`, `conversations`, `message_reactions` are included |
| Realtime | Enabled; correct private topic policies exist; **Allow public access is still on** |
| Edge Functions | No deployed functions; no custom secrets |
| Cleanup | Vault is installed; pg_cron and pg_net are available but not enabled; no images are queued |
| Backup / CLI | Dashboard reports no backups; CLI needs login; no database password supplied |

A later read-only fingerprint baseline contained **137 messages** with the other counts unchanged; live activity continued during this audit. Re-capture the snapshot during the actual quiet rollout window. The captured baseline is saved locally at `/private/tmp/inside-out-before-cleanup-baseline-2026-11-02.json`; move it alongside your private backup if you want to keep it, since temporary files are not durable backups.

The SQL migration was reviewed: no existing rows are deleted/replaced, Auth users/profiles/conversations are untouched, and original message/membership fields are not rewritten. It adds fields with defaults, new tables, indexes, functions/policies, bucket configuration, and a publication entry in one transaction. Existing messages default to text; old history initializes as read. A local database test compares **every original row and column** in all five original tables before/after 002 and passes.

There is no historical hosted pre-migration snapshot available here, so the initial audit cannot prove a historical before/after count for the earlier application of 002. The current hosted data is present. The initial audit was read-only; the later authorized infrastructure changes are recorded above.

## 1. Optional backup and baseline (backup waived for this rollout)

**For the completed rollout, the owner declined the backup and accepted the risk. Do not require another backup approval.** The commands below remain available as optional maintenance instructions; they are not outstanding prerequisites. The before/after preservation baseline was recorded and compared during deployment.

Do not run 001, 002 again, `db reset`, or a general `db push`: this project's baseline was applied through SQL Editor and has no CLI migration history. No database migration is needed on the audited target.

For a free, Docker-free logical backup on your Mac, use PostgreSQL client tools. The connection below was read from this project's **Connect > Direct > Session pooler**. Enter your existing database password at the hidden prompt; do not paste it into chat, command text, or the repository. The archive contains private account data; keep it private. Installing libpq does not install/start a database server.

```sh
cd /Users/shaswatkumar/Code/inside-out
brew install libpq
umask 077
mkdir -p "$HOME/inside-out-backups"
INSIDE_OUT_BACKUP_FILE="$HOME/inside-out-backups/inside-out-before-cleanup-$(date -u +%Y%m%dT%H%M%SZ).dump"
PGSSLMODE=require "$(brew --prefix libpq)/bin/pg_dump" \
  --host=aws-1-eu-central-1.pooler.supabase.com --port=5432 \
  --username=postgres.pltouimydjmomxrrbnoi --dbname=postgres --password \
  --format=custom --no-owner --no-privileges --file="$INSIDE_OUT_BACKUP_FILE"
"$(brew --prefix libpq)/bin/pg_restore" --list "$INSIDE_OUT_BACKUP_FILE" > "$INSIDE_OUT_BACKUP_FILE.contents.txt"
```

Continue only if pg_dump succeeds and the archive list includes the Auth and application tables. This verifies archive readability, not a tested restore. Database dumps include Storage metadata, not actual image bytes; there are currently no uploaded images in the new image table.

In SQL Editor run [preservation_snapshot.sql](../supabase/setup/preservation_snapshot.sql) and export/save the five rows. This is read-only, uses original fields only, and exposes no message content or credentials. It is a verification baseline, not a backup. Run it again after infrastructure setup and before testing; values should match while friends are not sending/editing messages or changing accounts/memberships. Legitimate activity changes fingerprints. [messaging_upgrade_preflight.sql](../supabase/setup/messaging_upgrade_preflight.sql) provides a repeatable, read-only schema/policy audit.

**Approval gate:** obtain explicit approval before steps 3–4 (secret upload, function deployment, extensions, Vault entries, daily job). Keep frontend publication and the public-channel switch as a separate cutover approval after local testing.

## 2. Authenticate the CLI (manual login)

```sh
cd /Users/shaswatkumar/Code/inside-out
npx --yes supabase@3.0.0 login
npx --yes supabase@3.0.0 projects list
```

Complete the login yourself. Confirm the list contains `pltouimydjmomxrrbnoi`. The commands below explicitly target this ref, so no `supabase link` or database-password sharing is needed for function deployment. The pinned CLI's help was checked locally; v3 uses `--remote` here.

## 3. Configure and deploy only cleanup-images (after approval)

Generate a random secret locally without overwriting an existing file or printing its value:

```sh
cd /Users/shaswatkumar/Code/inside-out
node --input-type=module <<'JS'
import fs from 'node:fs'
import { randomBytes } from 'node:crypto'
const file = 'supabase/functions/.env'
if (fs.existsSync(file)) {
  console.log('Keeping existing secret file; review it locally before upload.')
} else {
  fs.writeFileSync(file, `IMAGE_CLEANUP_SECRET=${randomBytes(32).toString('hex')}\n`, { flag: 'wx', mode: 0o600 })
  console.log('Created ignored server secret file; value was not printed.')
}
JS
git check-ignore supabase/functions/.env
npx --yes supabase@3.0.0 secrets set --remote=pltouimydjmomxrrbnoi --env-file supabase/functions/.env
npx --yes supabase@3.0.0 functions deploy cleanup-images --remote=pltouimydjmomxrrbnoi --no-verify-jwt --use-api
npx --yes supabase@3.0.0 functions list --remote=pltouimydjmomxrrbnoi
```

Expected: `cleanup-images` is active. Verify in Dashboard > Edge Functions that JWT verification is off; this handler validates either the dedicated cleanup secret or a real user JWT itself. It does not permit anonymous cleanup. Supabase supplies its built-in server credentials; do not add any service-role key to frontend variables. `--use-api` avoids Docker. Do not use `--prune` or deploy all functions.

## 4. Schedule daily cleanup inside Supabase (after approval)

1. In Database > Extensions enable **pg_cron** and **pg_net**. Vault is already enabled. Use the Free project; no paid upgrade, GitHub scheduler, or continuously running server is needed.
2. Open Vault (Dashboard > Integrations > Vault, or search for Vault). Create exactly one secret of each name:
   - `inside_out_project_url` = `https://pltouimydjmomxrrbnoi.supabase.co`
   - `inside_out_image_cleanup_secret` = the exact `IMAGE_CLEANUP_SECRET` value in the ignored local file. Open it locally with `open -a TextEdit supabase/functions/.env`; copy the value only. Do not rotate one copy independently. If a named Vault entry already exists, review it instead of creating duplicates.
3. In SQL Editor run the complete [schedule_image_cleanup.sql](../supabase/setup/schedule_image_cleanup.sql). It creates/replaces only `inside-out-image-cleanup`, at **03:17 UTC daily / 08:47 IST**. Normal Supabase free-tier limits apply; a paused project cannot run cleanup until resumed. Access expiry is still checked immediately in SQL/UI; physical removal happens on the next successful daily sweep (up to roughly one day later).
4. Verify the job without printing its secret:

```sql
select jobid,jobname,schedule,active
from cron.job where jobname='inside-out-image-cleanup';
select name from vault.secrets
where name in ('inside_out_project_url','inside_out_image_cleanup_secret');
```

Run a manual smoke invocation after approving cleanup of queued/expired images. The read-only audit found zero queued images; recheck the queue if time has passed. This starts the real worker and can permanently remove images eligible for cleanup. In SQL Editor run:

```sql
select net.http_post(
  url := 'https://pltouimydjmomxrrbnoi.supabase.co/functions/v1/cleanup-images',
  headers := jsonb_build_object('Content-Type','application/json','x-cleanup-secret',
    (select decrypted_secret from vault.decrypted_secrets where name='inside_out_image_cleanup_secret')),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
) as request_id;
```

After the transaction commits, run the next query separately with that request ID:

```sql
select id,status_code,timed_out,error_msg,content
from net._http_response where id=YOUR_REQUEST_ID;
select j.jobname,d.status,d.start_time,d.end_time,d.return_message
from cron.job_run_details d join cron.job j using(jobid)
where j.jobname='inside-out-image-cleanup' order by d.start_time desc limit 5;
```

Expected HTTP 200, `failed: 0`; with an empty queue, `removed: 0`. A new daily job has no run history until its first scheduled execution. A successful cron SQL run alone does not prove the HTTP call succeeded: also check `net._http_response` / Edge logs. Recheck the read-only preservation snapshot before creating test messages.

## 5. Test locally with two accounts before the public cutover

```sh
cd /Users/shaswatkumar/Code/inside-out
npm run lint
npm test
npm run build
npm run dev -- --port 5173 --strictPort
```

If port 5173 is occupied by your existing dev server, use that server instead of stopping it. The existing `.env` already targets this Supabase project. Open `http://localhost:5173` in two separate browser profiles (or normal + private window); sign into existing account A and account B yourself. Do not share passwords in chat. Test messages are real database writes: use clearly marked **disposable QA messages**, and only delete those.

| Check | Account A / Account B | Expected |
| --- | --- | --- |
| Regression | Both log in; open old history; search each other's exact usernames; open existing DM and a test group | History intact, no public directory, both text flows work |
| Emoji/edit/delete | A sends `QA 👩🏽‍💻`, searches the picker, inserts at mid-cursor, edits, then deletes only that QA message | B sees text, edited label, tombstone; original timestamp stable |
| Reactions | Both choose several Unicode sequences/tones, then toggle a badge | Same counts on both clients; no duplicate per user/emoji; deleted messages cannot react |
| Unreads | B views another chat or scrolls up while A sends; B then actually views latest messages | Badge increases only for A's messages, clears when viewed, stays cleared after reload |
| Presence/typing | A types; opens another A session; closes one; disconnects remaining session | B sees typing disappear after ~3 sec; A stays online while another session remains; offline is approximate |
| Notifications | B explicitly enables sidebar notifications, then unfocuses while A sends text/image | One appropriate notification, click navigates; none for self/history/actively viewed chat |
| Private image | A attaches/pastes a disposable JPEG/PNG/WebP; B opens/downloads it in DM and group | Compressed <=1600 px / <=500 KiB; no public link, sender/date intact |
| Actual deletion | A deletes only the disposable QA image; inspect Storage and Edge logs | B loses access immediately, actual object disappears; no image queued permanently |
| Reconnect | Disconnect B, send from A, reconnect B; switch chats repeatedly | Missed history fetched, edits/reactions reconcile, no duplicates or stale typing |

Two accounts verify normal message flow. For an outsider check, use a new QA group containing only A and verify B cannot read its messages/image or join its private topic. See the full checklist in [MESSAGING_UPGRADE.md](MESSAGING_UPGRADE.md). Test 30-day expiry using a **separate disposable test project**; never backdate real production images. The local automated suite already exercises expiry/authorization and idempotent cleanup. System notification delivery and multi-device behavior still need these live checks; daily scheduling is fully verified only after a scheduled run is observed.

## 6. Private Realtime and frontend cutover (separate approval)

The publication and private policies are already correct. Keep **Enable Realtime service** on. Every upgraded React subscription uses `private: true`; private channels can be tested locally while public access is still allowed.

After the two-account checks pass, approve publishing the upgraded frontend through the existing Cloudflare deployment, then coordinate refreshing old clients and disabling **Realtime > Settings > Allow public access to channels**, and save. Old clients use public channels and can lose live updates once this is disabled; refresh/reopen them on the upgraded build. Do not disable public access early while friends still rely on the old build. No schema reset, database re-creation, Cloudflare environment change, or desktop installer is required. Verify DMs, groups, presence, typing, and reconnect again after the switch.

If an issue appears, keep the additive schema and user data. Diagnose logs/function configuration first; do not reset/drop tables or automatically restore an old database over newer messages. Any emergency restoration needs a separately reviewed plan and approval.
