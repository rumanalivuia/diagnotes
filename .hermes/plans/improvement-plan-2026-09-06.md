# DiagNotes — Improvement Plan (Grill Review) — 2026-09-06

> Intent: unsparing critique + prioritized fix plan. No sugar-coating. Checked live: `npm test` 32/32 pass, `npm run build` OK (247 kB JS / 76 kB gz, PWA precache 533 KiB / 19 entries), no TS/lint config, `.hermes/plans` now created.

---

## 1. Verdict in one paragraph

DiagNotes is a competent v1: clean domain (reusable diagnostic comments), working offline PWA with LWW sync, dual-mode db, and Neon+Vercel plumbing that actually ships. But it is carrying first-ship debt everywhere: a 480-line single-file API router, LIKE-based search that will collapse at scale, zero rate limiting / security headers, no CI/linting/type safety, a bundle that ships every IBM Plex subset at once, and a Tauri desktop that is scaffolded-not-built. The happy path works; the adversarial, scale, and maintainability paths do not yet.

**Grade: B for demo-readiness, C for production hardening.** Fix the red items before calling it "production."

---

## 2. Grill — What is weak, broken, or risky

### P0 — Fix before any "production-stable" claim

1. **Security surface is too thin**
   - `POST /api/auth/login` has no rate limiting, no brute-force lockout, no CAPTCHA. A single endpoint guards the entire write surface.
   - `server/lib/auth.js: verifyToken` is correct (timingSafeEqual + exp check, 7-day TTL) but there is **no secret-strength validation** — a short `DIAGNOTES_SECRET` would still boot. No startup assertion on length/entropy.
   - No security headers (`Content-Security-Policy`, `X-Frame-Options`, `H-STS`, `X-Content-Type-Options`) on `server/index.js` nor on Vercel (`vercel.json` only has rewrites). `CORS_ORIGIN` exists but no preflight/origin reflected audit was found.
   - Search uses `LIKE '%q%'` with no escaping of `%`/`_` in the user query — `%` in a query becomes a wildcard. Minor, but exploitable for DoS-ish broad matches.
   - Error responses leak `text.slice(0,200)` of server text on non-401 failures (`sync.js:81`) — could echo internals if an upstream throws.

2. **Search will not scale**
   - Both pg and sqlite paths are `SELECT ... WHERE title LIKE ? OR body_text LIKE ?` with no FTS index, no `pg_trgm`/`tsvector`, no GIN. At 50 seeded rows it is instant; at 5k+ shared comments (the actual multi-center ambition) it degrades to seq scans. `body_text` is also not indexed.
   - Tag filtering is `tags LIKE '%tag%'` on a JSON-stringified array — substring collisions (`heme` matches `hemo`) and no index. Should be a join table or `jsonb ?` / `@>` on pg.

3. **Single-file API router is a maintenance trap**
   - `server/lib/api.js` is 479 lines, 40+ routes in one `route()` closure with `prepareAll()` returning 20+ stmts. No layering (handler/service/repo), no schema validation (no zod/ajv on `readBody`), and error handling is one outer `try/catch -> 500`. Adding one more resource will make this unreviewable.

4. **Sync correctness edge cases**
   - `sync.js: syncNow()` pushes the entire `queue` in one POST then pulls — no pagination, no checkpointing. If the push partially fails mid-loop on the server (`api.js:360` loops without a transaction), the client deletes only `valid` rows it thinks succeeded; a crash between `insertComment` and `delete('queue')` can dupe or lose rows. Server loop should be a transaction (pg) / batch.
   - `store.js: openDb() onupgradeneeded` **deletes and recreates `kv` every time DB_VERSION bumps** (the `else { deleteObjectStore('kv'); create(...) }` branch runs even when kv already has the correct keyPath). That wipes `favorites`, `lastSync`, `token` on any future version bump. The migration comment claims it fixes v1 out-of-line keys, but the logic is version-independent — it will repeat.
   - `api.js: syncComments` is unbounded (`ORDER BY updated_at` with no LIMIT). A client that has been offline for months could pull the entire table.

5. **No CI, no lint, no types**
   - `package.json` has no `eslint`, `prettier`, `tsc`, or `typecheck` script. `npx tsc --noEmit` just prints help (no tsconfig). There is `.semgrep` but no workflow running it. "Tests pass" is currently the only gate, and it runs locally only.

### P1 — High-impact, should fix this cycle

6. **Bundle / PWA bloat**
   - Web build precache is 533 KiB (19 entries) — above the 508 KiB noted in AGENTS. Fonts are the culprit: 9 IBM Plex subsets (Vietnamese, Greek, Cyrillic, Cyrillic-Ext, Latin-Ext, Latin, Mono x2) ship unconditionally; `vite-plugin-pwa` precaches all of them. A lab in one locale does not need all subsets.
   - No code splitting: `AdminView`, `CommentEditor`, `CommentDetail` are in the main chunk (246 kB JS). React.lazy + Suspense would cut initial load.

7. **Vercel rewrite / proxy fragility**
   - `vercel.json:5` maps `/neonauth/(.*) -> /api` — destination discards the capture group, so `/neonauth/sign-up/email` and `/neonauth/token` both hit `/api` as `/` — relies on `api/index.js:12 handleNeonAuthProxy` to reconstruct from `x-forwarded-*` / raw URL, which is brittle. Should be `"/api/neonauth/$1"` or preserve path via function routing.
   - No cache headers: `GET /api/categories` is public and almost static — could be `Cache-Control: public, max-age=60, stale-while-revalidate` to reduce Neon reads.

8. **A11y / UX debt**
   - `styles.css` has `:focus-visible` but interactive cards/buttons lack `aria-*` for copy state, pending queue, and admin approve/reject toasts. `MobileFab` is just `+` with no visible label (only `aria-label`).
   - No `ErrorBoundary` — any render throw in `LibraryView`/`RichText` whitescreens the app (the classic React 19 failure mode). Boot has `SkeletonLoader` but no error state.
   - Offline UX: `navigator.onLine` is unreliable; there is no heartbeat/ping. `syncState.error` is shown only via toast; the rail does not surface "N pending, last sync 3h ago" persistently.

9. **Data model gaps**
   - `tags` stored as JSON string in `comments.tags` — cannot query efficiently, cannot enforce tag taxonomy. Categories are a real table; tags should be too (or at least `jsonb` with GIN on pg).
   - No audit trail: `approve/reject` overwrites `status` in place; no `audit_log` of who approved what when. For a medical-adjacent app this is a compliance gap.
   - `copy_count` is a single counter — no per-user, per-day analytics, no deduplication of double-clicks.

10. **Desktop = vapor**
    - `desktop/` is Tauri v2 scaffold, never built (needs Rust). README and QA both say "needs Rust toolchain" — so the "Windows desktop app" feature in the README table is aspirational. Either build it in CI or stop advertising it as a feature.

### P2 — Nice-to-have / polish

- No pagination or virtualized list — `filterCommentsType` caps at 500 but the web renders all cards at once; at 500 cards the DOM will jank.
- Clipboard logic (`web/src/lib/clipboard.js`) has a textarea+execCommand fallback but `ClipboardItem` with `text/html` is gated behind a headless-unverifiable path — needs a real-browser manual check (noted in QA, still open).
- `graphify-out/` and `.agents/` are committed artifacts / gitignored noise — should be pruned or documented.
- `server/data/` sqlite file is gitignored but no `data/.gitkeep` — fresh clone `openDb('server/data')` will `mkdirSync` anyway, but the path is Windows-absolute in `db.js:loadLocalEnvIfNeeded` (`E:\...\.env.local`) — non-portable for other contributors.
- No seed idempotency guard beyond `SEED_NOTES`; re-provisioning the DB re-inserts demo data even if prod data exists.

---

## 3. Improvement Plan — Phased, with acceptance criteria

### Phase 0 — Hygiene (1 day, no product changes)

- [ ] Add `eslint` (flat config) + `prettier` + `npm run lint` + `npm run format`. Enforce in PRs.
- [ ] Add `tsconfig.json` (allowJs + checkJs, or migrate `server/lib/*.js` to JSDoc types) and `npm run typecheck`. Make `npm test` run `lint && typecheck && test && build`.
- [ ] Add GitHub Actions CI: `node 22.5`, `npm ci`, `npm run lint && npm test && npm run build`, Semgrep step (already have `.semgrep/`), upload `web/dist` artifact. Badge in README.
- [ ] Prune `graphify-out/cache` from history or add `graphify-out/` to `.gitignore` properly; remove `E:\HermesWorkspace\projects\diagnotes\.env.local` absolute path from `db.js` or make it `path.resolve(__dirname,'..','..','.env.local')`.
- Status: ground truth for every later phase.

### Phase 1 — Security hardening (2–3 days)

- [ ] Rate limit `POST /api/auth/login`: in-memory token bucket (e.g. 10/min/IP, 5/min/account) on Node server + Vercel edge check (Upstash Ratelimit or simple KV if available). Return 429 with `Retry-After`.
- [ ] Startup asserts: `DIAGNOTES_SECRET` must be >= 32 bytes hex/utf8 when `DATABASE_URL` set; `CORS_ORIGIN` must be explicit in prod (no `*` fallback). Fail fast with a clear log.
- [ ] Add security headers middleware (or Vercel `headers` in `vercel.json`): `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, minimal `Content-Security-Policy` for the PWA.
- [ ] Fix LIKE escaping: escape `%`, `_`, `\` in `q`/`tag` before wrapping in `%...%`, add `ESCAPE '\'` to queries. Fix tag search to use jsonb containment on pg (`tags::jsonb ? :tag`) with fallback LIKE on sqlite, or introduce `comment_tags` join.
- [ ] Normalize error surfaces: `sync.js` should not `res.text().slice(0,200)` into the thrown message verbatim — map to a sanitized `error.code`.
- Acceptance: login brute-force is throttled, `npm run build` still passes, `curl -i` shows security headers, search for `%` does not wildcard.

### Phase 2 — API & DB layering (3–5 days)

- [ ] Split `server/lib/api.js`: `routes/auth.js`, `routes/comments.js`, `routes/categories.js`, `routes/admin.js`, `routes/sync.js` + `lib/validate.js` (zod schemas for every `readBody` shape) + `lib/http.js` (json/respond helpers). `api.js` becomes a thin router.
- [ ] Introduce `lib/repos/comments.js` that owns all SQL, with pg-specific `jsonb` tag queries and sqlite fallbacks behind a clean interface. Replace `prepareAll` 20-stmt bag with focused repos.
- [ ] Wrap `POST /api/sync` push in a transaction (`BEGIN`/`COMMIT` on pg `pool.query`; `db.exec('BEGIN')` on sqlite). On failure, roll back and return 500 without partial writes. Add `LIMIT 500` + `hasMore` cursor to `GET /api/sync?since=`.
- [ ] Add `pg_trgm` or `tsvector` FTS on `comments(title, body_text)` with `CREATE INDEX ... USING gin` in `migratePg`. Rank with `ts_rank` or `similarity`. Keep LIKE fallback for sqlite so tests stay portable.
- [ ] Add `audit_log` table (`id, actor_id, action, target_id, at`) and write on approve/reject/submit; expose `GET /api/admin/audit` for admins.
- Acceptance: `server/test/api.test.js` still 25 pass, new `test/search-fts.test.js` shows ranked results, sync push is atomic, audit log visible in Admin.

### Phase 3 — Sync & Offline robustness (2 days)

- [ ] Fix `store.js` migration: only rebuild `kv` if `oldVersion < 2` (or probe `store.keyPath`), not unconditionally. Add a migration test that seeds `favorites` then bumps version.
- [ ] Checkpoint sync: store `lastSync` only after the pull is fully applied (already does — keep), but add pagination so a large pull does not OOM. Add a visible "Sync: 3 pending · last 2h ago" pill in `TopBar`/`Rail`.
- [ ] Add periodic sync (already 60s) with `visibilitychange` + `online` triggers, plus a manual "Sync now" toast that survives transient 401 without logging out (already handled — keep the contract and add a test).
- [ ] Add `ErrorBoundary` around `LibraryView`/`AdminView`/`CommentDetail` with a retry button that calls `reloadLocal()`.
- Acceptance: IndexedDB upgrade does not wipe `favorites`, 1k-comment pull pages correctly, offline->online flush is lossless (extend QA #6 with a 10-comment offline batch).

### Phase 4 — Web performance & A11y (2–3 days)

- [ ] Font subsetting: ship only `latin` + `latin-ext` by default; load `cyrillic`/`greek`/`vietnamese` on demand via `unicode-range` or dynamic import. Drop precache from 533 KiB toward ~400 KiB.
- [ ] Code split: `React.lazy(() => import('./components/AdminView.jsx'))`, `CommentEditor`, `CommentDetail`. Add `Suspense` with `SkeletonLoader`.
- [ ] Virtualize the comment list (`@tanstack/react-virtual` or simple windowing) once >100 cards, or add pagination (`?limit=50&offset=`) with "Load more".
- [ ] A11y pass: `axe-core` run in CI on `web/dist`, `MobileFab` visible label, copy button `aria-live` for "Copied" state, focus trap in `Login` modal, skip link, respect `prefers-reduced-motion`.
- [ ] Cache `GET /api/categories` (Vercel `Cache-Control` + `ETag`/`If-None-Match` on the server). Add `Vary: Origin`.
- Acceptance: Lighthouse performance >= 90, accessibility >= 95, precache < 450 KiB, categories response is 304 on repeat.

### Phase 5 — Desktop & Release (1–2 days, optional)

- [ ] Either: remove "Windows desktop app" from README/features until it ships, OR add a CI job that installs Rust and runs `npm --workspace desktop run tauri build` on `windows-latest`, publishing the .msi/.exe to a GitHub Release and wiring `tauri-plugin-updater` to that feed. Document the signing key flow.
- [ ] Add PWA install prompt telemetry (how many installs) and a `desktop/README.md` that actually builds on a clean Windows VM.
- Acceptance: one of "feature removed" or "artifact builds in CI" — no middle ground.

---

## 4. Backlog / Do-not-do-yet

- Rich analytics on copies (per-user daily counts) — wait until auth + rate limiting are solid.
- Real freemium metering (the README says "freemium hooks" but no code enforces it) — define the paywall before building metering.
- Comment versioning / diff view — LWW is honest for v1; merge UI is a separate product decision.
- Native mobile wrappers — PWA install already covers the need; native is a distractor.

---

## 5. How to work this plan

1. Land **Phase 0 first** — everything else depends on a green CI.
2. Do **Phase 1 + 2 in parallel** if two people are available (security vs. layering touch different files). If solo, do 1 then 2.
3. Gate each phase on `npm test && npm run build` + the acceptance line written above — no phase is "done" until its acceptance passes on a real Vercel preview deployment (POST `/api/auth/login` with 429, FTS ranking visible, audit log queryable).
4. Keep PRs small (one bullet = one PR). The API split alone should be two PRs (extract routes, then add zod + repos) so review stays sane.

---

## 6. One-line grill summary

> Stop polishing the gallery wall while the foundation is still plywood: lock the door (rate limit + headers), fix the search that will be the first thing to break at scale, cut the monolith before it ossifies, and put CI in front of every change — then the PWA, a11y, and desktop polish will actually stick.
