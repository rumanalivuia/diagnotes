# DiagNotes Desktop (Windows)

Tauri v2 wrapper around the DiagNotes web app. Same codebase — the PRD's
"shared codebase" web + Windows goal.

## Requirements to build locally

- **Rust toolchain** (`rustup` — stable). This machine currently has no Rust
  installed, so the wrapper is *scaffolded and configured but not compiled*.
  Install via https://rustup.rs, then:
- Node 22+ (already present).

## Build

```bash
# 1. Build the web app (produces ../web/dist, which Tauri bundles)
npm run build --prefix ../web

# 2. Dev window (auto-rebuilds web on change)
cd desktop && npm install
npm run tauri dev

# 3. Release installer (.exe NSIS + .msi), with updater artifacts
npm run tauri build
```

Output: `desktop/src-tauri/target/release/bundle/nsis/DiagNotes_0.1.0_x64-setup.exe`

## Auto-update

Per PRD §9.6 the Windows app must auto-update without manual reinstall. Tauri
uses **tauri-plugin-updater**:

1. Generate a signing keypair once: `npm run tauri signer generate -w ~/.tauri/diagnotes.key`
2. Paste the public key into `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`.
3. Host the installer + a `latest.json` update manifest at the `endpoints` URL.
4. On launch the app checks the endpoint; when a newer version exists it
   downloads and installs (passive mode — no manual reinstall).

The desktop app needs to know which **sync server** to talk to. The web app
already reads `/api` through the vite proxy in dev; for packaged builds, point
the app at your hosted server (set the API base via an env var or a settings
field — v1 uses a single center server URL).

## Icons

`bundle.icon` references `icons/icon.ico`. Generate from the SVG:

```bash
npm run tauri icon ../web/public/icons/icon.svg   # outputs icons/ set
```
