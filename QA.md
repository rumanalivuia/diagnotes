# QA checklist — against PRD §8 (Verification / Success Criteria)

Status key: ✅ verified (automated or live browser), ⚠️ verified-in-part /
needs manual confirmation on a non-headless machine, 🔲 not yet done.

| #   | Criterion                                                                    | Status                  | How it was verified                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Create a personal snippet with rich text and retrieve via search in <2s      | ✅                      | Live CDP: created "My potassium comment" with bold/underline in the rich editor; full-text search returns it instantly (client-side IndexedDB, sub-100ms)                                                 |
| 2   | Submit personal snippet → shared library; admin sees it in pending queue     | ✅                      | Live CDP: "Submit to library" → admin Review queue showed the item with Approve/Reject; server `pending: N` confirmed                                                                                     |
| 3   | Admin approve makes it visible to all users within one sync cycle            | ✅                      | Approve → toast "Approved — now visible to everyone"; server `GET /api/comments?type=shared&status=approved` returns it; clients pick it up on next `syncNow` (60s cadence or manual)                     |
| 4   | Copy places correctly-formatted text on clipboard (plain + rich)             | ✅ logic / ⚠️ headless  | Plain = `•` bulleted text, rich = `<p><b><ul>` HTML verified via stubbed `navigator.clipboard.write` capture. Real click in headless can't grant clipboard gesture — verify once in a normal browser/Word |
| 5   | Offline: app launches with no network; synced comments searchable & copyable | ✅                      | CDP `Network.emulateNetworkConditions offline` → 8 cached cards rendered, search "hemolyzed" → 1 hit                                                                                                      |
| 6   | Reconnect: locally-created offline comments sync without data loss           | ✅                      | Offline-created comment queued (queue=1); back online + sync → queue=0, server search returns the comment                                                                                                 |
| 7   | Web + Windows app show identical data within one sync cycle                  | ✅ (web) / 🔲 (Windows) | Web verified. Windows = same Tauri-hosted web code; needs a Rust build to run (see desktop/README)                                                                                                        |
| 8   | Category + tag filters combine with AND and return correct results           | ✅                      | Unit test `filter combines type + category + tag with AND`; server filter test passes                                                                                                                     |

## Additional verified flows

- **Auth**: login/reject-bad-credentials/session-restore after reload.
- **Rich text round-trip**: editor → block model → IndexedDB → render back with
  bold/list preserved.
- **Delete**: soft-delete removes locally and (via tombstone) on server.
- **Admin category management**: add category, archive/restore.
- **Recent list**: copy pushes comment to Recently-copied; re-copy from there.
- **Server resilience**: sync push skips malformed records instead of 500ing;
  a bad local queue record no longer bricks all future syncs.
- **Offline copy**: copy still records (queued) even when the clipboard write
  is unavailable — no data loss on reconnect.

## Manual checks recommended before sign-off

1. **Real clipboard**: paste a copied comment into Word (expect bold/lists kept)
   and into Notepad (expect clean plain text with `•` bullets).
2. **Windows desktop**: install Rust, `npm run tauri build`, install the .exe,
   confirm auto-update against a hosted release feed.
3. **Two devices**: log into the same center account from a second browser;
   create on one, confirm the other picks it up within one sync cycle (≤60s).
4. **PWA install**: open the web app in Edge/Chrome → Install → launch offline.

## Test commands

```bash
npm test                                   # server 18 + web lib 7
npm run build                              # production build (PWA precache)
# end-to-end (needs a browser; headless CDP used during development):
# node web/smoke*.cjs  — removed after use; re-run pattern documented in commit history
```
