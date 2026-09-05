# DiagNotes

> A fast, searchable storehouse of reusable diagnostic report comments for
> medical technologists and pathologists. Browse publicly, search, copy, and
> paste into the LIS/Word report system you already use.

[![Neon](https://img.shields.io/badge/Postgres-Neon-00E699?style=flat-square)](https://neon.tech)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?style=flat-square)](https://vercel.com)
[![Node](https://img.shields.io/badge/Node-%3E%3D22.5-339933?style=flat-square)](https://nodejs.org)
[![Tauri](https://img.shields.io/badge/Desktop-Tauri_2-FFC131?style=flat-square)](https://tauri.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](./LICENSE)

---

## Features

| Feature | Access |
|---------|--------|
| Browse shared diagnostic comments | Public (no login) |
| Full-text search | Public |
| Category & tag filters | Public |
| One-click Copy (rich + plain text) | Registered users |
| Personal snippets (private, editable) | Registered users |
| Submit snippet to shared library | Registered users (admin approval) |
| Admin review queue (approve/reject) | Admin |
| Category management (add/archive) | Admin |
| Recently-copied & favorites | Registered users |
| Offline support (PWA) | Registered users |
| Share comments (Web Share API) | Public |
| Install as mobile/desktop PWA | Public |
| Windows desktop app (Tauri) | Public |

## Architecture

```
diagnotes/
├── server/   Node.js sync server (Neon Postgres + node:sqlite fallback)
│   ├── lib/db.js    dual-mode schema (pg/sqlite), migrations, scrypt auth
│   ├── lib/api.js   REST API (public read + authenticated write + admin gates)
│   ├── lib/auth.js  HMAC fallback + jose JWKS verify for Neon Auth
│   └── test/        25 passing API tests
├── api/      Vercel serverless handler (reuses server/lib/*)
├── web/      React 19 + Vite 7 PWA (primary interface)
│   ├── src/lib/     richtext model, IndexedDB store, sync engine, search
│   ├── src/components/  Rail, TopBar, cards, editor, admin, login modal
│   └── test/        7 passing lib tests
├── desktop/  Tauri v2 Windows wrapper (.exe + auto-update)
├── neon.ts   Neon infrastructure-as-code (auth: true)
└── vercel.json  Build + rewrites
```

## Quick start

**Requirements:** Node >= 22.5

```bash
# Install dependencies
npm install

# Pull Neon environment variables (or create .env.local manually)
npx neon@latest env pull

# Terminal 1 — start the server (http://localhost:3001)
npm run server

# Terminal 2 — start the web app (http://localhost:5173)
npm run web
```

Open http://localhost:5173 — the shared library is visible without login.
Sign in or create an account to contribute comments.

**Local fallback:** Without `DATABASE_URL` the server uses `node:sqlite` — no
native compilation needed. Tests always use sqlite temp dirs.

### Default dev credentials

```
email:    diagnotes@center.local
password: devpassword
```

Set `DIAGNOTES_EMAIL` and `DIAGNOTES_PASSWORD` to override. The first Neon Auth
signup automatically receives admin privileges.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Prod | Neon Postgres pooled connection string |
| `DATABASE_URL_UNPOOLED` | Prod | For migrations / pg_dump |
| `NEON_BRANCH` | Prod | Neon branch name (e.g. `production`) |
| `NEON_AUTH_BASE_URL` | Prod | Neon Auth base URL |
| `NEON_AUTH_JWKS_URL` | Prod | Neon Auth JWKS endpoint |
| `DIAGNOTES_EMAIL` | Prod | Seed admin email |
| `DIAGNOTES_PASSWORD` | Prod | Seed admin password |
| `DIAGNOTES_SECRET` | Prod | HMAC signing secret (32+ bytes hex) |
| `CORS_ORIGIN` | Prod | Allowed origins (comma-separated) |
| `VITE_API_BASE_URL` | Dev | API base URL (empty = same-origin) |
| `VITE_NEON_AUTH_URL` | Prod | Neon Auth URL for web client (`/neonauth` in prod) |

See `.env.example` for the full list.

## API overview

```
# Public (no auth required)
GET  /api/health                            health check
GET  /api/categories                        list active categories
GET  /api/comments?type=shared              browse approved shared comments
GET  /api/comments/:id                      view a specific approved comment

# Authenticated (Bearer token required)
POST /api/auth/login                        sign in (returns token + role)
GET  /api/auth/me                           current user info + role
GET  /api/comments?type=personal            list personal snippets
POST /api/comments                          create a comment
GET/PATCH/DELETE /api/comments/:id          manage own comments
POST /api/comments/:id/copy                 track clipboard copy
POST /api/comments/:id/submit               submit personal → pending approval
GET/POST /api/sync                          offline sync (pull/push)

# Admin only (Bearer token + admin role)
POST /api/categories                        create category
PATCH /api/categories/:id                   update / archive category
POST /api/admin/comments/:id/approve        approve submission
POST /api/admin/comments/:id/reject         reject (with reason)
GET  /api/admin/stats                       totals + top-copied
```

All timestamps are epoch ms. Auth: `Authorization: Bearer <token>`.

## Windows desktop app

The desktop app is a Tauri v2 wrapper around the web app. It produces a native
Windows `.exe` installer with auto-update support.

### Build from source

**Requirements:** [Rust toolchain](https://rustup.rs) + Node 22+

```bash
# 1. Build the web app
npm run build

# 2. Install desktop dependencies
cd desktop && npm install

# 3. Development mode
npm run tauri dev

# 4. Release build (.exe NSIS installer + .msi)
npm run tauri build
```

Output: `desktop/src-tauri/target/release/bundle/nsis/DiagNotes_0.1.0_x64-setup.exe`

### Download

[Download the latest Windows installer](https://github.com/rumanalivuia/diagnotes/releases/latest)

## PWA install

DiagNotes is a Progressive Web App. On supported browsers (Chrome, Edge,
Safari), you'll see an "Install App" button in the sidebar footer. On mobile,
use your browser's "Add to Home Screen" option.

The PWA works offline for browsing previously loaded comments (authenticated
users only).

## Deploy to Vercel

```bash
vercel link --project diagnotes

# Set environment variables
vercel env add DATABASE_URL production
vercel env add DATABASE_URL_UNPOOLED production
vercel env add NEON_AUTH_BASE_URL production
vercel env add NEON_AUTH_JWKS_URL production
vercel env add DIAGNOTES_EMAIL production
vercel env add DIAGNOTES_PASSWORD production
vercel env add DIAGNOTES_SECRET production
vercel env add CORS_ORIGIN production

vercel --prod
```

Vercel auto-deploys on push to `main`.

## Testing

```bash
npm test                 # 25 server + 7 web lib tests
npm run build            # production build + PWA precache
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for
development setup, code style, and pull request guidelines.

## License

[MIT](./LICENSE) -- Copyright (c) 2026 Ruman Alivuia

## Author

**Ruman Alivuia** -- [github.com/rumanalivuia](https://github.com/rumanalivuia)
