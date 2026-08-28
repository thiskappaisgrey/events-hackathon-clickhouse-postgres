// Guild Master queue — server-side HTML rendering.
// Shows pending nudges (from Postgres `nudges`, populated by the
// ClickHouse-backed dormancy pipeline in src/nudges.ts) for a human to act on.

import type { Nudge, User } from "./db.ts";

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const REASON_LABEL: Record<string, string> = {
  never_engaged: "never signed up for a quest",
};

function reasonLabel(reason: string): string {
  if (REASON_LABEL[reason]) return REASON_LABEL[reason];
  const m = reason.match(/^dormant_(\d+)d$/);
  if (m) return `quiet for ${m[1]}+ days`;
  return reason;
}

export function renderNudgesPage(nudges: Nudge[], usersById: Map<string, User>): string {
  const rows = nudges.length
    ? nudges.map((n) => {
      const user = usersById.get(n.user_id);
      return `
      <li class="nudge-row">
        <div class="nudge-row__who">
          <strong>${escapeHtml(user?.display_name ?? "unknown adventurer")}</strong>
          <span class="nudge-row__reason">${escapeHtml(reasonLabel(n.reason))}</span>
        </div>
        <form method="post" action="/guild-master/${n.id}/resolve" class="nudge-row__actions">
          <button type="submit" name="status" value="contacted" class="quest-btn quest-btn--solid">Reached out</button>
          <button type="submit" name="status" value="dismissed" class="quest-btn quest-btn--ghost">Dismiss</button>
        </form>
      </li>`;
    }).join("\n")
    : `<li class="nudge-row nudge-row--empty">Nobody in the queue right now.</li>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Guild Master queue — Quest Board</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Caprasimo&family=Figtree:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/quest-board.css">
</head>
<body>
<div class="page signup-page">
  <div class="signup-card nudge-card">
    <h1 class="signup-card__title">Guild Master queue</h1>
    <p class="signup-card__subtitle">adventurers who've gone quiet — reach out, don't just automate it</p>
    <form method="post" action="/guild-master/run" style="margin-bottom:1rem">
      <button type="submit" class="quest-btn quest-btn--outline">Check for dormant adventurers</button>
    </form>
    <ul class="nudge-list">
      ${rows}
    </ul>
    <p class="signup-card__footer"><a href="/quests">back to the quest board</a></p>
  </div>
</div>
</body>
</html>`;
}
