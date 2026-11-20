# Desktop distribution

Inside Out 1.0.0 uses the existing `com.insideout.chat` identifier and branded icons
from `public/icon.svg`. Keep the identifier stable: changing it can separate stored
sessions and installed app identity. All platforms bundle the same React `dist`
locally. Rendering does not depend on Vercel; messaging requires internet and the
existing Supabase backend. No live infrastructure or production data changes are
needed. No updater or paid signing service is configured.

## Build configuration

Keep the existing ignored `.env` locally. Only these public frontend values belong
in installers:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` (publishable key or legacy `anon` JWT)

`npm run desktop:check` validates these values and version consistency. Tauri runs
this before every release build. Secret/service-role keys are rejected. CI uses
repository Actions variables first, falling back to secrets with the same names.
Never add database passwords, service-role keys, Edge Function secrets, cleanup
secrets or personal tokens to `VITE_` variables. The current CSP permits HTTPS/WSS
`*.supabase.co`; custom Supabase domains require an explicit CSP review.

The native window is 1180 × 780, minimum 760 × 560, with standard OS controls and a
persistent non-incognito webview. Notifications and notification-click focus retain
the existing integration. Image downloads use native Save As on desktop and the
existing browser download path on web. The dialog grants filesystem access only
to the selected path for the current session. External HTTP/HTTPS anchors open in
the system browser; other external protocols are not allowed.

WebKit image compression already falls back from WebP to JPEG when needed. Emoji
Mart data and theme assets are local. Clipboard images use the user's paste event,
so no broad clipboard permission is necessary. Windows installs per user and uses
Tauri's WebView2 download bootstrapper when the runtime is missing (internet required).

## GitHub Actions builds

The existing remote is `ShaswatRajput7/inside-out`. The repository is public, and
on 20 November 2026 the owner explicitly approved public Actions installer artifacts.
Artifacts follow repository visibility; they are not private download links.
No GitHub Releases are created. Share downloaded installers directly with friends
if that is more convenient.

Set the two public configuration values under repository **Settings → Secrets and
variables → Actions → Variables** (existing same-named secrets also work).
Push desktop work to a separate branch so the production Vercel branch is preserved.
Do not merge to the production branch merely to build installers. GitHub requires a
`workflow_dispatch` workflow to exist on the default branch; this repository already
has `desktop.yml` there. Dispatch the updated branch explicitly:

```sh
gh workflow run desktop.yml --repo ShaswatRajput7/inside-out --ref desktop/installers
gh run list --repo ShaswatRajput7/inside-out --workflow desktop.yml
gh run view RUN_ID --repo ShaswatRajput7/inside-out
gh run download RUN_ID --repo ShaswatRajput7/inside-out --dir desktop-artifacts
```

Alternatively, open **GitHub repository → Actions → Desktop Build → Run workflow**,
select the desktop branch, then choose **Run workflow**. The name on the default
branch may still display as “Desktop installers” until the reviewed workflow is
merged. Builds run only on manual dispatch and `v*` tags, never ordinary pushes.
No GitHub Release is published. Standard runners use the account's included Actions
allowance for private repositories; keep spending disabled/within the free allowance
in GitHub billing. The workflow does not change billing or request larger paid runners.

| Artifact | Runner | Output |
| --- | --- | --- |
| Inside-Out-macOS-arm64 | macos-15 ARM | `.dmg` |
| Inside-Out-macOS-x64 | macos-15-intel | `.dmg` |
| Inside-Out-Windows-x64 | windows-2022 | NSIS `.exe` |
| Inside-Out-Ubuntu-x64 | ubuntu-22.04 | `.deb` and `.AppImage` |

Each job installs Node 24, uses `npm ci`, installs stable Rust with the target,
caches npm/Rust, validates configuration, runs lint/tests/Cargo checks, builds the
frontend through Tauri's build hook, packages with the official Tauri v2 CLI, and
checks that **each** requested installer exists and is nonempty. The artifact
includes `installers.json` with version, source commit, filenames, byte sizes and
SHA-256 checksums. Files and checksums also appear in the job summary. Retention is
14 days; download them before expiry. Access follows repository permissions.

Download via **GitHub repository → Actions → Desktop Build workflow → Successful
run → Artifacts**. Extract the artifact ZIP and share the appropriate installer
privately with your friends. Friends do not need repository access if you send them
the downloaded installer yourself.

## Local prerequisites and builds

Use Node 24/npm, stable Rust and the platform's native build tools. On this Mac,
Rust is installed in `~/.cargo/bin` but may be absent from PATH:

```sh
source "$HOME/.cargo/env"
npm ci
npm run desktop:check
npm run desktop:dev
```

macOS needs Xcode command-line tools and the macOS SDK. Build on a Mac:

```sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run desktop:build -- --ci --target aarch64-apple-darwin --bundles dmg
npm run desktop:build -- --ci --target x86_64-apple-darwin --bundles dmg
```

Both macOS architectures can be built with the macOS SDK; CI uses separate native
runners. Windows and Linux installers must be built on their respective OS.
Windows requires Microsoft C++ Build Tools with Desktop development with C++ and
a Windows SDK, plus the Rust MSVC toolchain:

```powershell
npm ci
npm run desktop:build -- --ci --target x86_64-pc-windows-msvc --bundles nsis
```

Ubuntu 22.04 x64 build dependencies:

```sh
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev librsvg2-dev patchelf libayatana-appindicator3-dev xdg-utils
npm ci
APPIMAGE_EXTRACT_AND_RUN=1 NO_STRIP=true npm run desktop:build -- --ci --target x86_64-unknown-linux-gnu --bundles deb,appimage
```

Ubuntu 22.04 is the Linux baseline to avoid introducing a newer glibc requirement.
Other distributions need compatible GTK/WebKitGTK libraries; test their runtime.
Installers are under `src-tauri/target/<target>/release/bundle/` in `dmg`, `nsis`,
`deb`, or `appimage`. To verify and record a local build:

```sh
node scripts/verify-installers.mjs aarch64-apple-darwin dmg
```

## Installing

**macOS:** Pick `aarch64.dmg` for Apple Silicon or `x64.dmg` for Intel. Open the DMG,
drag Inside Out into Applications, eject the disk, then open the copied app. Builds
are unsigned/unnotarized. If Gatekeeper blocks a trusted copy, attempt to open it,
then use **System Settings → Privacy & Security → Open Anyway** and confirm. Do not
disable Gatekeeper globally. macOS minimum is 11; older OS versions still need
runtime testing with the current dependency stack.

**Windows 10/11 x64:** Run the NSIS setup `.exe`, follow the per-user installation
steps, then launch Inside Out from Start. The installer downloads WebView2 if needed.
Unsigned builds may show Microsoft Defender SmartScreen. Only for a verified copy
from the owner, use **More info → Run anyway** if available. Respect managed-device
restrictions and keep Defender enabled.

**Ubuntu 22.04+ x64:** From the downloaded installer directory:

```sh
sudo apt install './Inside Out_1.0.0_amd64.deb'
```

Use the actual generated filename. APT resolves WebKitGTK 4.1 and GTK dependencies.
Launch Inside Out from the applications menu. For the portable AppImage:

```sh
chmod +x './Inside Out_1.0.0_amd64.AppImage'
'./Inside Out_1.0.0_amd64.AppImage'
```

If FUSE is unavailable, run the same AppImage with `--appimage-extract-and-run`.
No root permission is needed for AppImage. Keep filenames quoted because they can
contain spaces.

## Runtime acceptance checks

Packaging success does not prove chat functionality or OS integration. Test on each
OS using existing accounts and authorized conversations. Do not run
`scripts/live-smoke.mjs` against production for this task: it creates accounts and
messages, contrary to the no-production-data-change constraint.

| Area | Manual checks |
| --- | --- |
| Auth | Login/logout; quit/reopen to confirm session persistence; registration in an authorized test project |
| Messaging | Direct/group navigation, real-time send/receive, history and reconnect, unread counts, online/typing, edit/delete |
| Media | Upload and clipboard paste; compression, preview, cancel Save As, successful download, Unicode emoji/picker/reactions |
| Personalization | Built-in/custom themes, Chat Magic activation and expiry |
| Privacy | Shadow Mode word/image masking; mouse and keyboard hold-to-reveal, focus loss, preference persistence, Clear Chat in a test project |
| Notifications | User-triggered permission, background notification while app runs, Shadow Mode body hiding, click navigation/focus where supported |
| Window | Minimize/maximize/close, resize, keyboard input/scrolling, installed launch |

Notifications while the process is closed are not implemented. Notification click
support varies with native OS/plugin support and needs per-platform testing.
Clear Chat, messages, edits, uploads and theme changes mutate production data; use
a test project or explicit permission for these checks. Read-only Supabase Auth
reachability can be tested without signing in or changing records.

See [build results and installer paths](DESKTOP_BUILD_RESULTS.md) for the completed
native CI builds, artifact links, checksums and actual runtime verification limits.
Downloaded installers are also available locally in the ignored `desktop-artifacts/`
folder.

## Producing an update

1. Change the shared React code and run lint/tests/build.
2. Bump the same version in `package.json`, `package-lock.json` (including root package),
   `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and the `inside-out` entry in
   `src-tauri/Cargo.lock`. `npm version VERSION --no-git-tag-version` updates the npm
   files; `cargo check --manifest-path src-tauri/Cargo.toml` updates the Rust lock.
3. Run `npm run desktop:check`, commit to the desktop branch and push.
4. Manually dispatch the branch workflow; optionally use a matching `vVERSION` tag
   once the workflow has been reviewed and merged. Tags must match the bundled version.
5. Download, smoke-test and privately redistribute new installers. Quit the old app
   before installing over it. Users keep app data when the identifier remains stable;
   verify session persistence during upgrade. Deployed web changes do not update
   installed desktop apps automatically.

References: [Tauri GitHub builds](https://v2.tauri.app/distribute/pipelines/github/),
[Tauri AppImage baseline](https://v2.tauri.app/distribute/appimage/),
[native save dialogs](https://v2.tauri.app/plugin/dialog/),
[GitHub runner labels](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
