// Quest Board — ClickHouse activity log
// Write path + the two read queries drafted in db/clickhouse/schema.sql
// (dormancy, affinity). Postgres is never read for either — the app fetches
// board membership from Postgres, passes the id list in here, and feeds the
// result back into the Postgres `nudges` table (see src/nudges.ts).

import { createClient } from "@clickhouse/client-web";

const client = createClient({
  url: Deno.env.get("CLICKHOUSE_URL") ?? "http://localhost:8123",
  username: Deno.env.get("CLICKHOUSE_USER") ?? "default",
  password: Deno.env.get("CLICKHOUSE_PASSWORD") ?? "",
  database: Deno.env.get("CLICKHOUSE_DB") ?? "default",
});

export type ActivityEventType = "quest_viewed" | "quest_posted" | "signup";

export interface ActivityEvent {
  eventType: ActivityEventType;
  userId: string;
  boardId: string;
  questId: string;
  category: string;
  response?: "yes" | "no" | "maybe";
}

export async function logActivity(event: ActivityEvent): Promise<void> {
  await logActivities([event]);
}

export async function logActivities(events: ActivityEvent[]): Promise<void> {
  if (events.length === 0) return;
  await client.insert({
    table: "activity_log",
    values: events.map((event) => ({
      event_type: event.eventType,
      user_id: event.userId,
      board_id: event.boardId,
      quest_id: event.questId,
      category: event.category,
      response: event.response ?? "",
    })),
    format: "JSONEachRow",
  });
}

export interface DormantUser {
  user_id: string;
  last_seen: string;
  days_dormant: number;
}

// Members with activity, but none in the last `days`.
export async function getDormantUsers(
  boardId: string,
  memberIds: string[],
  days: number,
): Promise<DormantUser[]> {
  if (memberIds.length === 0) return [];
  const result = await client.query({
    query: `
      select
        user_id,
        max(event_time) as last_seen,
        dateDiff('day', max(event_time), now()) as days_dormant
      from activity_log
      where board_id = {board_id: UUID}
        and user_id in {member_ids: Array(UUID)}
      group by user_id
      having days_dormant >= {days: UInt32}
    `,
    query_params: { board_id: boardId, member_ids: memberIds, days },
    format: "JSONEachRow",
  });
  return await result.json<DormantUser>();
}

// Members with zero rows in activity_log at all — never engaged, so they
// won't show up in getDormantUsers (there's no max(event_time) to diff).
export async function getUnengagedUsers(
  boardId: string,
  memberIds: string[],
): Promise<string[]> {
  if (memberIds.length === 0) return [];
  const result = await client.query({
    query: `
      select distinct user_id
      from activity_log
      where board_id = {board_id: UUID}
        and user_id in {member_ids: Array(UUID)}
    `,
    query_params: { board_id: boardId, member_ids: memberIds },
    format: "JSONEachRow",
  });
  const engaged = new Set(
    (await result.json<{ user_id: string }>()).map((r) => r.user_id),
  );
  return memberIds.filter((id) => !engaged.has(id));
}

export interface AffinityScore {
  user_id: string;
  category: string;
  yes_count: number;
  view_count: number;
  affinity_score: number;
}

export async function getAffinityScores(userId: string): Promise<AffinityScore[]> {
  const result = await client.query({
    query: `
      select
        user_id,
        category,
        countIf(event_type = 'signup' and response = 'yes') as yes_count,
        countIf(event_type = 'quest_viewed') as view_count,
        yes_count / greatest(view_count, 1) as affinity_score
      from activity_log
      where user_id = {user_id: UUID}
      group by user_id, category
      order by affinity_score desc
    `,
    query_params: { user_id: userId },
    format: "JSONEachRow",
  });
  return await result.json<AffinityScore>();
}

// ---------------------------------------------------------------------
// Smoke test: `deno run -A src/clickhouse.ts` (requires `just up` first)
// ---------------------------------------------------------------------

if (import.meta.main) {
  const result = await client.query({ query: "select count() as n from activity_log", format: "JSONEachRow" });
  const rows = await result.json<{ n: string }>();
  console.log(`connected — ${rows[0]?.n ?? 0} row(s) in activity_log`);
  await client.close();
}
