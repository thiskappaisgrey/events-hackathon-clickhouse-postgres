// Quest Board — demo data seed
// Pre-fills Postgres with the 4 themed boards + users + quests described in
// pitch.md/TASKS.md Task 4 so the real /quests/:boardId pages have something
// to render. Idempotent: if the boards already exist this is a no-op unless
// run with --reset, which deletes them (cascades to quests/signups/members)
// first.
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

// Board name -> quests posted there. Quest `category` is untouched/orthogonal
// to which board it lives on (see TASKS.md Task 4).
const BOARDS = [
  {
    name: "Art",
    quests: [
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
        author: "mira",
        title: "Beginner guitar circle, bring whatever you've got",
        description:
          "Three chords and a campfire attitude. Spare guitar available if you don't own one yet.",
        category: "guitar",
        capacity: 6,
        yes: ["mira", "ada"],
      },
    ],
  },
  {
    name: "Learning",
    quests: [
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
        title: "Intro to databases: indexes and why they matter",
        description:
          "Working through query plans on a laptop projector, one slow query at a time.",
        category: "databases",
        capacity: 5,
        yes: ["tomas", "jun"],
      },
    ],
  },
  {
    name: "Social",
    quests: [
      {
        author: "tomas",
        title: "Speed puzzling, 1,000 pieces, no talking",
        description:
          "A timer and a rule of silence. We argue about it at the pub afterwards.",
        category: "games",
        capacity: 4,
        yes: ["mo"],
      },
      {
        author: "mo",
        title: "Swing dance basics at the community hall",
        description:
          "No partner needed, no experience needed. We rotate every few songs.",
        category: "swing dancing",
        capacity: 12,
        yes: ["mo", "mira", "rae"],
      },
      {
        author: "rae",
        title: "Try the new ramen spot downtown",
        description: "The one that opened by the mall. Splitting a table for six.",
        category: "restaurants",
        capacity: 6,
        yes: ["rae", "ada", "tomas"],
      },
    ],
  },
  {
    name: "Nature",
    quests: [
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
        author: "jun",
        title: "Saturday bird walk in the park",
        description: "Binoculars optional, quiet feet required. Back before lunch.",
        category: "bird watching",
        capacity: 8,
        yes: ["jun"],
      },
    ],
  },
] as const;

async function main() {
  const client = await pool.connect();
  try {
    const reset = Deno.args.includes("--reset");

    const existing = await client.queryObject<{ id: string }>`
      select id from boards where name = any(${BOARDS.map((b) => b.name)})
    `;

    if (existing.rows.length > 0) {
      if (!reset) {
        console.log(`${existing.rows.length} of the 4 boards already seeded, skipping. Use --reset to reseed.`);
        return;
      }
      for (const row of existing.rows) {
        await client.queryObject`delete from boards where id = ${row.id}`;
      }
      console.log(`--reset: deleted ${existing.rows.length} existing board(s)`);
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

    let totalQuests = 0;
    for (const board of BOARDS) {
      const { rows: boardRows } = await client.queryObject<{ id: string }>`
        insert into boards (name, kind, created_by)
        values (${board.name}, 'interest', ${users.mira.id})
        returning id
      `;
      const boardId = boardRows[0].id;

      // Every user auto-joins every board (Task 4: no join/leave UI yet).
      for (const u of seedUsers) {
        await client.queryObject`
          insert into board_members (board_id, user_id)
          values (${boardId}, ${users[u.handle].id})
          on conflict do nothing
        `;
      }

      for (const quest of board.quests) {
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
        totalQuests++;
      }

      console.log(`seeded "${board.name}" (${boardId}) with ${board.quests.length} quests`);
    }

    console.log(`done: ${BOARDS.length} boards, ${totalQuests} quests, ${seedUsers.length} users`);
  } finally {
    client.release();
    await pool.end();
  }
}

if (import.meta.main) {
  await main();
}
