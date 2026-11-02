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

The group role column records creator/admin and member; no role promotion interface or wider permissions system is included. Removed members' old messages remain. Newly added members can read the group's full history. Plain text is rendered as React text, never HTML. Sessions persist in the browser/webview's local storage. Tauri exposes no filesystem or shell commands. Desktop builds are unsigned and have a CSP allowing only the app and Supabase connections.

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

## Desktop development

Keep developing features in the existing React components, hooks, and Supabase services.
The native shell opens this same frontend; it does not load the deployed Cloudflare URL.
No chat/auth code is forked, and no extra backend or Supabase schema is needed.
Installers can be built later, when a version is ready to share.

On this Mac, the minimal stable Rust/Cargo toolchain is installed without modifying shell
profiles. Load Cargo into a fresh terminal session, then launch the desktop app:

```sh
source "$HOME/.cargo/env"
npx tauri dev
# Equivalent: npm run desktop:dev
```

Keep the existing `.env` with `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`. Do not copy the example over working credentials.
Tauri starts Vite at **http://127.0.0.1:1420** automatically. `npm run dev` remains
on port **5173**, so browser and desktop development can run at the same time.
React changes hot-reload in the webview; Rust/config changes are handled by Tauri.
Closing the window or stopping the dev command ends the development app. No installer,
code signing, updater, notifications, or paid Apple account is involved.

The window is titled **Inside Out**, starts centered at **1180 × 780**, resizes down to
**760 × 560**, and uses the stable identifier **com.insideout.chat**. Keep that identifier
stable for future builds. The non-incognito webview data store persists Supabase sessions
between launches. Browser, desktop development, and a future packaged desktop app each
have their own local session storage; log in once in each runtime. They all use the same
Supabase accounts, conversations, and messages.

Auth uses password requests directly (no OAuth/deep-link callback is needed). Supabase's
existing auto-refresh, Postgres Changes subscriptions, reconnect/focus handlers, and
history queries run inside the webview unchanged. CSP permits the Supabase HTTPS and
WebSocket endpoints; development also permits the Vite HMR socket. Navigation is existing
React state inside one HTML entry, with no server routes or new routing dependency.
The Cloudflare build command, output directory, headers, and redirects are unchanged.

For platform-specific work, use the browser-safe utility:

```js
import { isDesktop, getRuntime } from './platform/index.js'

isDesktop()  // true in Tauri, false in the browser
getRuntime() // 'tauri' or 'browser'
```

Future native adapters belong in `src/platform/desktop/`; its README explains where to
add plugins and narrowly scoped Tauri capability permissions when a feature actually
needs them. The current shell exposes no filesystem/shell/notification commands.
Do not add native API imports to the chat or Supabase services.

### Prerequisites on another Mac, Ubuntu, or Windows machine

Install the stable Rust toolchain from https://rustup.rs. On macOS install Xcode command-line tools (`xcode-select --install`). If macOS bundling reports missing Xcode tools, install/select full Xcode as directed by Tauri. No paid Apple account is required.

On Ubuntu 22.04/24.04 install:

```sh
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev librsvg2-dev patchelf libayatana-appindicator3-dev
```

Then, with `.env` configured:

```sh
npm ci
source "$HOME/.cargo/env"
npx tauri dev
```

On **Windows 10/11 x64**, install Node.js, the stable Rust **MSVC** toolchain, and
Microsoft C++ Build Tools with **Desktop development with C++** and a Windows SDK.
Install the **Microsoft Edge WebView2 Evergreen Runtime** if it is missing. These are
the standard [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows).
Open a new terminal after installing Rust so Cargo is available, configure the same
`.env`, then run:

```powershell
npm ci
npx tauri dev
```

Windows uses WebView2; macOS and Ubuntu use their system WebKit webviews. All run the
same React frontend, password authentication, session storage, and Supabase HTTPS /
Realtime WebSocket integration. No Windows-specific chat code or native permissions
are needed. Windows login/session/realtime behavior still needs an actual Windows
smoke test before distributing a release.

### Future installers (not part of daily development)

The existing manual GitHub workflow and bundle targets remain ready for later use.
These commands are only needed when preparing a distributable release; no installers
are created as part of `npx tauri dev`.

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

Windows 10/11 x64, **on Windows**, when ready to build installers:

```powershell
rustup target add x86_64-pc-windows-msvc
npm run desktop:build -- --target x86_64-pc-windows-msvc --bundles "nsis,msi"
```

This prepares an NSIS setup `.exe` and a WiX `.msi` in the `nsis/` and `msi/`
bundle subdirectories. The configured WebView2 download bootstrapper installs the
runtime if it is absent, using an internet connection. MSI builds require the Windows
VBSCRIPT optional feature; see [Tauri's Windows installer guide](https://v2.tauri.app/distribute/windows-installer/)
if WiX reports an error. No signing certificates or updater are configured.

Artifacts are under `src-tauri/target/<target>/release/bundle/` when `--target` is supplied, otherwise `src-tauri/target/release/bundle/`. macOS installers are unsigned/unnotarized: recipients may need the normal macOS Privacy & Security **Open Anyway** flow. AppImage requires FUSE on some systems; `chmod +x ./Inside*.AppImage` then `./Inside*.AppImage --appimage-extract-and-run` is an alternative (use the actual filename). A `.deb` can be installed with `sudo apt install ./inside-out*.deb` (use the actual output filename).

### GitHub Actions builds

1. Push to your own repository. Add repository **Settings → Secrets and variables → Actions** secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
2. Open **Actions → Desktop installers → Run workflow**.
3. When manually triggered, the matrix builds Apple Silicon `.dmg` and Intel `.dmg` on macOS runners, Ubuntu x64 `.deb`/`.AppImage` on an Ubuntu runner, and Windows x64 NSIS `.exe`/`.msi` on a Windows runner. Download the resulting workflow artifacts. It does not publish releases or deploy the website. The workflow has not been triggered for this configuration change.
4. Use GitHub's included runner allowance; private repository macOS jobs consume that allowance faster. Desktop builds are manual to avoid unnecessary usage. Each operating system builds its own installers; no cross-compilation setup is added.

The workflow installs Rust and platform libraries. The local machine must also have Rust to compile; `npm run tauri info` diagnoses prerequisites. App icons are generated from `public/icon.svg` using `npm run tauri icon public/icon.svg`.

## Official references

- [Supabase password auth](https://supabase.com/docs/guides/auth/passwords) and [confirmation configuration](https://supabase.com/docs/guides/auth/general-configuration).
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) and [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes).
- [Tauri GitHub builds](https://v2.tauri.app/distribute/pipelines/github/) and [icons](https://v2.tauri.app/develop/icons/).
- [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows) and [Windows installers / WebView2](https://v2.tauri.app/distribute/windows-installer/).
- [Cloudflare Pages framework setup](https://developers.cloudflare.com/pages/framework-guides/).
