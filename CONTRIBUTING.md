# Contributing to DiagNotes

Thanks for your interest in contributing! DiagNotes is an open-source diagnostic
comments library, and all contributions are welcome.

## Getting started

### Prerequisites

- **Node.js >= 22.5** ([download](https://nodejs.org))
- **Git**
- **Rust toolchain** (only if building the Windows desktop app -- [rustup.rs](https://rustup.rs))

### Setup

```bash
# Fork and clone the repo
git clone https://github.com/rumanalivuia/diagnotes.git
cd diagnotes

# Install dependencies
npm install

# Create your local environment file (sqlite fallback -- no Neon needed)
# The server auto-creates a local sqlite DB when DATABASE_URL is not set.

# Start development
npm run server    # terminal 1 -- API server at http://localhost:3001
npm run web       # terminal 2 -- web app at http://localhost:5173
```

### Default dev login

```
email:    diagnotes@center.local
password: devpassword
```

The first Neon Auth signup automatically gets admin role.

## Project structure

```
server/           Node.js API server
  lib/db.js         Database layer (Neon Postgres + sqlite fallback)
  lib/api.js        REST API routes (public read, auth write, admin gates)
  lib/auth.js       HMAC tokens + Neon Auth JWT verification
  test/             Server tests (node --test)
api/              Vercel serverless entry point
web/              React 19 + Vite 7 PWA
  src/lib/          Store (IndexedDB), sync engine, search, clipboard
  src/components/   UI components (Rail, TopBar, cards, editor, admin)
  test/             Web lib tests (node --test)
desktop/          Tauri v2 Windows wrapper
```

## Running tests

```bash
npm test                    # all tests (server 25 + web 7)
npm --workspace server test # server only
npm --workspace web test    # web only
```

Tests use sqlite temp dirs -- they never touch a real database.

## Code style

- **No linting config** -- follow existing patterns in each file
- Use `const` over `let`; avoid `var`
- Async/await over callbacks
- Server: always `await` database statements (pg is async, sqlite is sync)
- Keep the `?` placeholder style in SQL (the db layer translates to `$N` for pg)
- No unnecessary comments -- code should be self-documenting
- Prefer editing existing files over creating new ones

## Making changes

1. **Create a branch** from `main`

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** -- keep commits focused and atomic

3. **Run tests** before committing

   ```bash
   npm test
   npm run build
   ```

4. **Commit** with a clear message describing what and why

   ```
   feat: add bulk export to CSV
   fix: prevent duplicate category names
   docs: update API section in README
   ```

5. **Push and open a PR** against `main`

## Pull request guidelines

- Keep PRs focused on a single feature or fix
- Include a brief description of what changed and why
- Reference any related issues
- Make sure `npm test` passes
- Make sure `npm run build` succeeds

## Architecture notes

### Auth model

- **Public visitors**: can browse and search approved shared comments
- **Registered users**: can create personal snippets, copy to clipboard, submit
  to shared library, manage favorites
- **Admin** (first signup): can approve/reject submissions, manage categories

### Data flow

1. Server stores comments in Postgres (prod) or sqlite (dev/test)
2. Web app caches in IndexedDB for offline access
3. Sync engine pushes/pulls deltas every 60 seconds
4. Public visitors bypass IndexedDB and fetch directly from the API

### Key patterns

- `optionalAuth()` -- returns session or null (public routes)
- `requireAuth()` -- returns session or 401 (authenticated routes)
- `requireAdmin()` -- returns session or 403 (admin routes)
- JSON block model for rich text (not HTML) -- safe, diffable, clipboard-ready
- Last-write-wins for offline conflict resolution

## Reporting issues

Open an issue on
[GitHub](https://github.com/rumanalivuia/diagnotes/issues) with:

- A clear title and description
- Steps to reproduce (if a bug)
- Expected vs actual behavior
- Your environment (OS, Node version, browser)

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](./LICENSE).
