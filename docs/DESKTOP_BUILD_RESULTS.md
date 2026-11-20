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

## Successful native CI build

[Desktop Build run 44742971904](https://github.com/ShaswatRajput7/inside-out/actions/runs/44742971904)
completed successfully for all four jobs. Built commit:
`7a340132f0118f7647d560a9b6398ac78ffc824e` on `desktop/installers`.
All jobs passed frontend lint, all **86 tests**, public configuration/version
validation, Cargo checks, production frontend build, release packaging, installer
validation and artifact upload. macOS ARM and Intel each ran on their native
architecture; Ubuntu 22.04 and Windows 2022 built their own packages.

The first run passed macOS/Linux packaging but exposed a Windows CRLF parsing
issue in the new version validator. That was fixed with a regression test, and
the full corrected run passed. Installer validation was also exercised locally
with temporary fixtures: missing or empty requested formats fail, while a complete
set produces a manifest with byte sizes and SHA-256 checksums.

All five final installers were downloaded into the ignored `desktop-artifacts/`
folder. Each file's byte size and SHA-256 were independently compared with its
CI manifest and matched.

| Installer (relative to `desktop-artifacts/`) | Bytes | SHA-256 |
| --- | ---: | --- |
| `Inside-Out-Ubuntu-x64/deb/Inside Out_1.0.0_amd64.deb` | 5424100 | `097e257cc596460d4cf59a283fa110c45b81ecef9a60937ff69648787553936f` |
| `Inside-Out-Ubuntu-x64/appimage/Inside Out_1.0.0_amd64.AppImage` | 83540472 | `43bccf7dd503dd5168a639f2cc0fbeab9f5d0be0fbfdc61a43113ff819fd5e95` |
| `Inside-Out-Windows-x64/nsis/Inside Out_1.0.0_x64-setup.exe` | 2611011 | `a681130c896ed379d6e72f55386c2f79234c05d76fb9267ec582c64b335e2f4b` |
| `Inside-Out-macOS-arm64/dmg/Inside Out_1.0.0_aarch64.dmg` | 3744250 | `b94bf820ae960551036f224afc04b2ef9696fea2c657bb00cff7859d43c06012` |
| `Inside-Out-macOS-x64/dmg/Inside Out_1.0.0_x64.dmg` | 3833491 | `a09cd61f3275714c93c305cd24b7b4f70e9622cb905118196a0bbf558e4371fc` |

Direct GitHub artifact ZIP downloads (expire after 14 days):

- [Inside-Out-macOS-arm64](https://github.com/ShaswatRajput7/inside-out/actions/runs/44742971904/artifacts/14631538933)
- [Inside-Out-macOS-x64](https://github.com/ShaswatRajput7/inside-out/actions/runs/44742971904/artifacts/14632541912)
- [Inside-Out-Windows-x64](https://github.com/ShaswatRajput7/inside-out/actions/runs/44742971904/artifacts/14632482144)
- [Inside-Out-Ubuntu-x64](https://github.com/ShaswatRajput7/inside-out/actions/runs/44742971904/artifacts/14632441067)

The Ubuntu DEB was inspected as a Debian archive: version 1.0.0, architecture
amd64, GTK/WebKit dependencies, binary, desktop launcher and branded icons. The
AppImage was identified as x86_64 ELF. The Windows output was identified as a
Nullsoft self-extracting installer (its NSIS bootstrap stub is PE32; the app was
built for `x86_64-pc-windows-msvc`). These checks do not substitute for running the
installed applications on those systems.

## Pending runtime testing / limits

Windows and Ubuntu GUI runtime tests are pending; no such desktop environment is
connected here. Intel Mac hardware testing also remains pending.

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

## Files changed

- `.github/workflows/desktop.yml`: native four-platform matrix, manual/version-tag
  triggers, configuration/tests/Cargo checks, package verification, 14-day artifacts.
- `src-tauri/tauri.conf.json`: release validation/build hook, NSIS-only Windows
  packaging and per-user installation; existing identifier, icons, window, CSP,
  WebView2 bootstrapper and persistent webview retained.
- `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/src/lib.rs`,
  `src-tauri/capabilities/default.json`: official dialog/fs/opener plugins and
  narrowly scoped capabilities, preserving notifications and window focus.
- `package.json`, `package-lock.json`: native adapter dependencies and desktop
  configuration check command.
- `src/platform/files.js`, `src/platform/links.js`, `src/main.jsx`,
  `src/components/ImageMessage.jsx`: native image saving and system-browser links
  with browser behavior preserved.
- `scripts/check-desktop.mjs`, `scripts/verify-installers.mjs`,
  `tests/desktop.test.js`: public-key/version validation, bundle manifests,
  credentials/protocol/Windows-line-ending regression checks.
- `README.md`, `src/platform/desktop/README.md`, `docs/DESKTOP_DISTRIBUTION.md`,
  `docs/DESKTOP_BUILD_RESULTS.md`, `.gitignore`: corrected Vercel documentation,
  build/install/update instructions, verification evidence and ignored downloads.

The existing Vercel project/configuration, production `main`, and live Supabase
schema/policies/data were preserved. Work was pushed only to `desktop/installers`
with Vercel skip markers; GitHub reported no deployment for the build commit.
The two public Supabase settings were supplied as repository Actions variables.
