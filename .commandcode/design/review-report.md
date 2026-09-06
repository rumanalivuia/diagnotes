# DiagNotes — Design Review Report

**Date**: 2026-09-04
**Mode**: `/design review`
**Verdict**: Needs changes

---

## First Impression

The interface reads as a clinical instrument: cool paper background, IBM Plex typography, teal accent on the copy button, mono metadata. The "lab bench" identity from DECISIONS.md is present but understated. A lab technician would recognize this as their kind of tool, but the visual memory is thin — after two seconds, "teal and white" is the answer, which is the same answer as every other medical SaaS product.

**Register**: Product (Operate surface — the primary action is copy-paste)

---

## Heuristic Scores

| #   | Heuristic        | Score | Key Finding                                                                            |
| --- | ---------------- | ----- | -------------------------------------------------------------------------------------- |
| 1   | First impression | 6/10  | Clear category, but the visual identity is indistinguishable from generic medical SaaS |
| 2   | Hierarchy        | 7/10  | Search + copy hero is correct; card-to-card hierarchy is flat                          |
| 3   | Color voice      | 5/10  | Functional status colors work; the palette is safe to the point of being generic       |
| 4   | Type voice       | 7/10  | IBM Plex is a strong choice; mono readouts sell the instrument feel                    |
| 5   | Interaction feel | 6/10  | Copy feedback is good; missing loading, keyboard, and focus states                     |

**Total: 31/50**

---

## Cognitive Load / Risk

**Level: Moderate** — The interface is scannable and the primary flow (search → copy) is clear. But accessibility gaps and missing interaction states create friction for keyboard users and screen reader users.

- **PASS** Copy button is the visual hero — correct priority for an operate surface
- **PASS** Left rail filtering mirrors the server's API contract (type + category + tag AND)
- **PASS** `prefers-reduced-motion` is respected (styles.css:598)
- **PASS** Toast notifications use `aria-live="polite"` (Toasts.jsx:6)
- **WATCH** Modal does not trap focus or use `inert` on background
- **WATCH** No keyboard shortcuts for power users (copy, search focus, new comment)
- **FAIL** `outline: none` on `.search-input:focus`, `.input:focus`, `.select:focus`, `.textarea:focus` overrides the global `:focus-visible` rule — keyboard users lose the focus ring on every form element

---

## Priority Issues

### P0 — Focus rings stripped from all form inputs

**Location**: `web/src/styles.css:235, 446-449`

`.search-input:focus`, `.input:focus`, `.select:focus`, `.textarea:focus` all use `outline: none` and replace the focus indicator with a `border-color` change + `box-shadow`. While the box-shadow provides some visual cue, it's weaker than the global `:focus-visible` rule and inconsistent with the rest of the interface. On `forced-colors: active`, the box-shadow disappears entirely.

**FIX**: Remove `outline: none` from all `:focus` rules. Use `:focus-visible` instead of `:focus` for the enhanced styling, and keep the global `:focus-visible` ring as the baseline.

### P1 — Modal does not trap focus

**Location**: `web/src/components/CommentEditor.jsx:54`, `web/src/components/AdminView.jsx:86`

Modals use `onClick` on the backdrop to close, but do not:

- Move focus into the modal on open
- Trap Tab inside the modal
- Set `inert` on the background content
- Return focus to the trigger on close

A keyboard user can Tab out of the modal into the background, which is still interactive.

**FIX**: Add focus trap, `inert` on background, and focus restoration on close.

### P1 — No keyboard shortcuts for the primary flow

**Location**: `web/src/App.jsx`, `web/src/components/TopBar.jsx`

The primary user action is search → copy. There are no keyboard shortcuts to:

- Focus the search bar (`/` or `Ctrl+K`)
- Copy the first/selected result (`Ctrl+Enter` or `C`)
- Create a new comment (`N`)

Power users in a lab setting need to move fast without the mouse.

**FIX**: Add a keyboard shortcut handler at the app level.

### P2 — Card body text is clamped without expand affordance

**Location**: `web/src/styles.css:341-343`, `web/src/components/CommentCard.jsx:51`

`.card-body` has `max-height: 150px; overflow: hidden` with a gradient fade. There is no way to expand the card to read the full content without copying. Users must copy to see what they're copying.

**FIX**: Add a "Show more" toggle or make the card expandable on click.

### P2 — Loading state missing on initial data fetch

**Location**: `web/src/AppContext.jsx:50-72`, `web/src/App.jsx:72`

On boot, the app shows "Loading…" text in a bare div. If IndexedDB or the sync is slow, the user sees an unstyled loading state with no skeleton, no spinner, and no progress indication.

**FIX**: Add a skeleton or spinner for the loading state.

### P2 — Sync dot is the only offline indicator

**Location**: `web/src/components/TopBar.jsx:31-34`

The sync status is a small8px dot + mono text in the top bar. When offline, this is the only signal. There's no banner, no toast, and no change to the card interaction to indicate that changes are queued.

**FIX**: Add an offline banner below the top bar when `!syncState.online`.

### P3 — Empty state emoji may not render consistently

**Location**: `web/src/components/LibraryView.jsx:25, 65`

Empty states use emoji (📋, 🔍, 🗂️) as the hero illustration. Emoji rendering varies across platforms and may show asboxes on some Windows configurations.

**FIX**: Use SVG icons or a simple illustrated graphic instead of emoji.

---

## What's Working

- **Copy button as hero**: The teal copy button is the most prominent element on every card. Correct priority for a copy-paste tool.
- **IBM Plex type system**: The mono readouts for metadata (timestamps, counts, tags) create a genuine "instrument" feel that matches the medical context.
- **Offline-first architecture**: IndexedDB + sync queue + LWW is the right architecture for a lab environment with spotty connectivity.
- **Status chip colors**: Pending (amber), approved (green), rejected (red) are immediately distinguishable and use both color AND text — no color-only signals.
- **Left rail filtering**: The AND-combined filters (type + category + tag) mirror the server contract and give operators fast faceted search.

---

## Considered but Rejected

| Location                          | Candidate                     | Rejected because                                                                                                  |
| --------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `styles.css:9` `--paper: #f3f6f8` | Warm the background           | The cool paper is a deliberate identity choice per DECISIONS.md; warming it would drift toward generic SaaS cream |
| `styles.css:33` `--rail: 264px`   | Narrow the rail               | The rail needs room for category names + tag counts;264px is already tight for some names                         |
| `CommentCard.jsx:40` card title   | Add category prefix to title  | The category chip already exists in the meta row; prefixing would duplicate                                       |
| `TopBar.jsx:12` New button        | Move "New" to the rail footer | The button is already there (`Rail.jsx:87`); top bar placement serves the mobile breakpoint                       |

---

## Next Modes

| Mode                  | Why                                                                          |
| --------------------- | ---------------------------------------------------------------------------- |
| `/design a11y`        | Fix the P0 focus ring issue, P1 modal trap, and keyboard path                |
| `/design interaction` | Add keyboard shortcuts, loading states, expand affordance                    |
| `/design recolor`     | Push the palette beyond safe medical teal toward a more distinctive identity |
| `/design refine`      | Tighten spacing, card density, and the loading/empty states                  |

---

## Verification

### Verified

- Read all11 component files + styles.css + AppContext.jsx + sync.js + store.js
- Confirmed `prefers-reduced-motion` block exists (styles.css:598-600)
- Confirmed `aria-live="polite"` on toasts (Toasts.jsx:6)
- Confirmed `aria-label` on search input (TopBar.jsx:27)
- Confirmed `aria-label` on copy button (CommentCard.jsx:41)
- Confirmed `role="dialog"` and `aria-modal="true"` on modals (CommentEditor.jsx:55, AdminView.jsx:87)
- Confirmed `:focus-visible` global rule exists (styles.css:51)

### Not verified

- Did not test with a screen reader (requires live browser)
- Did not test at200% zoom (requires live browser)
- Did not test at320px width (requires live browser)
- Did not verify `forced-colors: active` behavior
- Did not check color contrast ratios numerically (would need computed styles)
