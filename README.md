# Inside Out

A small, private chat app for friends. React + Vite + JavaScript + Tailwind, Supabase Auth/PostgreSQL/Realtime, and Tauri v2. No separate backend server.

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
supabase/migrations/001_inside_out.sql
src-tauri/      Rust desktop shell, config, capabilities, generated app icons
.github/workflows/   Web checks and desktop installer builds
public/        App icon, Cloudflare SPA fallback and security headers
```

The four public tables are `profiles`, `conversations`, `conversation_members`, and `messages`. Profiles are readable only for yourself, people sharing a conversation, and past senders in a conversation you belong to. Exact username discovery is a restricted authenticated function returning only ID, username, and display name. Knowing an ID does not grant chat access.

All conversation/membership writes go through fixed-search-path definer RPCs. Membership checks use private helper functions to avoid recursive RLS. Clients can only insert their own messages into their joined conversations and cannot set server timestamps, update/delete messages, or change memberships directly. Group creators alone manage membership; direct membership is immutable. A removed group member loses database access immediately; the UI discovers membership removal on its next refresh (at most 15 seconds while active). Previously delivered messages cannot be recalled from someone's screen or device.

The group role column records creator/admin and member; no role promotion interface or wider permissions system is included. Removed members' old messages remain. Newly added members can read the group's full history. Plain text is rendered as React text, never HTML. Sessions persist in the browser/webview's local storage. Tauri exposes no filesystem or shell commands. Desktop builds are unsigned and have a CSP allowing only the app and Supabase connections.

## Tests and verification limits

Local verification completed: `npm run build`, `npm run lint` (zero warnings), all 15 tests, login-screen visual inspection, and Tauri configuration/schema/icon checks. Native compilation was attempted and stopped at `cargo metadata` because Rust/Cargo are not installed. No installers have been produced locally. Supabase is configured in the existing Inside Out project: migration applied, email confirmation disabled, and ignored `.env` connected with the publishable key. Hosted smoke checks passed for registration/login, exact lookup, concurrent direct creation, frontend PostgREST joins, outsider/spoofing denial, bidirectional Realtime messages, group messaging, creator-only membership changes, removal access revocation, and history after a new login, and hosted timestamp/UUID cursor queries. Browser checks also passed for login, sending direct messages, exact member lookup, group creation, group member controls, Shift+Enter multiline messages, and persistent login/history after reload. Three generated QA accounts and sample chats remain for inspection; their credentials are stored only in the mode-0600 temporary `inside-out-qa.json` fixture file.

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

## Deploy the browser app to Cloudflare Pages

No deployment is performed automatically.

1. Put this project in your own GitHub repository (private is fine).
2. In Cloudflare, open **Workers & Pages → Create application → Pages → Connect to Git** and choose that repository. Use the free plan.
3. Set **Build command** to `npm run build`, **Build output directory** to `dist`, and root directory to the repository root. Set `NODE_VERSION` to `24` if the build settings allow it.
4. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` under build environment variables. Use the same project as the desktop app. Apply them to production and preview if previews are desired.
5. Deploy. Cloudflare supplies an HTTPS `*.pages.dev` URL; no custom domain is required. `public/_redirects` supports refreshes, and `public/_headers` supplies browser security headers. `wrangler.toml` identifies the static output directory.
6. For consistency, set **Supabase Authentication → URL Configuration → Site URL** to the HTTPS Pages URL. This app uses password login directly, with no OAuth or email redirects.

Alternative direct upload after building:

```sh
npm run build
npx wrangler pages deploy dist --project-name inside-out
```

Run that only when you intend to publish. Changing environment variables requires a fresh build/deployment. The free hosted Supabase tier can pause idle projects; resume an idle project in its dashboard if needed. GitHub Actions quotas and provider free-tier policies still apply.

## Desktop development and installers

Install the stable Rust toolchain from https://rustup.rs. On macOS install Xcode command-line tools (`xcode-select --install`). If macOS bundling reports missing Xcode tools, install/select full Xcode as directed by Tauri. No paid Apple account is required.

On Ubuntu 22.04/24.04 install:

```sh
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev librsvg2-dev patchelf libayatana-appindicator3-dev
```

Then, with `.env` configured:

```sh
npm ci
npm run desktop:dev
```

macOS Apple Silicon, on a Mac:

```sh
rustup target add aarch64-apple-darwin
npm run desktop:build -- --target aarch64-apple-darwin --bundles dmg
```

macOS Intel, on a Mac (Apple Silicon can use the macOS SDK to build this target):

```sh
rustup target add x86_64-apple-darwin
npm run desktop:build -- --target x86_64-apple-darwin --bundles dmg
```

Ubuntu x64, **on Ubuntu**:

```sh
npm run desktop:build -- --bundles deb,appimage
```

Artifacts are under `src-tauri/target/<target>/release/bundle/` when `--target` is supplied, otherwise `src-tauri/target/release/bundle/`. macOS installers are unsigned/unnotarized: recipients may need the normal macOS Privacy & Security **Open Anyway** flow. AppImage requires FUSE on some systems; `chmod +x ./Inside*.AppImage` then `./Inside*.AppImage --appimage-extract-and-run` is an alternative (use the actual filename). A `.deb` can be installed with `sudo apt install ./inside-out*.deb` (use the actual output filename).

### GitHub Actions builds

1. Push to your own repository. Add repository **Settings → Secrets and variables → Actions** secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
2. Open **Actions → Desktop installers → Run workflow**.
3. The matrix builds Apple Silicon `.dmg`, Intel `.dmg`, and Ubuntu x64 `.deb`/`.AppImage` using macOS and Ubuntu runners. Download the resulting workflow artifacts. It does not publish releases or deploy the website.
4. Use GitHub's included runner allowance; private repository macOS jobs consume that allowance faster. Desktop builds are manual to avoid unnecessary usage. No Linux build is attempted on macOS.

The workflow installs Rust and platform libraries. The local machine must also have Rust to compile; `npm run tauri info` diagnoses prerequisites. App icons are generated from `public/icon.svg` using `npm run tauri icon public/icon.svg`.

## Official references

- [Supabase password auth](https://supabase.com/docs/guides/auth/passwords) and [confirmation configuration](https://supabase.com/docs/guides/auth/general-configuration).
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) and [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes).
- [Tauri GitHub builds](https://v2.tauri.app/distribute/pipelines/github/) and [icons](https://v2.tauri.app/develop/icons/).
- [Cloudflare Pages framework setup](https://developers.cloudflare.com/pages/framework-guides/).
