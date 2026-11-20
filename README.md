# Inside Out

A small, private chat app for friends. React + Vite + JavaScript + Tailwind, Supabase Auth/PostgreSQL/Realtime, and Tauri v2. No separate backend server.

## Messaging features upgrade

Editing/deletion, the full emoji picker and reactions, unread counts, private online/typing status,
notifications, and private 30-day image sharing are implemented in the shared React/Tauri source.
The incremental backend upgrade has **not** been applied to the live project. Follow
[the rollout, Storage, cleanup schedule, notification, and testing guide](docs/MESSAGING_UPGRADE.md)
before deploying this frontend. Apply migration 002 after the existing 001; do not reset or rerun 001.

## Run locally

Use Node.js 22.12+ (Node 24 recommended) and npm.

```sh
npm ci
cp .env.example .env
# Fill in the two values in .env using your Supabase project settings.
npm run dev
```

Open http://127.0.0.1:5173. If `.env` is already configured, keep it instead of copying the example over it. Unconfigured builds show a setup screen. Both browser and desktop builds use the same environment variables and backend. These values are embedded at build time, so rebuild after changing them.

```sh
npm run lint
npm test
npm run build
npm run preview
```

## Connect Supabase

1. Create a **free** Supabase project, or use your existing empty Inside Out project. This migration is intended for a new database, with no existing app accounts/tables.
2. Open **SQL Editor → New query**. Paste the entire contents of `supabase/migrations/001_inside_out.sql` and click **Run** once. It creates all tables, constraints, indexes, RLS policies, functions, the Auth trigger, and the Realtime publication entries in a transaction. A failure rolls back everything. Do not rerun it after success.
3. Open **Authentication → Sign In / Providers**. Enable **Allow new users to sign up**, keep **Email** enabled, and disable **Confirm email**, then save. Keep anonymous login and other providers disabled. Set the email provider's minimum password length to 8 if desired (the registration UI already requires 8).
4. Under **Project Settings → API Keys**, copy the **publishable** key, beginning `sb_publishable_`. Copy the project URL from the project overview. Never use the secret or legacy service-role key in this app.
5. Put these values in `.env`:

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
   ```

6. Restart `npm run dev`. Register two different usernames in separate browser profiles/devices. Search for the other exact username, start a chat, and exchange messages. Create a group and add the second user to verify group chat. Refresh/reopen to check history and session persistence.
7. If live messages do not arrive, verify **Database → Publications → supabase_realtime** includes `messages`, `conversation_members`, and `conversations`. The migration configures this automatically. The app also reconciles messages every 10 seconds and on reconnect/focus.

Usernames are 3–24 ASCII letters, numbers, or underscores and are normalized to lowercase. Internally Auth uses `username@insideout.invalid`. With confirmation disabled no email delivery is needed. Do not enable email confirmation for this synthetic identity setup. The profile trigger checks the Auth identity and creates the username in the same transaction; uniqueness failures roll back the new Auth account. Passwords and persistent sessions are managed by Supabase Auth. The UI intentionally has no password reset; an owner can handle exceptional recovery through Supabase administration.

Registering many test accounts quickly can trigger Supabase Auth rate limits; wait and retry rather than weakening the rate limits. Once all friends have joined, the owner may optionally turn off new signups.

## What works

- Username/password registration, login, persistent sessions, and logout.
- Exact, case-insensitive username lookup. No partial matches, suggestions, or public directory.
- Atomic direct conversation creation with a unique sorted pair and a transaction lock against duplicates.
- Named groups with up to 30 members. The creator can add/remove members from the header's members button.
- Text messages with sender names, dates, timestamps, Enter to send, Shift+Enter for a newline.
- Only existing joined conversations in the sidebar. New conversations and member changes reconcile automatically.
- Current-conversation Postgres Changes subscription; subscriptions are removed on switch/logout.
- Reconnect catch-up with paged forward cursors, message deduplication, idempotent send retries, 50-message initial history, and older history on upward scroll.
- Responsive dark interface with keyboard-friendly dialogs and loading/error states.

## Architecture and permissions

```text
src/
  components/   Sidebar, chat history/composer, dialogs, shared controls
  hooks/        Auth, conversation refresh/subscription, message pagination/recovery
  pages/        Login and chat workspace
  services/     Supabase client and small query/RPC functions
  lib/          Username identity and message ordering helpers
  platform/     Browser/Tauri detection and future desktop adapters
supabase/migrations/001_inside_out.sql
src-tauri/      Rust desktop shell, config, capabilities, generated app icons
.github/workflows/   Web checks and desktop installer builds
public/        App icon, Cloudflare SPA fallback and security headers
```

The four public tables are `profiles`, `conversations`, `conversation_members`, and `messages`. Profiles are readable only for yourself, people sharing a conversation, and past senders in a conversation you belong to. Exact username discovery is a restricted authenticated function returning only ID, username, and display name. Knowing an ID does not grant chat access.

All conversation/membership writes go through fixed-search-path definer RPCs. Membership checks use private helper functions to avoid recursive RLS. Clients can only insert their own messages into their joined conversations and cannot set server timestamps, update/delete messages, or change memberships directly. Group creators alone manage membership; direct membership is immutable. A removed group member loses database access immediately; the UI discovers membership removal on its next refresh (at most 15 seconds while active). Previously delivered messages cannot be recalled from someone's screen or device.

The group role column records creator/admin and member; no role promotion interface or wider permissions system is included. Removed members' old messages remain. Newly added members can read the group's full history. Plain text is rendered as React text, never HTML. Sessions persist in the browser/webview's local storage. Tauri provides native notifications and user-selected image saving; no shell commands are exposed. Desktop builds are unsigned and have a CSP allowing only the app and Supabase connections.

## Tests and verification limits

Baseline verification before the messaging upgrade (see the upgrade guide for current checks): `npm run build`, `npm run lint` (zero warnings), and all 20 tests. `npx tauri dev` compiled and launched on macOS Apple Silicon after installing the minimal stable Rust/Cargo toolchain. The native WebKit window was checked for password login, restored login after quitting/reopening, direct/group navigation, stored history, sending a message, and receiving a Supabase Realtime reply. For UI automation only, the compiled debug executable was also opened through a temporary local app wrapper; no distributable installer was built. Windows 10/11 and Ubuntu configuration is prepared; native execution on those operating systems and packaged release builds have not been tested on this Mac.

Supabase is configured in the existing Inside Out project, with connection values in ignored `.env`. The existing hosted smoke script passed again, including exact lookup, concurrent direct creation, PostgREST joins/cursors, outsider/spoofing denial, Realtime direct/group messages, and membership access revocation. Three additional generated QA accounts and their sample chats remain for inspection; credentials are only in the mode-0600 temporary `inside-out-qa.json` fixture file. No database schema or Cloudflare deployment configuration was changed for desktop integration.

`npm test` uses Node's test runner and PGlite, a real PostgreSQL engine compiled to WASM. It applies the complete migration, stubs only `auth.users` and `auth.uid()`, switches to authenticated/anonymous database roles, and checks:

- Profile creation, invalid identities, and collision rollback.
- Exact lookup and absence of a public directory.
- Duplicate direct conversations, normal messages, and history persistence.
- Anonymous/outsider access denial, sender spoofing, timestamp injection, message mutation, and direct membership protection.
- Atomic group creation, creator-only changes, removal access revocation.
- Cursor pagination with equal timestamps, message deduplication, and username normalization.

This does **not** simulate Supabase's hosted password/session service, PostgREST joins, WebSocket transport, or OS packaging. Those need the connected project and native build environments. Do not interpret passing SQL tests as a completed hosted end-to-end test. Browser and desktop manual checks should include reconnect after multiple messages arrive, upward history loading, switching chats during a request, removing a group member, and reopening after login.

To repeat the hosted checks deliberately (each run creates three new QA accounts and sample chats):

```sh
node --env-file=.env scripts/live-smoke.mjs
```

This is opt-in and excluded from `npm test` and CI. It uses only the publishable key and normal user sessions. The script prints the local temporary fixture path without printing passwords. Avoid rerunning unnecessarily because Supabase signup limits apply.

## Existing web deployment — Vercel

The production React website is hosted on Vercel at https://inside-out-three.vercel.app.
Keep the existing Vercel project, Git integration, build settings and public Supabase
environment variables. The browser build remains `npm run build`, with output in `dist`.
Desktop packaging does not deploy the website or load it at runtime. The legacy
Cloudflare files are retained without changing hosting configuration.

## Desktop development and installers

The same React UI is bundled locally with Tauri v2. Load Rust into your terminal with
`source "$HOME/.cargo/env"`, then use `npm run desktop:dev`. The desktop dev server uses
port 1420; browser development keeps port 5173. Keep the existing ignored `.env`.
Supabase sessions persist in each webview's local storage; browser, desktop development,
and packaged desktop sessions are separate. No new backend, schema, or authentication
policy is needed.

See [desktop build, installation and verification instructions](docs/DESKTOP_DISTRIBUTION.md)
for prerequisites, native platform builds, GitHub Actions artifacts, unsigned
installation instructions, verification limits and version updates.

## Conversation themes

Chats now support five built-in illustrated backgrounds and private custom image uploads, shared by every participant. Use the palette button in a conversation header to preview, apply or reset a theme. Existing projects must apply the additive `003_conversation_themes.sql` migration before deploying this frontend. See [conversation theme setup, assets and verification](docs/CONVERSATION_THEMES.md) for rollout and extension details. No new environment variables or dependencies are needed.

Account settings now include username changes, and message Edit/Delete actions live in a three-dot menu. The username feature requires `004_username_changes.sql` followed by the `change-username` Edge Function before frontend rollout. See [username setup and verification](docs/USERNAME_CHANGES.md). Passwords and existing conversations stay with the same account.

**Chat Magic** adds twelve temporary animated atmospheres to direct conversations, with shared server-timed expiry, duration presets/custom minutes, and automatic return to the existing theme. It needs only the additive `005_chat_magic.sql` migration and the existing Realtime message channel—no new packages, secrets, Storage, Edge Function or scheduler. See [Chat Magic setup, performance and verification](docs/CHAT_MAGIC.md).

## Official references

- [Supabase password auth](https://supabase.com/docs/guides/auth/passwords) and [confirmation configuration](https://supabase.com/docs/guides/auth/general-configuration).
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) and [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes).
- [Tauri GitHub builds](https://v2.tauri.app/distribute/pipelines/github/) and [icons](https://v2.tauri.app/develop/icons/).
- [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows) and [Windows installers / WebView2](https://v2.tauri.app/distribute/windows-installer/).
- [Vercel Vite deployment](https://vercel.com/docs/frameworks/frontend/vite).
