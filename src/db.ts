// Quest Board — Postgres CRUD
// Thin, typed wrappers around the tables in db/postgres/schema.sql.
// No ORM: parameterized queries via @db/postgres, one function per operation.

import { Pool } from "@db/postgres";

const pool = new Pool(
  {
    hostname: Deno.env.get("PGHOST") ?? "localhost",
    port: Number(Deno.env.get("PGPORT") ?? 5432),
    user: Deno.env.get("PGUSER") ?? "hackathon",
    password: Deno.env.get("PGPASSWORD") ?? "",
    database: Deno.env.get("PGDATABASE") ?? "board",
  },
  10,
);

// Acquires a pooled connection for a single tagged-template query, then
// releases it back to the pool. Mirrors the client's queryObject signature.
async function q<T>(
  strings: TemplateStringsArray,
  ...args: unknown[]
): Promise<{ rows: T[] }> {
  const client = await pool.connect();
  try {
    return await client.queryObject<T>(strings, ...args);
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------
// Types (mirror db/postgres/schema.sql)
// ---------------------------------------------------------------------

export interface User {
  id: string;
  handle: string;
  display_name: string;
  created_at: string;
}

export type BoardKind = "circle" | "interest" | "public";

export interface Board {
  id: string;
  name: string;
  kind: BoardKind;
  created_by: string;
  created_at: string;
}

export interface BoardMember {
  board_id: string;
  user_id: string;
  joined_at: string;
}

export type QuestStatus = "open" | "locked" | "completed" | "cancelled";

export interface Quest {
  id: string;
  board_id: string;
  author_id: string;
  title: string;
  description: string | null;
  category: string;
  capacity: number | null;
  status: QuestStatus;
  created_at: string;
}

export type SignupResponse = "yes" | "no" | "maybe";

export interface QuestSignup {
  quest_id: string;
  user_id: string;
  response: SignupResponse;
  responded_at: string;
}

export type NudgeStatus = "pending" | "contacted" | "dismissed";

export interface Nudge {
  id: string;
  user_id: string;
  reason: string;
  status: NudgeStatus;
  created_at: string;
  resolved_at: string | null;
}

// ---------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------

export async function createUser(
  handle: string,
  displayName: string,
): Promise<User> {
  const { rows } = await q<User>`
    insert into users (handle, display_name)
    values (${handle}, ${displayName})
    returning *
  `;
  return rows[0];
}

export async function getUser(id: string): Promise<User | undefined> {
  const { rows } = await q<User>`
    select * from users where id = ${id}
  `;
  return rows[0];
}

export async function listUsers(): Promise<User[]> {
  const { rows } = await q<User>`
    select * from users order by created_at
  `;
  return rows;
}

export async function updateUserDisplayName(
  id: string,
  displayName: string,
): Promise<User | undefined> {
  const { rows } = await q<User>`
    update users set display_name = ${displayName}
    where id = ${id}
    returning *
  `;
  return rows[0];
}

export async function deleteUser(id: string): Promise<void> {
  await q`delete from users where id = ${id}`;
}

// ---------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------

export async function createBoard(
  name: string,
  kind: BoardKind,
  createdBy: string,
): Promise<Board> {
  const { rows } = await q<Board>`
    insert into boards (name, kind, created_by)
    values (${name}, ${kind}, ${createdBy})
    returning *
  `;
  return rows[0];
}

export async function getBoard(id: string): Promise<Board | undefined> {
  const { rows } = await q<Board>`
    select * from boards where id = ${id}
  `;
  return rows[0];
}

export async function listBoards(): Promise<Board[]> {
  const { rows } = await q<Board>`
    select * from boards order by created_at
  `;
  return rows;
}

export async function deleteBoard(id: string): Promise<void> {
  await q`delete from boards where id = ${id}`;
}

// ---------------------------------------------------------------------
// Board members
// ---------------------------------------------------------------------

export async function addBoardMember(
  boardId: string,
  userId: string,
): Promise<BoardMember> {
  const { rows } = await q<BoardMember>`
    insert into board_members (board_id, user_id)
    values (${boardId}, ${userId})
    on conflict (board_id, user_id) do nothing
    returning *
  `;
  return rows[0] ?? { board_id: boardId, user_id: userId, joined_at: "" };
}

export async function removeBoardMember(
  boardId: string,
  userId: string,
): Promise<void> {
  await q`
    delete from board_members
    where board_id = ${boardId} and user_id = ${userId}
  `;
}

export async function listBoardMembers(boardId: string): Promise<User[]> {
  const { rows } = await q<User>`
    select u.* from users u
    join board_members bm on bm.user_id = u.id
    where bm.board_id = ${boardId}
    order by bm.joined_at
  `;
  return rows;
}

export async function listUserBoards(userId: string): Promise<Board[]> {
  const { rows } = await q<Board>`
    select b.* from boards b
    join board_members bm on bm.board_id = b.id
    where bm.user_id = ${userId}
    order by bm.joined_at
  `;
  return rows;
}

// ---------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------

export async function createQuest(quest: {
  boardId: string;
  authorId: string;
  title: string;
  description?: string;
  category: string;
  capacity?: number;
}): Promise<Quest> {
  const { rows } = await q<Quest>`
    insert into quests (board_id, author_id, title, description, category, capacity)
    values (
      ${quest.boardId}, ${quest.authorId}, ${quest.title},
      ${quest.description ?? null}, ${quest.category}, ${quest.capacity ?? null}
    )
    returning *
  `;
  return rows[0];
}

export async function getQuest(id: string): Promise<Quest | undefined> {
  const { rows } = await q<Quest>`
    select * from quests where id = ${id}
  `;
  return rows[0];
}

export async function listQuestsByBoard(boardId: string): Promise<Quest[]> {
  const { rows } = await q<Quest>`
    select * from quests
    where board_id = ${boardId}
    order by created_at desc
  `;
  return rows;
}

export async function updateQuestStatus(
  id: string,
  status: QuestStatus,
): Promise<Quest | undefined> {
  const { rows } = await q<Quest>`
    update quests set status = ${status}
    where id = ${id}
    returning *
  `;
  return rows[0];
}

export async function deleteQuest(id: string): Promise<void> {
  await q`delete from quests where id = ${id}`;
}

// ---------------------------------------------------------------------
// Quest signups
// ---------------------------------------------------------------------

export async function upsertSignup(
  questId: string,
  userId: string,
  response: SignupResponse,
): Promise<QuestSignup> {
  const { rows } = await q<QuestSignup>`
    insert into quest_signups (quest_id, user_id, response)
    values (${questId}, ${userId}, ${response})
    on conflict (quest_id, user_id)
    do update set response = excluded.response, responded_at = now()
    returning *
  `;
  return rows[0];
}

export async function removeSignup(
  questId: string,
  userId: string,
): Promise<void> {
  await q`
    delete from quest_signups
    where quest_id = ${questId} and user_id = ${userId}
  `;
}

export async function listSignupsForQuest(
  questId: string,
): Promise<QuestSignup[]> {
  const { rows } = await q<QuestSignup>`
    select * from quest_signups where quest_id = ${questId}
  `;
  return rows;
}

export async function listSignupsForUser(
  userId: string,
): Promise<QuestSignup[]> {
  const { rows } = await q<QuestSignup>`
    select * from quest_signups where user_id = ${userId}
  `;
  return rows;
}

// ---------------------------------------------------------------------
// Nudges
// ---------------------------------------------------------------------

export async function createNudge(
  userId: string,
  reason: string,
): Promise<Nudge> {
  const { rows } = await q<Nudge>`
    insert into nudges (user_id, reason)
    values (${userId}, ${reason})
    returning *
  `;
  return rows[0];
}

export async function listPendingNudges(): Promise<Nudge[]> {
  const { rows } = await q<Nudge>`
    select * from nudges where status = 'pending' order by created_at
  `;
  return rows;
}

export async function resolveNudge(
  id: string,
  status: Exclude<NudgeStatus, "pending">,
): Promise<Nudge | undefined> {
  const { rows } = await q<Nudge>`
    update nudges set status = ${status}, resolved_at = now()
    where id = ${id}
    returning *
  `;
  return rows[0];
}

// ---------------------------------------------------------------------
// Smoke test: `deno task db:check` (requires `just up` first)
// ---------------------------------------------------------------------

if (import.meta.main) {
  const users = await listUsers();
  console.log(`connected — ${users.length} user(s) in db`);
  await pool.end();
}
