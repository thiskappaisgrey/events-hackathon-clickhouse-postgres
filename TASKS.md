# TASKS

Three pages to build. Each is independently claimable by a separate Claude
session. Read `docs/context.md` first for stack/architecture context — this
file is just the work breakdown.

## Before you start

```
just up            # starts postgres (:5432) + clickhouse (:8123/:9000)
deno task seed      # seeds a demo board + users + quests (idempotent-ish; see src/seed.ts)
deno task dev        # serves on :8787, hot-reloads on save
```

`src/db.ts` already has full CRUD for every table (`createUser`, `createQuest`,
`upsertSignup`, etc.) — no schema or query-layer work should be needed for any
of the three tasks below. If you find you *need* a new query, add it to
`db.ts` next to the others (same tagged-template style, no ORM).

## Claiming a task

Edit this file and change a task's `Status:` line to `Status: claimed by
<session name/id>`, commit that alone first (`jj commit` or `git commit`), so
two sessions don't grab the same task. Flip it to `Status: done` (with a short
note on what shipped) when you're finished.

## ⚠️ Shared files — coordinate before editing

All three tasks touch `src/server.ts` (routing) and probably
`public/quest-board.css` (shared design tokens). To avoid stepping on each
other:

- **Add routes to `server.ts` as a small, additive block** (new `if
  (url.pathname === ...)` near the existing ones) — don't restructure the
  routing dispatch or reorder existing routes.
- **Prefer new files** for page-specific rendering: e.g. `src/render.ts`
  already owns the quest board; put a new user-creation page's HTML in its
  own function in `render.ts` (or a new `src/render_signup.ts` if that's
  cleaner) rather than rewriting existing functions.
- If you need a new CSS class, append it to `public/quest-board.css` rather
  than editing existing rules, unless a task explicitly says to restyle
  something shared.
- Pull/rebase (`jj git fetch` + rebase, or `git pull --rebase`) before you
  start and right before you commit, since these files move fast.

---

## Task 1 — Create User page

**Status:** claimed by claude-session-task1

A simple signup/onboarding page: pick a handle + display name, become a user,
land on the quest board acting as that user.

- Route: `GET /signup` renders a small form (handle, display name).
- Route: `POST /signup` calls `createUser(handle, displayName)` from
  `db.ts`, then behaves like `/act-as` does today in `server.ts:76-91` — sets
  the `uid` cookie and redirects to `/quests`.
- For now every new user should also join the single seeded board (there's
  only one board today — see `listBoards()` in `server.ts:33`). Use
  `addBoardMember(boardId, user.id)` from `db.ts`.
- Handle collisions: `handle` is presumably unique in the schema (check
  `db/postgres/schema.sql`) — on conflict, re-render the form with an error
  instead of a raw 500.
- Style: reuse the fonts/vars from `quest-board.css` (Caprasimo heading,
  Figtree body) so it doesn't look like a foreign page. Doesn't need to match
  the quest-card aesthetic exactly — a clean centered form is fine.
- Link to it: add a small "new here? create an account" link near the
  `topbar__who` acting-as selector in `render.ts`'s `renderQuestsPage`.

**Acceptance:** From a fresh cookie state, visiting `/signup`, submitting the
form, and landing on `/quests` acting as the new user, who shows up in the
"Acting as" dropdown and can RSVP to quests.

---

## Task 2 — Add Event (Quest) page

**Status:** unclaimed

A page for a logged-in user to post a new quest — "add ideas of things you'd
already like to do" per `pitch.md`.

- Route: `GET /quests/new` renders a form: title, description, category,
  optional capacity. Requires an acting user (same `currentUserId` cookie
  logic as `server.ts:25-30`); if none, redirect to `/signup`.
- Route: `POST /quests/new` calls `createQuest({...})` from `db.ts` with
  `boardId` = the single seeded board, `authorId` = acting user, then
  redirects to `/quests` (303, same pattern as the RSVP handler at
  `server.ts:93-107`).
- Validate: `title` and `category` required; `capacity` if present must be a
  positive integer — re-render the form with an error rather than 500.
- Style: this can literally reuse the `.quest-card` look for a live preview
  as the user types, but that's a nice-to-have, not required — a plain
  labeled form matching the signup page's style is a fine v1.
- Link to it: add a "+ post a quest" button/link in the quest board header
  (`render.ts`'s `.quest-board__header`).

**Acceptance:** Acting as a seeded user, visiting `/quests/new`, submitting a
title+category, and being redirected to `/quests` where the new quest card
now appears (using the existing `renderQuestCard`).

---

## Task 3 — Quest Board page (polish the existing one)

**Status:** unclaimed

Good news: this one's mostly built. `GET /quests` in `server.ts` +
`renderQuestsPage`/`renderQuestCard` in `render.ts` already render live data
from Postgres with working RSVP. This task is about closing the gaps noted in
`docs/context.md`'s "Not built yet" section and general polish, **not**
building from scratch.

Suggested scope (pick what's not already done by the time you pick this up —
check current `server.ts`/`render.ts` first):

- Wire up Datastar (`public/vendor/datastar.js`, already `<script>`-included
  in `render.ts`'s `<head>` but unused) for the RSVP buttons and the
  "acting as" switcher, so they don't do a full page reload — `data-on-click`
  + `data-target`/SSE patch, whichever pattern fits a plain `Deno.serve`
  backend best. Keep the plain `<form method="post">` fallback working if
  JS is off, or at minimum don't break it while wiring Datastar.
- Empty states: no quests yet (link to Task 2's `/quests/new`), no users yet
  (link to Task 1's `/signup`) — currently `server.ts` just 503s with a
  "run `deno task seed`" message, which is a dev-only crutch.
- Multi-board support is explicitly out of scope for now — `listBoards()[0]`
  is fine to keep hardcoding.

**Acceptance:** `/quests` looks and behaves like the `public/Quest Board.html`
mockup (turn 2a) with real data, and at least the RSVP interaction no longer
full-page-reloads.
