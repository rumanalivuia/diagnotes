# AGENTS.md — DiagNotes

## Stack & Boundaries
- **Monorepo**: `npm workspaces` `server`, `web` (`package.json:7`), `desktop/` Tauri v2 wrapper (needs Rust), `api/` Vercel serverless that reuses `server/lib/*` (`vercel.json:10` `includeFiles: server/**`). Root `type: module` (`package.json:4`).
- **Runtime**: Node ≥22.5 (`package.json:18`, `server/package.json:7`). `server` uses `node:sqlite` **fallback** + `pg` + `jose`; `web` is React 19 + Vite 7 + `vite-plugin-pwa`.
- **Neon**: project `royal-resonance-97237468` branch `production` (`org-damp-sun-46973835`, `aws-ap-southeast-1`, pg18) — `.neon:2`, `neon.ts:3` `auth:true`. Vercel project `rumanalivuia/diagnotes` (`team_U91O6Tgeu3avPd7mxpBS3Hkr`, `prj_R6prvmglXqQ7sUAl4oJVDNCKq9zo`).

## Commands
```bash
npm install
npm run server           # node --watch server/index.js :3001 (uses Neon pg when DATABASE_URL set, else sqlite server/data/diagnotes.db)
npm run web              # vite :5173 proxy /api → :3001 (vite.config.js:33)
npm test                 # 18 server + 7 web lib
npm --workspace server test   # single package; server test is node --test test/api.test.js
npm --workspace web test      # single package; node --test test/lib.test.js
npm run build            # vite build → web/dist (PWA precache ~508 KiB, 19 entries)
npx neon env pull        # pulls DATABASE_URL* + NEON_AUTH_* to .env.local (must run before server with Neon)
vercel --prod --yes      # linked via .vercel/project.json, vercel.json buildCommand npm run build --workspace web
```

## Env & Deploy (order matters)
1. `npx neon link --project-id royal-resonance-97237468 --branch production -y` (`.neon`) → `neon deploy` (`neon.ts` applies `auth:true`, writes `.env.local`). Non-interactive neon commands need `--org-id org-damp-sun-46973835` (otherwise it prompts for org).
2. `vercel link --yes` (creates `.vercel/project.json`, connects https://github.com/rumanalivuia/diagnotes, merges `.env.local`).
3. `vercel env add <NAME> production|preview` for `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_BRANCH`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_JWKS_URL`, `DIAGNOTES_EMAIL/PASSWORD/SECRET`, `CORS_ORIGIN` (`.env.example:1` is canonical list; empty `VITE_API_BASE_URL` = same-origin rewrite).
4. `VITE_API_BASE_URL` empty → `web/src/lib/sync.js:46` & `AppContext.jsx:68` fetch `/api…`; set to `https://…` for cross-origin.

`server/index.js:12` manually loads `.env.local` from `server/../.env.local`, alt `E:\…\diagnotes\.env.local`, and `cwd/.env.local` only if `DATABASE_URL` not already set — `process.env` wins.

## DB / API Gotchas
- **`server/lib/db.js:116` is async**: `openDb(dataDir)` returns `{db, pool, kind}`; `kind==='pg'` when `DATABASE_URL` set **except** `dataDir.includes('diagnotes-test-')` forces sqlite (test isolation — never hit prod Neon from `server/test/api.test.js:24` temp dirs). Always `await openDb`.
- **Prod fails hard without seed creds**: pg path throws unless `DIAGNOTES_EMAIL`/`DIAGNOTES_PASSWORD` are set (`db.js:132-133`) — no default-password fallback in production. sqlite dev falls back to `diagnotes@center.local` / `devpassword` with a console warning (`db.js:158-164`).
- **Tests pin dev creds explicitly** (`api.test.js:28-29` sets `DIAGNOTES_EMAIL/PASSWORD` before `openDb`) so ambient `.env.local` can never leak prod creds into tests — keep this pattern; dev password is `devpassword` everywhere (tests, `Login.jsx` hint, README), never `admin123`.
- **Placeholder translation**: `db.prepare(sql)` wraps `?` → `$1..$n` via `toPg` for `pg` (`wrapPgPool:200`); sqlite path stays `?`. Do not hand-write `$n` in queries.
- **Stmts are async on pg**: `api.js` `prepareAll` returns `{get,all,run}` that are `async` for pg, sync for sqlite — always `await`. `count`/`pending` rows may be `string` BIGINT; `decodeComment:369` coerces `created_at/updated_at/copy_count` from string.
- **Migrations**: `migratePg`/`migrateSqlite` (`db.js:256`) — pooled `DATABASE_URL` for app, `DATABASE_URL_UNPOOLED` for `pg_dump`/migrations (see `neon-postgres` skill).
- **Auth**: `server/lib/auth.js:11` HMAC `token = b64(payload).sig`; `server/lib/api.js:5` verifies Neon Auth JWT first (`NEON_AUTH_JWKS_URL` + `jose` `createRemoteJWKSet`), falls back to HMAC — keep both. `verifyPassword` is scrypt `timingSafeEqual`.

## Security Rules (from 2026-09-04 review — do not regress)
- **JWT issuer = origin of `NEON_AUTH_BASE_URL`, not the full URL** (`api.js:15`: `new URL(...).origin`). Per Neon docs, `iss` is e.g. `https://ep-xx.aws.neon.tech` for base `https://ep-xx.aws.neon.tech/neondb/auth`.
- **No `audience` check on Neon JWTs**: Better Auth JWTs carry no `aud` claim, and `jose` rejects tokens that lack a claim listed in options — pinning `aud` breaks all Neon logins. Issuer + account binding is the documented contract.
- **Neon principals must bind to `accounts`** (`api.js:70-76`: `payload.email` → account, else `sub` → account id, else reject). Valid-signature-but-unprovisioned tokens get 401.
- **Rotation runbook** (password change): scrypt-hash the new value into `accounts` via `DATABASE_URL_UNPOOLED`, `vercel env rm <NAME> production --yes` + `vercel env add`, redeploy, then live-verify login 200 + old password 401. Generate → rotate → verify in ONE script so the password is never hand-transcribed (transcription mismatch caused a real rotation failure once).

## Web & Vercel Quirks
- `vercel.json:5` rewrites `/api/(.*)→/api` and `/(.*)→/index.html`, `outputDirectory: web/dist`, `functions.api/index.js.includeFiles: server/**` — `api/index.js:1` imports `../server/lib/db.js` + `buildApi`, caches pool, disables `bodyParser`.
- `web/src/lib/sync.js` / `AppContext.jsx` use `import.meta.env.VITE_API_BASE_URL` — rebuild after changing it; dev proxy (`vite.config.js:33`) only applies locally.
- **IndexedDB** (`web/src/lib/store.js:8` `DB_VERSION 2`, stores `kv` `keyPath:'key'`, `comments`, `categories`, `queue:autoIncrement`, `recently`) — `store.putMany`/`queue` LWW on `updated_at` (`sync.js:91` `queueComment` generates `c…` ids, drops `id:undefined` poison rows, `syncNow` pushes valid then pulls `since=lastSync`).
- **History**: `server/lib/auth.js`, `server/lib/db.js`, `web/src/lib/sync.js` bug fixes in `DECISIONS.md:54` (json return `true`, `[A-Za-z0-9_-]` ids, `kv` keyPath, 401 token wipe, poison queue).

## Repo Hygiene
- `.gitignore:1` ignores `node_modules`, `.neon`, `.env.local`, `.vercel`, `.mimosa/`, `**/.mimosa/`, `graphify-out/`, `.agents/`, `server/data`, `web/dist` — do not commit `.env.local` / `.neon` / `.vercel`.
- Tests always run sqlite; production needs `DATABASE_URL` — never set `DATABASE_URL` when running `server/test/api.test.js` against temp dir.
- No CI workflows yet; `QA.md:1` is source of success criteria, `DECISIONS.md:7` logs stack+Neon decisions.

## Shell & CLI Quirks (Windows PowerShell 5.1 + CLIs)
- **Past tokens are session-only**: if the user pastes a token (e.g. `vcp_…`), use it via `$env:VERCEL_TOKEN` or `--token` flag for that session only — never write it to any file, never commit it.
- **Vercel CLI**: `vercel env rm <NAME> production --yes` before re-adding a changed value; secrets are hidden and unavailable to `env pull`. PowerShell has no `<` stdin redirect — pipe via `Get-Content file | vercel env add …`, or use `cmd /c "vercel --token <tok> env add <NAME> production < file"` for exact bytes.
- **Temp scripts, not `node -e`**: PowerShell quoting breaks `node -e`; write temp `.mjs` files instead. Scripts importing `pg`/`server/lib/*` must live **under the project dir** (module resolution fails from `%TEMP%`); keep secrets in `%TEMP%\opencode`, delete after use, and remove project-dir temp scripts when done.
- **PowerShell basics**: no `tail` (`| Select-Object -Last N`), no `&&` (use `;`), `npx neon …` needs `--org-id org-damp-sun-46973835` for non-interactive use.
- **Verifying production**: Deployment Protection (Vercel SSO) may gate the deployment — its 401 body contains `vercel_auth_enabled`, while the app's is `{"error":"…"}`. Judge by response **body + content-type**, not status alone; GET `/api/*` can serve cached `index.html` fallback, so verify auth paths with POST `/api/auth/login`.
