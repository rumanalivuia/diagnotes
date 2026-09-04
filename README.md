# DiagNotes

A fast, searchable storehouse of reusable diagnostic report comments for
medical technologists and pathologists. Search → copy → paste into the LIS/Word
report system you already use. No integration, no report generation, no patient
data — pure search-and-paste utility (PRD v1). **Now on Neon Lakebase Postgres + Vercel.**

[![Neon](https://img.shields.io/badge/Postgres-Neon-00E699?style=flat-square)](https://neon.tech) [![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?style=flat-square)](https://vercel.com) [![Node](https://img.shields.io/badge/Node-%3E%3D22.5-339933?style=flat-square)](https://nodejs.org)

## Architecture

```
diagnotes/
├── server/   Node.js sync server — Neon Postgres (pg) + node:sqlite fallback for tests
│   ├── lib/db.js    dual-mode schema (pg/sqlite), seeding, scrypt auth
│   ├── lib/api.js   REST API + sync endpoints (async, Neon Auth JWT + HMAC)
│   ├── lib/auth.js  HMAC fallback + jose JWKS verify for Neon Auth
│   └── test/        18 passing API tests (node --test, sqlite isolated)
├── api/      Vercel serverless handler (api/index.js) — same buildApi, pooled pg
├── web/      React 19 + Vite 7 web app (primary interface, PWA offline)
│   ├── src/lib/     richtext model, IndexedDB store, sync engine, search, clipboard
│   ├── src/components/  Rail, TopBar, cards, rich editor, admin, login
│   └── test/        7 passing lib tests
├── desktop/  Tauri v2 wrapper (Windows .exe + auto-update) — scaffolded
├── neon.ts   Neon infrastructure-as-code (auth: true, branch ttl 7d)
├── vercel.json  Build web + rewrites /api -> api/index.js
└── package.json  npm workspaces (server, web) + pg/jose at root for Vercel
```

## Quick start

Requirements: **Node ≥ 22.5**, Neon project `royal-resonance-97237468` (production branch), Vercel CLI optional.

```bash
npm install

# 1) Pull Neon env (DATABASE_URL, Neon Auth) into .env.local
npx neon@latest env pull  # or: neon link --project-id royal-resonance-97237468 --branch production -y && neon env pull

# terminal 1 — sync server (default http://localhost:3001, uses Neon Postgres when DATABASE_URL is set, else sqlite)
npm run server

# terminal 2 — web app (default http://localhost:5173, vite proxy -> localhost:3001)
npm run web
```

Local fallback: without `DATABASE_URL` the server uses `node:sqlite` at `server/data/diagnotes.db` — no native compile, zero deps. Tests always use sqlite temp dirs.

Open http://localhost:5173 and sign in with the dev account:

```
email:    diagnotes@center.local
password: devpassword
```

Set `DIAGNOTES_EMAIL` / `DIAGNOTES_PASSWORD` env vars (and `DIAGNOTES_SECRET`)
to override the shared center login. Local sqlite dev falls back to the
`devpassword` account with a console warning; **production Postgres fails hard
at startup if `DIAGNOTES_EMAIL`/`DIAGNOTES_PASSWORD` are unset** — never deploy
with defaults. In production these are Vercel env vars + Neon secrets.
`CORS_ORIGIN` restricts allowed origins; `VITE_API_BASE_URL` points the web at a separate API origin (empty = same-origin via Vercel rewrite).

### Neon setup (already linked)

```bash
npm i -g neon@latest && neon login
neon skills -y
neon mcp -y --oauth
neon link --project-id royal-resonance-97237468 --branch production -y
neon config init -s auth  # writes neon.ts with auth:true
neon deploy               # applies neon.ts to production, pulls .env.local
```

`neon.ts` declares `auth: true` (Neon Auth) + per-branch TTL. The `api/` Vercel handler verifies both Neon Auth JWTs (via `NEON_AUTH_JWKS_URL` + `jose`) and the legacy HMAC `diagnotes@center.local` token.

## What's implemented (v1)

| Feature | Where |
|---|---|
| Personal snippets (private, editable) | web editor + queue |
| Rich text (bold/italic/underline/lists) | block model → inert render |
| Submit snippet → shared library (pending queue) | `POST /api/comments/:id/submit` |
| Admin approve/reject (with reason) | `POST /api/admin/comments/:id/{approve,reject}` |
| Browse shared by category; tag filter | client + server AND filters |
| Full-text search (title + body) | `LIKE` over `body_text` |
| One-click Copy → rich + plain clipboard | async ClipboardItem w/ textarea fallback |
| Recently-copied / recently-used list | IndexedDB `recently` store |
| Sync & offline | IndexedDB local store + queue, LWW |
| Admin panel | categories CRUD, review queue, stats |
| Single shared login | scrypt + HMAC bearer token |
| PWA (installable, offline) | vite-plugin-pwa |
| Windows desktop wrapper | Tauri v2 scaffold + updater config |

## Verify it works

```bash
npm test                 # server (18) + web lib (7) — server uses sqlite temp isolation
npm run build            # production web build + PWA (precache ~508 KiB)
# with Neon:
node --env-file=.env.local server/test-pg-api.js  # health, categories, sync smoke (pg)
```

## Deploy to Vercel (web + api)

`vercel.json` builds `web/dist` and routes `/api/*` to `api/index.js` (pooled `DATABASE_URL`).

```bash
vercel link --project diagnotes
vercel env add DATABASE_URL production          # paste pooled DATABASE_URL from .env.local
vercel env add DATABASE_URL_UNPOOLED production # optional, for migrations
vercel env add NEON_AUTH_BASE_URL production
vercel env add NEON_AUTH_JWKS_URL production
vercel env add DIAGNOTES_EMAIL production
vercel env add DIAGNOTES_PASSWORD production
vercel env add DIAGNOTES_SECRET production
vercel env add CORS_ORIGIN production           # e.g. https://diagnotes.vercel.app
vercel --prod
```

The project is `diagnotes` in the `rumanalivuia` GitHub org — Vercel auto-deploys on push to `main`.

End-to-end flows were verified against a live headless Chrome (CDP):
login → sync → browse/search → copy → create rich-text snippet →
submit → admin approve → shared library; plus offline browse/search/create
and reconnect sync without data loss. See `QA.md`.

## API overview

```
POST /api/auth/login                        → { token, account }
GET  /api/categories                        list active categories
POST /api/categories                        add category
PATCH /api/categories/:id                   rename / archive
GET  /api/comments?type=&category_id=&tag=&q=&status=   search/filter
POST /api/comments                          create
GET/PATCH/DELETE /api/comments/:id          get / update / soft-delete
POST /api/comments/:id/copy                 bump copy_count
POST /api/comments/:id/submit               personal → pending_approval
POST /api/admin/comments/:id/approve        approve shared submission
POST /api/admin/comments/:id/reject         reject (with reason)
GET  /api/admin/stats                       totals + top-copied
GET  /api/sync?since=<ms>                   pull deltas (comments+categories)
POST /api/sync                              push queued offline mutations
```

Auth: `Authorization: Bearer <token>` on all routes except login.
Timestamps are epoch ms. `deleted` is a soft-delete flag; sync tombstones
propagate deletes.

## Design

- **Type**: IBM Plex Sans (variable) + IBM Plex Mono for data/readouts.
- **Palette**: cool paper `#F3F6F8`, white surfaces, medical-navy ink `#14202B`,
  clinical teal `#0E7C86` for the Copy action, muted status chips.
- **Layout**: left filter rail (source / category / tag) + fast-scanning result
  column. Desktop-first; rail collapses below 900px.
- **Signature**: the Copy button as the hero on every card (flips to a check +
  toast), plus mono readouts (copy counts, timestamps, tags) for an instrument
  feel. Nothing decorative.

## Notes & decisions

- Rich text stored as a **JSON block model** (not HTML) — the PRD's open item
  §9. Rationale: safe to render anywhere (no HTML injection), trivial to diff
  for LWW sync, and we control the clipboard HTML output exactly.
- Offline conflict resolution: last-write-wins (PRD §9.3).
- No multi-tenancy; one shared center login per deployment.
- The `desktop/` wrapper is configured but requires a Rust toolchain to
  compile into an installer (see `desktop/README.md`).
