// Quest Board — demo data seed
// Pre-fills Postgres with the board/quests/users described in pitch.md so
// the real /quests page has something to render. Idempotent: if the demo
// board already exists this is a no-op unless run with --reset, which
// deletes the demo board (cascades to its quests/signups/members) first.
//
// Run with: deno task seed [--reset]

import { Pool } from "@db/postgres";

const pool = new Pool(
  {
    hostname: Deno.env.get("PGHOST") ?? "localhost",
    port: Number(Deno.env.get("PGPORT") ?? 5432),
    user: Deno.env.get("PGUSER") ?? "hackathon",
    password: Deno.env.get("PGPASSWORD") ?? "",
    database: Deno.env.get("PGDATABASE") ?? "board",
  },
  5,
);

const BOARD_NAME = "Developers' Lodge";

async function main() {
  const client = await pool.connect();
  try {
    const reset = Deno.args.includes("--reset");

    const existing = await client.queryObject<{ id: string }>`
      select id from boards where name = ${BOARD_NAME}
    `;

    if (existing.rows.length > 0) {
      if (!reset) {
        console.log(`"${BOARD_NAME}" already seeded (id ${existing.rows[0].id}), skipping. Use --reset to reseed.`);
        return;
      }
      await client.queryObject`delete from boards where id = ${existing.rows[0].id}`;
      console.log(`--reset: deleted existing "${BOARD_NAME}" board`);
    }

    // Users — handles double as avatar initials in the UI.
    const seedUsers = [
      { handle: "mira", displayName: "Mira Okonkwo" }, // moderator, board creator
      { handle: "ada", displayName: "Ada K." },
      { handle: "jun", displayName: "Jun P." },
      { handle: "rae", displayName: "Rae S." },
      { handle: "tomas", displayName: "Tomás V." },
      { handle: "mo", displayName: "Mo O." },
    ];

    const users: Record<string, { id: string; display_name: string }> = {};
    for (const u of seedUsers) {
      const { rows } = await client.queryObject<
        { id: string; display_name: string }
      >`
        insert into users (handle, display_name)
        values (${u.handle}, ${u.displayName})
        on conflict (handle) do update set display_name = excluded.display_name
        returning id, display_name
      `;
      users[u.handle] = rows[0];
    }

    const { rows: boardRows } = await client.queryObject<{ id: string }>`
      insert into boards (name, kind, created_by)
      values (${BOARD_NAME}, 'interest', ${users.mira.id})
      returning id
    `;
    const boardId = boardRows[0].id;

    for (const u of seedUsers) {
      await client.queryObject`
        insert into board_members (board_id, user_id)
        values (${boardId}, ${users[u.handle].id})
        on conflict do nothing
      `;
    }

    // Quests — lifted straight from pitch.md's list of things the author
    // would actually go to.
    const quests = [
      {
        author: "ada",
        title: "A first pass at Category Theory, out loud",
        description:
          "Chapter one of the Fong & Spivak, a whiteboard, and a standing rule that nobody has to pretend they got it.",
        category: "study",
        capacity: 6,
        yes: ["ada", "jun", "rae", "tomas"],
      },
      {
        author: "mo",
        title: "Dawn hike, a route none of us has done",
        description:
          "Goes ahead once enough people are in. The ridge path is narrow, so it's capped.",
        category: "hiking",
        capacity: 5,
        yes: ["mo", "rae", "tomas"],
      },
      {
        author: "rae",
        title: "Open mic — five minutes each, notes after",
        description:
          "Eight slots, because the venue gives us ninety minutes and I like to end on time.",
        category: "comedy",
        capacity: 8,
        yes: ["ada", "jun", "rae", "tomas", "mo", "mira"],
      },
      {
        author: "jun",
        title: "Functional programming, but we actually finish the exercises",
        description:
          "Four Tuesdays. Three people, so there is nowhere to hide when you haven't done the reading.",
        category: "study",
        capacity: 3,
        yes: ["jun", "rae"],
      },
      {
        author: "tomas",
        title: "Speed puzzling, 1,000 pieces, no talking",
        description:
          "A timer and a rule of silence. We argue about it at the pub afterwards.",
        category: "games",
        capacity: 4,
        yes: ["mo"],
      },
    ] as const;

    for (const quest of quests) {
      const { rows } = await client.queryObject<{ id: string }>`
        insert into quests (board_id, author_id, title, description, category, capacity)
        values (
          ${boardId}, ${users[quest.author].id}, ${quest.title},
          ${quest.description}, ${quest.category}, ${quest.capacity}
        )
        returning id
      `;
      const questId = rows[0].id;
      for (const handle of quest.yes) {
        await client.queryObject`
          insert into quest_signups (quest_id, user_id, response)
          values (${questId}, ${users[handle].id}, 'yes')
        `;
      }
    }

    console.log(`seeded "${BOARD_NAME}" (${boardId}) with ${quests.length} quests and ${seedUsers.length} users`);
  } finally {
    client.release();
    await pool.end();
  }
}

if (import.meta.main) {
  await main();
}
