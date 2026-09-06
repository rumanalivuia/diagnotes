# DiagNotes — Decisions Log

## Resolved during v1 build (from PRD §9)

| #   | Decision                    | Resolution                                                    | Notes                                                                      |
| --- | --------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | Admin identity              | Main shared login IS the admin account; no separate PIN layer | Single account per center                                                  |
| 2   | Multi-tenancy               | Not needed — single center per deployment                     | Server seeds one account                                                   |
| 3   | Offline conflict resolution | **Last-write-wins** (`updated_at` compare)                    | No merge UI in v1                                                          |
| 4   | Category list               | Admin-editable (add / rename / archive)                       | `archived` flag hides from users, keeps referential integrity              |
| 5   | Personal snippet category   | Optional for personal; **required** for shared                | Enforced in UI + API                                                       |
| 6   | Windows app auto-update     | Tauri v2 + `tauri-plugin-updater`                             | Config scaffolded; needs Rust toolchain + signing key to produce artifacts |

## Rich text format (PRD §9 open item — now decided)

**Decision: JSON block model, not HTML or Quill Delta.**

```js
[{ t: 'p', r: [{ x: 'text' }, { x: 'bold', b: 1 }] },
 { t: 'ul', items: [{ r: [...] }] }]
```

Why:

- **No HTML injection / XSS surface** — stored data is data; rendered via React
  text nodes. The server never re-serves markup.
- **Trivial LWW sync** — a blocks array JSON.stringify's to a stable string;
  no DOM/Delta version skew between clients.
- **Exact clipboard output control** — we generate the rich HTML (`<b>`, `<ul>`)
  and plain text (`•` bullets) ourselves at copy time, so paste into Word and
  Notepad both behave.
- Toolbar/editor built on contentEditable + native `execCommand` (bold/italic/
  underline/lists), serialized back to blocks on input — no heavy editor dep.

## Tech stack actually used

- **Server**: Node ≥22.5 — Neon Lakebase Postgres via `pg` (pooled `DATABASE_URL`) with `node:sqlite` fallback for local/tests; `node:http`, `node:crypto` scrypt + HMAC + `jose` for Neon Auth JWT verify.
- **Persistence**: Neon project `royal-resonance-97237468` branch `production` (aws-ap-southeast-1, pg 18). `.neon` + `neon.ts` (`auth: true`) + `.env.local` pulled via `neon deploy`. Vercel env `DATABASE_URL*`, `NEON_AUTH_*`, `DIAGNOTES_EMAIL`, `DIAGNOTES_PASSWORD`, `DIAGNOTES_SECRET`, `CORS_ORIGIN`.
- **API**: `server/lib/api.js` async (awaits all stmts, handles `BIGINT` string coercion), `server/lib/db.js` dual-mode wrapper (`wrapPgPool`/`wrapSqliteDb`, `toPg` placeholder translation), `api/index.js` Vercel handler (caches pool, rewrites `/api/*` -> `/api` via `vercel.json`).
- **Web**: React 19 + Vite 7 + vite-plugin-pwa. Fonts via fontsource (IBM Plex),
  bundled locally for offline. `VITE_API_BASE_URL` for separate API origin (empty = same-origin).
- **Storage**: IndexedDB (`comments`, `categories`, `queue`, `recently`, `kv`).
- **Desktop**: Tauri v2 (scaffolded; not compiled — no Rust on this machine).
- **Copy**: async `ClipboardItem` with `text/html` + `text/plain`; textarea
  `execCommand` fallback.

## Neon migration (2026-09-02)

| #   | Decision                     | Resolution                                                                                                                                                                                                                                                                                               | Notes                                                                                       |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 7   | Persistence                  | Migrated from `node:sqlite` WAL file to Neon Lakebase Postgres (project `royal-resonance-97237468`, branch `production`, `sslmode=require`)                                                                                                                                                              | Keeps sqlite fallback for `diagnotes-test-*` temp dirs and local dev without `DATABASE_URL` |
| 8   | Auth                         | `auth: true` in `neon.ts` — Neon Auth JWT (JWKS at `NEON_AUTH_JWKS_URL`) verified via `jose` before HMAC fallback                                                                                                                                                                                        | Web login still uses `POST /api/auth/login` HMAC; future SDK can use Neon Auth directly     |
| 9   | Deploy                       | Vercel `vercel.json` builds `web/dist`, rewrites `/api/(.*)` -> `api/index.js`, includes `server/**`; `CORS_ORIGIN` allowlist, `VITE_API_BASE_URL` for cross-origin                                                                                                                                      | `api/index.js` caches `openDb` pool across invocations                                      |
| 10  | Secrets                      | `.env.local` pulled by `neon deploy` (5 vars), `.env.example` documents all; `.neon` is gitignored, real org is `org-damp-sun-46973835`                                                                                                                                                                  | `neon link --no-checks` initially used dummy `org-test`, fixed after `neon status`          |
| 11  | DB wrapper                   | `toPg` `?` -> `$n` translation, async `prepare` wrappers, `BIGINT` string coercion in `decodeComment`, `migratePg` vs `migrateSqlite`                                                                                                                                                                    | Tests force sqlite via `dataDir.includes('diagnotes-test-')`                                |
| 12  | Security review (2026-09-04) | F1: pg path fails hard without `DIAGNOTES_EMAIL`/`PASSWORD` (no `admin123` fallback in prod); sqlite dev keeps `devpassword` + warning. F3: Neon JWT verified with `issuer` = origin of `NEON_AUTH_BASE_URL` (per Neon docs; no `aud` — Better Auth JWTs carry none) + binding to local `accounts` table | Rotate already-seeded prod account; set `DIAGNOTES_EMAIL`/`PASSWORD` Vercel env vars        |

## Design decisions (frontend)

- Cool paper background (`#F3F6F8`) + medical-navy ink + clinical teal accent —
  a deliberate "lab bench" identity, not the default cream/serif SaaS template.
- IBM Plex Sans (variable) + Plex Mono readouts; latin-only subsets bundled
  (kept PWA precache lean at ~500 KiB).
- Copy is the hero affordance on every card (button flips to a check + toast);
  filters live in a left rail; result column is a fast single-column scan.

## Post-mortem bugs fixed during e2e (worth remembering)

1. `json()` returned `undefined` → every handled request also wrote a 404
   (`ERR_HTTP_HEADERS_SENT`). Fixed: return `true`.
2. Route id regex `[a-f0-9]+` rejected non-hex ids like `offline-created-001`.
3. IndexedDB `tx()` resolved the _request_ not the _result_ → reads returned
   garbage. Fixed by capturing `req.result`.
4. `kv` store created without `keyPath: 'key'` → `put({key,value})` failed.
5. **`sync.js` wiped the stored token to `null` on any 401** — a single bad
   sync permanently logged the user out. Removed.
6. New comments had no client `id` → `store.get(undefined)` crash. Fixed:
   generate id in `queueComment`.
7. **Stale queue records with `id: undefined` 500'd the whole `/api/sync` push
   and blocked all future syncs** (a poison-pill row). Fixed on both ends:
   client drops invalid queue rows; server skips malformed payloads.
8. `submitToShared` failed for local-only comments (server didn't know them).
   Fixed: sync-first in the action.
9. StrictMode + a `bootRef` guard left the app stuck on "Loading…" after an
   IndexedDB delete raced the boot. (Not a production path; the fresh profile
   confirmed clean boot.)
