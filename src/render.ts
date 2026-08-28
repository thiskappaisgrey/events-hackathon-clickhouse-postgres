// Quest Board — server-side HTML rendering.
// Plain template strings, no JSX/templating engine: small enough not to need one.

import type { Board, Quest, QuestSignup, User } from "./db.ts";

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function initials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// Card accent palettes, cycled by quest index — lifted from the mockup's
// six hand-picked --qc-* token sets (public/Quest Board.html, turn 2a).
const PALETTES = [
  {
    angle: "158deg", bg1: "#f9f4ed", bg2: "#efe6d6", bg3: "#e2d7c2",
    clip: "polygon(0 5px,4% 0,30% 4px,58% 0,84% 5px,100% 0,calc(100% - 4px) 30%,100% 62%,calc(100% - 5px) 100%,72% calc(100% - 5px),42% 100%,16% calc(100% - 4px),0 100%,4px 66%,0 32%)",
    dot: "#c67139", ink: "#402310", muted: "#82796a", mutedDark: "#645c50",
    divider: "rgba(100,92,80,.28)", empty: "rgba(198,113,57,.65)", btnInk: "#f9f4ed",
  },
  {
    angle: "150deg", bg1: "#f4faea", bg2: "#e6f0d4", bg3: "#d6e2bd",
    clip: "polygon(0 4px,5% 0,32% 5px,60% 0,86% 4px,100% 0,calc(100% - 5px) 34%,100% 66%,calc(100% - 4px) 100%,70% calc(100% - 4px),40% 100%,14% calc(100% - 5px),0 100%,5px 60%,0 28%)",
    dot: "#7a8a5e", ink: "#3d472b", muted: "#56633f", mutedDark: "#474238",
    divider: "rgba(86,99,63,.28)", empty: "rgba(86,99,63,.6)", btnInk: "#f0fae1",
  },
  {
    angle: "165deg", bg1: "#f9f4ed", bg2: "#ede4d2", bg3: "#ded2bb",
    clip: "polygon(0 5px,6% 0,34% 4px,62% 0,88% 5px,100% 0,calc(100% - 4px) 28%,100% 60%,calc(100% - 5px) 100%,76% calc(100% - 5px),46% 100%,20% calc(100% - 4px),0 100%,4px 64%,0 30%)",
    dot: "#a19786", ink: "#402310", muted: "#82796a", mutedDark: "#645c50",
    divider: "rgba(100,92,80,.28)", empty: "rgba(140,73,26,.5)", btnInk: "#f9f4ed",
  },
  {
    angle: "152deg", bg1: "#f9f4ed", bg2: "#f0e7d7", bg3: "#e3d8c4",
    clip: "polygon(0 4px,5% 0,28% 5px,56% 0,82% 4px,100% 0,calc(100% - 5px) 32%,100% 64%,calc(100% - 4px) 100%,74% calc(100% - 4px),44% 100%,18% calc(100% - 5px),0 100%,5px 62%,0 26%)",
    dot: "#c67139", ink: "#402310", muted: "#82796a", mutedDark: "#645c50",
    divider: "rgba(100,92,80,.28)", empty: "rgba(198,113,57,.65)", btnInk: "#f9f4ed",
  },
  {
    angle: "148deg", bg1: "#f4faea", bg2: "#e4eed2", bg3: "#d3dfba",
    clip: "polygon(0 5px,4% 0,30% 4px,58% 0,86% 5px,100% 0,calc(100% - 4px) 30%,100% 62%,calc(100% - 5px) 100%,70% calc(100% - 5px),40% 100%,16% calc(100% - 4px),0 100%,5px 58%,0 30%)",
    dot: "#7a8a5e", ink: "#3d472b", muted: "#56633f", mutedDark: "#474238",
    divider: "rgba(86,99,63,.28)", empty: "rgba(86,99,63,.6)", btnInk: "#f0fae1",
  },
] as const;

const AVATAR_BG = ["#ffc6a5", "#ccdbb2", "#dcd3c4", "#eee7db", "#e1eecc", "#f6a06b"];
const AVATAR_INK = ["#643312", "#3d472b", "#645c50", "#474238", "#3d472b", "#40230f"];

function avatarStyle(seed: number): string {
  const i = seed % AVATAR_BG.length;
  return `background:${AVATAR_BG[i]};color:${AVATAR_INK[i]}`;
}

function relativeDate(iso: string): string {
  const diffMs = Date.parse(iso) - Date.now();
  const days = Math.round(diffMs / 86_400_000);
  if (days === 0) return "posted today";
  if (days === -1) return "posted yesterday";
  if (days < 0) return `posted ${-days}d ago`;
  return `posted in ${days}d`;
}

export function renderQuestCard(
  quest: Quest,
  signups: QuestSignup[],
  usersById: Map<string, User>,
  currentUserId: string,
  paletteIndex: number,
): string {
  const p = PALETTES[paletteIndex % PALETTES.length];
  const yes = signups.filter((s) => s.response === "yes");
  const mine = signups.find((s) => s.user_id === currentUserId);
  const cap = quest.capacity;
  const seatsLeft = cap != null ? Math.max(cap - yes.length, 0) : null;

  const status = cap == null
    ? "open · no cap"
    : seatsLeft === 0
    ? `full · ${yes.length} of ${cap}`
    : `${seatsLeft} of ${cap} seats left`;

  const avatarSlots = cap ?? Math.max(yes.length, 4);
  const avatars = [
    ...yes.slice(0, avatarSlots).map((s, i) => {
      const u = usersById.get(s.user_id);
      return `<span class="quest-avatar" style="${avatarStyle(i)}">${
        escapeHtml(u ? initials(u.display_name) : "?")
      }</span>`;
    }),
    ...Array.from(
      { length: Math.max(avatarSlots - yes.length, 0) },
      () => `<span class="quest-avatar quest-avatar--empty"></span>`,
    ),
  ].join("\n          ");

  const author = usersById.get(quest.author_id);

  function rsvpBtn(response: "yes" | "maybe" | "no", label: string) {
    const active = mine?.response === response;
    const variant = response === "yes" ? "solid" : response === "maybe" ? "outline" : "ghost";
    return `<button type="submit" name="response" value="${response}"
            class="quest-btn quest-btn--${variant}${active ? " quest-btn--active" : ""}">${label}</button>`;
  }

  return `
      <article class="quest-card" id="quest-${quest.id}" style="--qc-angle:${p.angle};--qc-bg-1:${p.bg1};--qc-bg-2:${p.bg2};--qc-bg-3:${p.bg3};--qc-clip:${p.clip};--qc-dot:${p.dot};--qc-ink:${p.ink};--qc-muted:${p.muted};--qc-muted-dark:${p.mutedDark};--qc-divider:${p.divider};--qc-empty-1:${p.empty};--qc-btn-ink:${p.btnInk}">
        <span class="quest-card__pin"></span>
        <div class="quest-card__tag">${escapeHtml(quest.category.toUpperCase())}</div>
        <div class="quest-card__status">${escapeHtml(status)}</div>
        <h3>${escapeHtml(quest.title)}</h3>
        <p class="quest-card__desc">${escapeHtml(quest.description ?? "")}</p>
        <div class="quest-avatars">
          ${avatars}
        </div>
        <form method="post" action="/quests/${quest.id}/rsvp" class="quest-card__footer" style="border-top:none;padding-top:0">
          <time>${escapeHtml(relativeDate(quest.created_at))} by ${escapeHtml(author?.display_name ?? "someone")}</time>
        </form>
        <div class="quest-card__footer">
          <form method="post" action="/quests/${quest.id}/rsvp" class="quest-rsvp">
            ${rsvpBtn("yes", "I'm in")}
            ${rsvpBtn("maybe", "Maybe")}
            ${rsvpBtn("no", "Can't make it")}
          </form>
        </div>
      </article>`;
}

export function renderQuestsPage(
  board: Board,
  quests: Quest[],
  signupsByQuest: Map<string, QuestSignup[]>,
  users: User[],
  currentUserId: string,
  debug: boolean = false,
): string {
  const usersById = new Map(users.map((u) => [u.id, u]));

  const cards = quests
    .map((q, i) => renderQuestCard(q, signupsByQuest.get(q.id) ?? [], usersById, currentUserId, i))
    .join("\n");

  const currentUser = usersById.get(currentUserId);

  const actingAs = debug
    ? (() => {
      const userOptions = users
        .map((u) =>
          `<option value="${u.id}"${u.id === currentUserId ? " selected" : ""}>${
            escapeHtml(u.display_name)
          }</option>`
        )
        .join("");
      return `<form method="get" action="/act-as" class="topbar__who">
      <span>Acting as</span>
      <select name="uid" onchange="this.form.submit()">${userOptions}</select>
      <a href="/signup" class="topbar__signup-link">new here? create an account</a>
      <a href="/guild-master" class="topbar__signup-link">guild master queue</a>
    </form>`;
    })()
    : `<div class="topbar__who">
      <span>Acting as ${escapeHtml(currentUser?.display_name ?? "someone")}</span>
      <a href="/signup" class="topbar__signup-link">new here? create an account</a>
      <a href="/guild-master" class="topbar__signup-link">guild master queue</a>
    </div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(board.name)} — Quest Board</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Caprasimo&family=Figtree:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/quest-board.css">
<script type="module" src="/vendor/datastar.js"></script>
</head>
<body>
<div class="page">
  <div class="topbar">
    <span>${escapeHtml(board.name)} · ${quests.length} open quest${quests.length === 1 ? "" : "s"}</span>
    ${actingAs}
  </div>
  <div class="quest-board">
    <div class="quest-board__header">
      <div>
        <div class="quest-board__plate"><span class="quest-board__title">The Quest Board</span></div>
        <p class="quest-board__subtitle">${escapeHtml(board.name)} · take one and it's yours to show up to</p>
      </div>
      <a href="/quests/new" class="quest-board__new-link">+ post a quest</a>
    </div>
    <div class="quest-board__grid">
      ${cards}
    </div>
  </div>
</div>
</body>
</html>`;
}
