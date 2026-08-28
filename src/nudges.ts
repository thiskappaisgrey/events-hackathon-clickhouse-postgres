// Quest Board — dormancy → nudge pipeline
// Reads board membership from Postgres, checks engagement in ClickHouse
// (no cross-db join), and inserts rows into Postgres `nudges` for the
// Guild Master to act on. Safe to re-run: skips users who already have a
// pending nudge for the same reason.

import { createNudge, listBoardMembers, listBoards, listPendingNudges } from "./db.ts";
import { getDormantUsers, getUnengagedUsers } from "./clickhouse.ts";

const DORMANT_AFTER_DAYS = Number(Deno.env.get("DORMANT_AFTER_DAYS") ?? 14);

export interface NudgeRunResult {
  boardId: string;
  created: { userId: string; reason: string }[];
}

export async function runNudgePipeline(
  boardId: string,
  days = DORMANT_AFTER_DAYS,
): Promise<NudgeRunResult> {
  const members = await listBoardMembers(boardId);
  const memberIds = members.map((u) => u.id);

  const [dormant, unengaged, pending] = await Promise.all([
    getDormantUsers(boardId, memberIds, days),
    getUnengagedUsers(boardId, memberIds),
    listPendingNudges(),
  ]);

  const alreadyPending = new Set(pending.map((n) => `${n.user_id}:${n.reason}`));
  const created: { userId: string; reason: string }[] = [];

  for (const { user_id } of dormant) {
    const reason = `dormant_${days}d`;
    const key = `${user_id}:${reason}`;
    if (alreadyPending.has(key)) continue;
    await createNudge(user_id, reason);
    created.push({ userId: user_id, reason });
    alreadyPending.add(key);
  }

  for (const userId of unengaged) {
    const reason = "never_engaged";
    const key = `${userId}:${reason}`;
    if (alreadyPending.has(key)) continue;
    await createNudge(userId, reason);
    created.push({ userId, reason });
    alreadyPending.add(key);
  }

  return { boardId, created };
}

// ---------------------------------------------------------------------
// CLI: `deno task nudges:run` (requires `just up` first)
// ---------------------------------------------------------------------

if (import.meta.main) {
  const boards = await listBoards();
  for (const board of boards) {
    const { created } = await runNudgePipeline(board.id);
    console.log(`${board.name}: ${created.length} nudge(s) created`);
    for (const c of created) console.log(`  - ${c.userId} (${c.reason})`);
  }
}
