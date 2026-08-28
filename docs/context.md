# Quest Board — project context

Hackathon project. The pitch (full text in `pitch.md`): an event-coordination
app themed around "quests" for people who have a hard time making plans with
strangers/acquaintances. Flow:

1. Join a board — a private friend circle, an interest board (e.g.
   "developers"), or a public board if you have no in.
2. Post a "quest" — an event idea you'd actually go to (study category theory,
   a sunrise hike, standup night), optionally capped at N seats.
3. Others sign up (yes/no/maybe) and it happens, or you sign up for theirs.
4. Activity is tracked so a **human moderator** gets nudged to reach out to
   people who've gone dormant — deliberately not an automated message, per the
   pitch ("you can't always use robots to solve human problems").

## Stack

- **Runtime**: Deno (see `flake.nix` for the dev shell: deno, postgresql_16,
  clickhouse, just).
- **Postgres** — system of record: users, boards, membership, quests,
  signups, the moderator nudge queue. Schema: `db/postgres/schema.sql`.
- **ClickHouse** — write-only activity log (`quest_viewed`, `quest_posted`,
  `signup`) that dormancy detection and affinity ranking query against.
  Postgres is never read for either of those. Schema + the two draft queries
  (dormancy, affinity) live in `db/clickhouse/schema.sql` as comments — not
  wired into app code yet. There's **no cross-DB join**: the app fetches a
  board's member ids from Postgres, passes them into the ClickHouse query,
  then writes results back into the Postgres `nudges` table.
- **Datastar** (`public/vendor/datastar.js`, vendored self-contained bundle,
  version `1.0.0-beta.11`) — the frontend hypermedia framework. Not wired into
  any page yet.
- `just up` / `just down` (Justfile) starts/stops local Postgres (port 5432,
  user `hackathon`, db `board`) and ClickHouse (http 8123 / tcp 9000) with
  data under `.data/`.

## Code so far

- `src/db.ts` — typed, parameterized CRUD over every Postgres table (users,
  boards, board_members, quests, quest_signups, nudges). No ORM, one function
  per operation. `deno task db:check` is a smoke test (needs `just up` first).
- `src/db_test.ts` — integration tests against a real Postgres instance
  (`deno task test`), covering the full organizer → board → quest → RSVP →
  lock/complete lifecycle, profile CRUD, and the nudge queue. Uses random
  handle suffixes + `finally`-block cleanup so it's safely re-runnable.
- `src/server.ts` — minimal `Deno.serve` HTTP server (`deno task dev`, runs on
  `:8787`, `--watch-hmr` for hot reload without dropping the Postgres pool
  mid-edit). `/` redirects to `/Quest Board.html`; everything else is served
  as static files out of `public/` via `@std/http`'s `serveDir`. `/health`
  returns `{ ok: true }`.
- `public/Quest Board.html` — a **design-doc mockup** (not live app code): a
  bundled/compressed export from a design tool, containing several iterations
  ("turns") of screen concepts for this product. The one turn actually named
  "The Quest Board" (option `2a`) is a six-notice corkboard mockup that was
  refactored for readability — each notice is a `.quest-card` `<article>`
  that sets ~8 CSS custom properties (accent color, gradient stops, torn-edge
  clip-path) instead of repeating a paragraph of inline styles per card, with
  the whole card (not just the button) reading as one clickable unit. Purely
  visual reference for what the real quest board UI should look like — none
  of its markup is used by `src/server.ts` beyond being served as a static
  file.

## Not built yet

- No actual page wires up Datastar or renders live data from `db.ts` —
  `public/Quest Board.html` is static mockup, `src/server.ts` just serves
  files.
- Dormancy/affinity ClickHouse queries are drafted as SQL comments only, not
  called from app code; nothing writes to `activity_log` yet.
- No auth/session layer.
