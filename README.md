# DiagNotes

> Searchable library of reusable diagnostic report comments for medical technologists and pathologists — browse publicly, copy rich text, paste directly into your LIS or report system.

[![Neon](https://img.shields.io/badge/Postgres-Neon-00E699?style=flat-square)](https://neon.tech)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?style=flat-square)](https://vercel.com)
[![Node](https://img.shields.io/badge/Node-%E2%89%A522.5-339933?style=flat-square)](https://nodejs.org)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?style=flat-square)](https://react.dev)
[![Tauri v2](https://img.shields.io/badge/Desktop-Tauri_2-FFC131?style=flat-square)](https://tauri.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](./LICENSE)

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Data Model](#data-model)
- [Offline & Sync](#offline--sync)
- [PWA](#pwa)
- [Desktop App](#desktop-app)
- [Deployment](#deployment)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

---

## Features

| Capability                                        | Access                         |
| ------------------------------------------------- | ------------------------------ |
| Browse shared diagnostic comments                 | Public — no login              |
| Full-text search (title + body)                   | Public                         |
| Filter by category & tag                          | Public                         |
| One-click copy (rich HTML + plain text)           | Authenticated                  |
| Personal snippets (private, editable)             | Authenticated                  |
| Submit personal snippet → shared library          | Authenticated (admin approval) |
| Admin review queue — approve / reject with reason | Admin                          |
| Category management (create / archive)            | Admin                          |
| Admin stats — totals, pending, top-copied         | Admin                          |
| Recently copied & favorites                       | Authenticated                  |
| Offline browsing (IndexedDB + background sync)    | Authenticated                  |
| Share comment (Web Share API)                     | Public                         |
| Install as PWA (mobile + desktop)                 | Public                         |
| Native Windows app (Tauri v2, auto-update)        | Public                         |

**Highlights**

- **Zero-friction browsing** — the entire approved shared library is public; login is only needed to copy, create, or contribute.
- **Rich-text comments** — bold / italic / underline runs, paragraphs, and bullet/ordered lists stored as a portable JSON document (`body`) with a derived `body_text` column for search.
- **Copy tracking** — every copy increments `copy_count` (surfaces in admin stats / top-copied).
- **Moderated publishing** — `personal → pending_approval → approved / rejected` keeps the shared library curated.

---

## Tech Stack

| Layer        | Technology                                                                                                            |
| ------------ | --------------------------------------------------------------------------------------------------------------------- |
| **Web**      | React 19, Vite 7, `vite-plugin-pwa` (Workbox), IBM Plex Sans/Mono                                                     |
| **Server**   | Node 22.5+, `node:sqlite` (dev/test) + `pg` (Neon Postgres), `node:http`                                              |
| **Auth**     | Neon Auth (Better Auth) JWT via `jose` JWKS — falls back to HMAC (`b64(payload).sig` + scrypt)                        |
| **Database** | Neon Postgres (prod) / `node:sqlite` WAL fallback (local + tests) — single schema, `?` → `$n` placeholder translation |
| **Infra**    | Vercel serverless (`api/index.js` reuses `server/lib/*`), `vercel.json` rewrites, Neon `auth:true` (`neon.ts`)        |
| **Desktop**  | Tauri v2 — Rust wrapper around the Vite build, NSIS + MSI bundles                                                     |
| **Monorepo** | `npm workspaces` (`server`, `web`), ESM (`"type": "module"`)                                                          |

---

## Architecture

```
diagnotes/
├── server/           Node sync server
│   ├── index.js      HTTP server, CORS, .env.local loader, openDb → buildApi
│   ├── lib/
│   │   ├── db.js     openDb() dual-mode, migrations, scrypt seed, wrapPgPool / wrapSqliteDb
│   │   ├── api.js    buildApi() — all REST routes, Neon JWT → HMAC fallback, admin gates
│   │   ├── auth.js   HMAC createToken / verifyToken, scrypt verifyPassword
│   │   └── seedNotes.js  30+ approved shared comments seeded on fresh DB
│   └── test/
│       ├── api.test.js            19 tests — CRUD, auth, RBAC, search, sync
│       └── neon-provision.test.js  6 tests — Neon sub provisioning
├── api/
│   └── index.js      Vercel serverless handler (cached pool, bodyParser:false,
│                     same-origin /neonauth proxy for first-party cookies)
├── web/              React 19 + Vite 7 PWA
│   ├── src/
│   │   ├── App.jsx / AppContext.jsx / main.jsx / styles.css
│   │   ├── components/  Rail, TopBar, LibraryView, CommentCard, CommentDetail,
│   │   │               CommentEditor, RichText, AdminView, Login, InstallButtons …
│   │   └── lib/
│   │       ├── richtext.js   emptyDoc / textOf / htmlOf (escapes, <b>/<i>/<ul>)
│   │       ├── store.js      IndexedDB (DB v2: kv, comments, categories, queue, recently)
│   │       ├── sync.js       queueComment → syncNow (push LWW, pull since=lastSync)
│   │       ├── search.js     matchesQuery / filterComments / allTags
│   │       ├── neonAuth.js   createAuthClient wrapper (token() + credentials:include)
│   │       ├── clipboard.js  rich + plain copy
│   │       └── modal.js
│   └── test/
│       └── lib.test.js        7 tests — richtext + search
├── desktop/          Tauri v2 Windows wrapper (src-tauri/, auto-update)
├── neon.ts           Neon infra-as-code (auth:true, branch TTL 7d)
└── vercel.json       buildCommand, outputDirectory, rewrites (/neonauth, /api, SPA)
```

**Request flow (prod)**

```
Browser ── /neonauth/* ──▶ Vercel rewrite ──▶ api/index.js handleNeonAuthProxy ──▶ Neon Auth
        ── /api/*      ──▶ Vercel rewrite ──▶ api/index.js buildApi(db, secret)
        ── /*          ──▶ /index.html (SPA fallback)
                                     │
                              openDb() → pg Pool (DATABASE_URL) or node:sqlite
```

---

## Quick Start

**Requirements:** Node >= 22.5

```bash
# 1. Install
npm install

# 2. Environment — pick one:
npx neon env pull              # pulls DATABASE_URL*, NEON_AUTH_* → .env.local
# or: copy .env.example → .env.local and fill in DATABASE_URL etc.

# 3a. With Neon (uses Postgres)
npm run server                 # http://localhost:3001

# 3b. Without DATABASE_URL (uses node:sqlite at server/data/diagnotes.db)
#     — no native build, no Postgres needed
npm run server

# 4. In another terminal — web app (proxies /api → :3001 in dev)
npm run web                    # http://localhost:5173
```

Open http://localhost:5173 — the shared library is visible without login. Create an account or sign in to copy and contribute.

### Default dev credentials (sqlite only)

```
email:    diagnotes@center.local
password: devpassword
```

Override with `DIAGNOTES_EMAIL` / `DIAGNOTES_PASSWORD`. In Postgres/production the server **throws on boot** if these are missing — no default-password fallback. The first Neon Auth signup is automatically promoted to `admin`.

> **Tests never touch Neon.** `openDb(dataDir)` forces sqlite when `dataDir` contains `diagnotes-test-` (see `server/test/api.test.js`). Never set `DATABASE_URL` when running the server tests against a temp dir.

---

## Environment Variables

Canonical list is [`.env.example`](./.env.example).

| Variable                | Required | Description                                                                                                                       |
| ----------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | Prod     | Neon pooled connection string (`-pooler`)                                                                                         |
| `DATABASE_URL_UNPOOLED` | Prod     | Direct connection string — migrations / `pg_dump`                                                                                 |
| `NEON_BRANCH`           | Prod     | Neon branch name (e.g. `production`)                                                                                              |
| `NEON_AUTH_BASE_URL`    | Prod     | Neon Auth base URL (`https://ep-xxx.neonauth…/neondb/auth`)                                                                       |
| `NEON_AUTH_JWKS_URL`    | Prod     | Neon Auth JWKS endpoint (`…/auth/.well-known/jwks.json`)                                                                          |
| `DIAGNOTES_EMAIL`       | Prod     | Seed admin email (first Neon signup also becomes admin)                                                                           |
| `DIAGNOTES_PASSWORD`    | Prod     | Seed admin password (scrypt-hashed into `accounts`)                                                                               |
| `DIAGNOTES_SECRET`      | Prod     | HMAC signing secret — 32+ hex bytes (`crypto.randomBytes(32).toString('hex')`)                                                    |
| `CORS_ORIGIN`           | Prod     | Allowed origins, comma-separated (`https://your-app.vercel.app`) or `*`                                                           |
| `VITE_API_BASE_URL`     | —        | API base for the web build. Empty = same-origin (`/api` rewrite). Set to `https://…` for cross-origin                             |
| `VITE_NEON_AUTH_URL`    | —        | Neon Auth URL for the web client. `/neonauth` in prod (same-origin proxy), full `https://…` URL in dev. Empty = legacy HMAC login |
| `PORT`                  | —        | Server port (default `3001`)                                                                                                      |
| `DIAGNOTES_SEED_DEMO`   | —        | `0` to skip seeding demo categories/comments on fresh DB                                                                          |
| `DIAGNOTES_DATA`        | —        | Override sqlite data dir (default `server/data`)                                                                                  |

**Loading order**

1. `process.env` wins.
2. `server/index.js` manually loads `.env.local` from `server/../.env.local`, a Windows-alt path, and `cwd/.env.local` — but only if `DATABASE_URL` is not already set.
3. `server/lib/db.js` does the same for direct `openDb` callers (e.g. `api/index.js`).
4. `neon env pull` writes `.env.local`; `vercel env pull` / `vercel env add` manages Vercel env.

---

## API Reference

Base path: `/api`. All timestamps are **epoch ms**. Auth: `Authorization: Bearer <token>` (Neon Auth JWT preferred, HMAC fallback).

### Public (no auth)

| Method | Path                                                             | Description                                                                                                     |
| ------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/health`                                                    | `{ ok, branch, time }`                                                                                          |
| `GET`  | `/api/categories`                                                | List active categories (`archived=0`, ordered by name)                                                          |
| `GET`  | `/api/comments?type=shared`                                      | Browse approved shared comments (public visitors are forced to `type=shared&status=approved`)                   |
| `GET`  | `/api/comments/:id`                                              | Single comment — public visitors only see `shared`+`approved`                                                   |
| `GET`  | `/api/comments?q=&category_id=&tag=&type=&status=&limit=&since=` | Filtered search. `q` does `LIKE %q%` on title/body. `since` requires auth. `limit` capped at 500 (default 200). |

### Authenticated

| Method   | Path                          | Description                                                                                          |
| -------- | ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| `POST`   | `/api/auth/login`             | `{ email, password }` → `{ token, account:{id,email,role} }`                                         |
| `GET`    | `/api/auth/me`                | Current user `{ account:{id,email,role} }`                                                           |
| `GET`    | `/api/comments?type=personal` | Own snippets + filtered queries (auth unlocks all filters)                                           |
| `POST`   | `/api/comments`               | Create `{ title, body, type, status, category_id, tags }` → `{ id, created_at, updated_at }`         |
| `PATCH`  | `/api/comments/:id`           | Update own comment (partial)                                                                         |
| `DELETE` | `/api/comments/:id`           | Soft-delete (`deleted=1`)                                                                            |
| `POST`   | `/api/comments/:id/copy`      | Bump `copy_count`                                                                                    |
| `POST`   | `/api/comments/:id/submit`    | `personal` → `pending_approval` (shared library submission)                                          |
| `GET`    | `/api/sync?since=<ms>`        | Bulk pull — `{ comments, categories, serverTime }` since timestamp                                   |
| `POST`   | `/api/sync`                   | Bulk push — `{ comments: [...] }` → `{ created, updated, conflicts, skipped }` (LWW on `updated_at`) |

### Admin only

| Method  | Path                              | Description                                                                   |
| ------- | --------------------------------- | ----------------------------------------------------------------------------- |
| `POST`  | `/api/categories`                 | Create category `{ name }` → `{ id, name, archived, created_at, updated_at }` |
| `PATCH` | `/api/categories/:id`             | Update / archive `{ name?, archived? }`                                       |
| `POST`  | `/api/admin/comments/:id/approve` | `pending_approval` → `approved`                                               |
| `POST`  | `/api/admin/comments/:id/reject`  | `→ rejected` with optional `{ reason }` → `rejection_reason`                  |
| `GET`   | `/api/admin/stats`                | `{ total, pending, topCopied: Comment[] }` (top 10 by `copy_count`)           |

**Auth details**

- Neon Auth JWT is verified via `jose` `createRemoteJWKSet(NEON_AUTH_JWKS_URL)` with `issuer = new URL(NEON_AUTH_BASE_URL).origin`. No `audience` check — Better Auth JWTs carry no `aud` claim.
- On success the principal is resolved via `findOrProvisionNeonAccount` (lookup `email` → `neon_sub` → auto-provision with `neon_sub` unique, empty `password_hash`/`salt`, `role = admin` for the very first account).
- HMAC fallback: `token = base64url(payload).hexSignature` (`server/lib/auth.js`, `DIAGNOTES_SECRET`).

---

## Data Model

**Postgres + sqlite share the same schema** (see `migratePg` / `migrateSqlite` in `server/lib/db.js`).

| Table        | Key columns                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------- |
| `accounts`   | `id PK`, `email UNIQUE`, `password_hash`, `salt`, `neon_sub UNIQUE`, `role ('user'          | 'admin')`, `created_at`                                           |
| `categories` | `id PK`, `name UNIQUE`, `archived`, `created_at`, `updated_at` (+ `idx_categories_updated`) |
| `comments`   | `id PK`, `type ('personal'                                                                  | 'shared')`, `title`, `body (JSON)`, `body_text`, `status ('draft' | 'pending_approval' | 'approved' | 'rejected')`, `category_id FK`, `tags (JSON)`, `rejection_reason`, `copy_count`, `deleted`, `archived`, `created_at`, `updated_at`(+`idx_comments_updated`) |

- `body` is a JSON array of blocks: `{ t:'p', r:[{x:'text', b:1, i:1, u:1}] }` or `{ t:'ul'|'ol', items:[{r:[…]}] }`.
- `body_text = textOf(body)` — plain-text projection used for `LIKE` search and list previews.
- Placeholder translation: `db.prepare(sql)` rewrites `?` → `$1..$n` for `pg` (`wrapPgPool`), sqlite stays `?` — always write `?` in queries.
- Statements are **async on pg, sync on sqlite** — always `await` `stmt.get/all/run`. `count`/`pending` may be string `BIGINT` on pg; `decodeComment` coerces numeric fields.

---

## Offline & Sync

- **IndexedDB** (`web/src/lib/store.js`, `DB_VERSION 2`): stores `kv` (keyPath `key`), `comments`, `categories`, `queue` (autoIncrement), `recently`.
- `queueComment()` generates `c…` ids, drops poison rows where `id` is `undefined`, and enqueues with LWW on `updated_at`.
- `syncNow()` pushes the queue (valid entries) then pulls `GET /api/sync?since=lastSync`.
- Neon Auth JWTs live ~15 min — `sync.js` / `serverCall` refresh once on 401 before failing.

---

## PWA

Configured in `web/vite.config.js` via `vite-plugin-pwa` (`registerType: autoUpdate`).

- Manifest: `name DiagNotes`, `theme_color #0E7C86`, `display standalone`, icons `any / 192 / 512`.
- Workbox: `globPatterns **/*.{js,css,html,svg,png,woff2}`, `navigateFallback /index.html`, precache ~508 KiB (19 entries).
- Offline: previously loaded comments remain browsable; authenticated queue syncs on reconnect.
- Install: Chrome/Edge/Safari show **Install App** in the sidebar footer; mobile uses **Add to Home Screen**.

---

## Desktop App

Tauri v2 wrapper around the Vite build — native Windows `.exe` + `.msi` with auto-update.

**Requirements:** [Rust toolchain](https://rustup.rs) + Node 22+

```bash
# 1. Build the web app
npm run build

# 2. Desktop deps
cd desktop && npm install

# 3. Dev (hot reload)
npm run tauri dev

# 4. Release bundles
npm run tauri build
# → desktop/src-tauri/target/release/bundle/nsis/DiagNotes_0.1.0_x64-setup.exe
# → desktop/src-tauri/target/release/bundle/msi/DiagNotes_0.1.0_x64_en-US.msi
```

Download the latest installer: [github.com/rumanalivuia/diagnotes/releases/latest](https://github.com/rumanalivuia/diagnotes/releases/latest)

---

## Deployment

### Neon + Vercel (order matters)

```bash
# 1. Link Neon (project royal-resonance-97237468, branch production)
npx neon link --project-id royal-resonance-97237468 --branch production -y
# Non-interactive commands need --org-id org-damp-sun-46973835
npx neon env pull   # writes .env.local (DATABASE_URL*, NEON_AUTH_*)

# 2. Link Vercel
vercel link --yes   # creates .vercel/project.json, connects GitHub repo

# 3. Set production env (DATABASE_URL, DATABASE_URL_UNPOOLED, NEON_BRANCH,
#    NEON_AUTH_BASE_URL, NEON_AUTH_JWKS_URL, DIAGNOTES_EMAIL/PASSWORD/SECRET, CORS_ORIGIN)
vercel env add DATABASE_URL production
vercel env add DATABASE_URL_UNPOOLED production
vercel env add NEON_AUTH_BASE_URL production
vercel env add NEON_AUTH_JWKS_URL production
vercel env add DIAGNOTES_EMAIL production
vercel env add DIAGNOTES_PASSWORD production
vercel env add DIAGNOTES_SECRET production
vercel env add CORS_ORIGIN production
# To change a value: vercel env rm <NAME> production --yes  then  vercel env add …

# 4. Deploy
vercel --prod --yes
# Vercel auto-deploys on push to main (vercel.json: buildCommand npm run build --workspace web)
```

`vercel.json` rewrites:

| Source           | Destination                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| `/neonauth/(.*)` | `/api` (same-origin Neon Auth proxy — first-party cookies, forwards `Origin`/`Referer` for Better Auth CSRF) |
| `/api/(.*)`      | `/api`                                                                                                       |
| `/(.*)`          | `/index.html` (SPA fallback)                                                                                 |

`VITE_API_BASE_URL=""` → same-origin `/api` (Vite dev proxy `vite.config.js:33` forwards to `:3001` locally). Set to `https://…` for cross-origin.

**Neon Auth origins** must be allowlisted or signup fails with `INVALID_ORIGIN`:

```bash
npx neon neon-auth domain add https://your-app.vercel.app --project-id royal-resonance-97237468 --branch production --org-id org-damp-sun-46973835
npx neon neon-auth domain allow-localhost enable --project-id royal-resonance-97237468 --org-id org-damp-sun-46973835  # dev
```

`VITE_NEON_AUTH_URL=/neonauth` in prod (relative, same-origin via the proxy so `SameSite=None; Partitioned` cookies are not blocked in Safari/Firefox). Absolute Neon URL in dev with `credentials:'include'`.

---

## Testing

```bash
npm test                          # all: 25 server + 7 web
npm --workspace server test       # node --test server/test/*.test.js
npm --workspace web test          # node --test web/test/lib.test.js
npm run build                     # vite build → web/dist (also validates PWA precache)
npm run lint; npm run typecheck; npm run format:check
```

- Server tests use **sqlite temp dirs** (`diagnotes-test-*`) — never hit Neon. They pin `DIAGNOTES_EMAIL/PASSWORD` explicitly so ambient `.env.local` cannot leak prod creds.
- Web tests cover `richtext` (`textOf`/`htmlOf`/`emptyDoc`) and `search` (`matchesQuery`/`filterComments`/`allTags`).
- `server/test/e2e-smoke.mjs` — optional live smoke against a running server.

---

## Project Structure

```
diagnotes/
├── server/           # Node HTTP + REST API
├── api/              # Vercel serverless entry (reuses server/lib/*)
├── web/              # React 19 + Vite 7 + PWA
├── desktop/          # Tauri v2 Windows wrapper
├── neon.ts           # Neon infra-as-code
├── vercel.json       # Build + rewrites + function includeFiles
├── package.json      # npm workspaces (server, web)
├── .env.example      # Canonical env var list
└── AGENTS.md         # Contributor / agent guide (stack, env, DB gotchas, security rules)
```

Ignored (`.gitignore`): `node_modules`, `.neon`, `.env.local`, `.vercel`, `server/data`, `web/dist`, `.mimosa/`, `graphify-out/`.

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, code style, and PR guidelines.

Quick checklist:

- Node >= 22.5, `npm install`, `npm run server` + `npm run web`.
- `npm test` must pass (sqlite, no `DATABASE_URL`).
- `npm run lint` / `npm run typecheck` / `npm run build` clean.
- Keep the security invariants in [AGENTS.md](./AGENTS.md#security-rules-from-2026-09-04-review--do-not-regress) — JWT issuer = origin of `NEON_AUTH_BASE_URL`, no `audience` check, HMAC + Neon Auth dual path.

---

## License

[MIT](./LICENSE) — Copyright (c) 2026 Ruman Alivuia

## Author

**Ruman Alivuia** — [github.com/rumanalivuia](https://github.com/rumanalivuia)
