# Future native integrations

Keep Tauri-specific adapters here. React components, authentication, Supabase queries,
and message hooks remain shared by the browser and desktop app.

Use `isDesktop()` or `getRuntime()` from `../index.js` before loading a native adapter.
When a feature needs a Tauri plugin, import that plugin inside its adapter, register
the Rust plugin in `src-tauri/src/lib.rs`, and grant only its required permissions in
`src-tauri/capabilities/default.json`. Keep the browser path usable without a native
runtime. Do not branch on user-agent strings.

Notification dispatch and click focus now live in `../notifications.js`, with explicit user-triggered permission requests. Background push, updater, tray support, and other native integrations remain unimplemented.
