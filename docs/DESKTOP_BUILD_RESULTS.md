# Desktop verification — 20 November 2026

Version: 1.0.0. Source work is on `desktop/installers`; production `main` and Vercel
settings remain unchanged. The owner approved public Actions artifacts because the
existing repository is public. No GitHub Releases are published.

## Completed locally on macOS Apple Silicon

- `npm run lint`: passed.
- `npm test`: all 85 tests passed (including PostgreSQL/PGlite suites).
- `npm run build`: passed; shared Vite browser production build remains usable.
- `npm run desktop:check`: passed, public configuration present, no values logged.
- `cargo check --manifest-path src-tauri/Cargo.toml`: passed with stable Rust 1.99.1.
- `npm run desktop:dev`: compiled and started the existing desktop command and Vite
  on port 1420; authenticated feature testing was not performed.
- Apple Silicon release DMG: built; `hdiutil verify` passed. App copied from the DMG
  to `/private/tmp/inside-out-installed/Inside Out.app`, DMG unmounted, copied app
  launched through macOS. Its WebKit UI displayed the normal login screen from
  `tauri://localhost`. This was a temporary installation, not an Applications-folder
  installation or a downloaded/quarantined Gatekeeper test.
- Intel release DMG: built on this Mac using the Intel Rust target and macOS SDK.
  Intel hardware runtime testing remains pending.
- Existing Supabase Auth `/auth/v1/settings`: read-only request returned HTTP 200.
  This proves reachability/public-key acceptance, not installed-app authentication
  or Realtime operation.

| Local installer path (relative to repository) | Bytes | SHA-256 |
| --- | ---: | --- |
| `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/Inside Out_1.0.0_aarch64.dmg` | 3744638 | `d7a282ba0a400cefba03b9b793b12f32dc41998f14fdde3747b4d18e37ff43fa` |
| `src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/Inside Out_1.0.0_x64.dmg` | 3836258 | `d38dc84163806b108a985fe709541c1af9220139db98389eaaf46436f9c10c5b` |

Each local bundle directory also contains `installers.json`. CI installers may have
different bytes/checksums because of native runner/toolchain and packaging metadata;
use the manifest belonging to the downloaded artifact.

## Pending / limits

Native CI builds for macOS ARM/Intel, Windows NSIS, Ubuntu DEB/AppImage will be
recorded after the workflow completes. Windows and Ubuntu GUI runtime tests are
pending; no such desktop environment is connected here.

Installed-app login/session persistence, direct/group messaging, real-time delivery,
image upload/paste/preview/save, notifications, reactions, theme changes, Chat Magic,
Shadow Mode and conversation switching remain manual acceptance checks. The app
opened logged out, and creating accounts/messages/uploads or clearing chats would
change production data. No live Supabase schema, policies or production records
were changed, and the mutating hosted smoke script was not run.

Native plugin dialog permissions and version/configuration checks compiled
successfully; native save dialogs, external links and notification interactions
still need runtime exercise after login. Existing compression includes a WebKit
JPEG fallback. Notifications while the app is closed remain unimplemented.

`cargo fmt --check` was attempted but rustfmt is not installed in this minimal Rust
toolchain. Cargo compilation/checks succeeded; no formatting failure was reported.

See [distribution instructions](DESKTOP_DISTRIBUTION.md) for installation, security
prompts, artifact downloads, build prerequisites and manual updates.
