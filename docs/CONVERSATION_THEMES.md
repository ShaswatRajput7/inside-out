# Conversation themes

The palette button in each conversation header opens a private preview. Apply shares the selected theme with every current member of that DM or group. Any participant may change it; the latest successful save wins. Choose **Inside Out** to reset. Closing or cancelling the picker leaves the saved theme unchanged.

## Install / rollout

1. On a project already running migrations `001` and `002`, run **only** `supabase/migrations/003_conversation_themes.sql` once in Supabase's SQL Editor, or apply it through your normal Supabase migration workflow. Do not rerun the earlier migrations or reset the database. On a new project, run all three migrations in order.
2. Deploy the updated frontend with your existing build/deployment process. Desktop clients pick up the frontend when rebuilt.
3. Test with two signed-in accounts (checklist below). This change has been tested locally; the migration has not been applied to the hosted project by this implementation.

No new dependencies, environment variables, Edge Functions, signed URL configuration, cron jobs, or CSP changes are required. The migration creates the private bucket and adds the themes table to the existing `supabase_realtime` publication. Postgres Changes must be available in the project. If live delivery is interrupted, active chats reconcile on reconnect, focus, network recovery and a 15-second poll.

## Data and permissions

`public.conversation_themes` has one row per conversation, created on the first save. Missing rows retain the original default background. Fields: `conversation_id`, `kind` (`default`, `builtin`, `custom`), `builtin_key`, `custom_path`, `updated_at`, `updated_by`. A check constraint enforces valid combinations and supported built-in keys. No existing rows, messages, identities or memberships are modified.

Only members can select theme metadata. `set_conversation_theme` is the only client mutation path; it verifies and locks the caller's membership, validates the configuration and, for custom themes, checks the uploaded object. The server supplies the audit fields. Direct client writes and anonymous access are revoked. A participant can reapply the currently shared custom image; otherwise they can only activate an image they uploaded to that conversation.

Custom images use the private **conversation-themes** bucket, with immutable random paths:

```
<conversation UUID>/<uploader UUID>/<random UUID>.webp (or .jpg/.png)
```

Storage inserts require membership and a path matching the authenticated uploader. Downloads require current membership and a reference from the conversation's active custom theme. Members cannot overwrite/delete objects or list abandoned/replaced images. Removed group members lose access to new downloads immediately; remaining members retain the background even when its uploader leaves. Like any downloaded image, a participant may retain a copy already received on their device.

The frontend reuses the message-image pipeline: JPEG/PNG/WebP signature validation, 15 MB original limit, aspect-preserving resize to at most 1600px, and WebP compression (JPEG fallback) to at most 500 KiB. Storage enforces the output size/MIME limits too. Only paths/configuration are stored in Postgres. Authenticated Blob downloads follow the existing message-image approach and existing browser/Tauri CSP; object URLs are released on change/unmount. Failed downloads fall back to the original background and retry on focus/network recovery.

Theme images deliberately do **not** use the 30-day message-image expiration or cleanup worker. Active backgrounds remain durable. Replaced images and uploads whose metadata save never completed remain private in Storage; they are not automatically deleted. If reclaiming storage is needed, use an administrator-only maintenance process through the Supabase **Storage API** to remove old, unreferenced objects from this bucket (allow a generous grace period for uploads/retries). Do not directly delete rows from `storage.objects`. This is optional maintenance, not a rollout prerequisite.

## Built-in artwork

Five original, local SVG illustrations live in `src/assets/themes/` (about 36 KB total before gzip). They use simple vector shapes/gradients with no external images, fonts, scripts or runtime animation:

| Stable key | Picker label | Direction |
| --- | --- | --- |
| `grand-line` | Grand Line | One Piece inspired ocean, ship, moon and straw hat |
| `purple-hour` | Purple Hour | BTS inspired violet landscape, seven lights and open doorways |
| `sakura-dream` | Sakura Dream | Anime inspired blossoms, mountains and evening water |
| `neon-rain` | Neon Rain | Anime inspired rainy skyline and quiet neon reflections |
| `sky-meadow` | Sky Meadow | Anime inspired cinematic hills and clouds |

These are stylized vector backgrounds, not generated anime paintings or official franchise artwork. The assets are complete and can be replaced with more detailed art later. `src/lib/themes.js` defines their names, descriptions, accent colors and bundled URLs. Art is positioned behind the scroll area with a dark gradient; message panels, timestamps, typing status and composer have legible foregrounds. The layer has no layout footprint and does not receive pointer events. The default conversation styling is retained when no image is available.

To **replace art**, replace the corresponding SVG or point its `new URL(..., import.meta.url)` entry to an optimized WebP/JPEG/PNG asset. Keep the persisted key unchanged. No database change is needed. Keep focal points near the edges, allow cover cropping on narrow screens and check contrast with the existing overlay.

To **add a built-in theme**, add an asset and entry to `BUILTIN_THEMES`, then create a new incremental SQL migration expanding the `conversation_theme_config` constraint's built-in key allowlist. Deploy that migration before clients that offer the new key. Existing conversation selections keep working. Do not edit an already-applied migration.

## Implementation map

- `src/components/ChatWindow.jsx`: header action and scoped chat scene.
- `src/components/ThemePickerModal.jsx`: local preview, built-ins, reset, image preparation and explicit apply.
- `src/components/ChatBackground.jsx`: image/overlay presentation and decode failure fallback.
- `src/components/Modal.jsx`: optional class name; theme modal keeps its actions visible while its content scrolls.
- `src/hooks/useConversationTheme.js`: authoritative loading/saving, scoped Postgres Changes subscription, reconciliation and stale-request protection.
- `src/hooks/useThemeImage.js`: active-image resolution, authenticated download, Blob lifetime and retry after network recovery.
- `src/services/themeService.js`: RPC/storage calls and shared compression reuse.
- `src/lib/themes.js`, `src/assets/themes/`, `src/index.css`: catalog, artwork and presentation.
- `supabase/migrations/003_conversation_themes.sql`: additive schema, private Storage bucket/policies and RPC.
- `tests/theme-database.test.js`, `tests/themes.test.js`: privacy, preservation, data validation and asset coverage.

## Validation

Automated: `npm test`, `npm run lint`, `npm run build`. PostgreSQL/PGlite tests apply all three migrations and exercise both participants reading saved built-ins/custom paths, member writes, default reset, group changes, removal, outsider/anonymous denial, Storage RLS, immutability, invalid uploads/configurations, publication registration and exact preservation of every existing table value. Existing messaging tests remain in the suite.

Browser visual QA uses an isolated local fixture with the real picker, background, message list, composer and compression code: all five themes, mobile picker at 390px, private preview/cancel/reset, a 2400×1600 PNG resized to 1600×1067, and composing a local message. This fixture does not send messages to real users or apply hosted settings. It is removed after verification.

Hosted Supabase Auth/Storage/Realtime and packaged Tauri execution are not simulated by the PostgreSQL tests. After rollout, verify with real accounts:

1. In a DM, A applies every built-in; B sees the update without refresh. Refresh/reopen both clients and check persistence.
2. B uploads a JPEG, PNG and WebP, previews and applies each. A sees the same custom background, including after reopening.
3. In a group, a non-admin changes the theme; all members see it. Remove that member; they can no longer fetch the metadata/image, while the rest of the group keeps its theme.
4. Choose Inside Out; all participants return to the default. Check another conversation is unaffected.
5. Block a background request; the chat remains usable over the default. Restore connectivity/focus and verify download recovery.
6. Check scrolling/pagination, reactions, emoji, edit/delete, attachments, typing, notifications, mobile layout and the desktop webview.
