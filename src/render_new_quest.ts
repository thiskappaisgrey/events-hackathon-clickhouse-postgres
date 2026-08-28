// Add-quest page — server-side HTML rendering.

import { CATEGORIES } from "./categories.ts";

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderNewQuestPage(boardId: string, opts: {
  error?: string;
  title?: string;
  description?: string;
  category?: string;
  capacity?: string;
} = {}): string {
  const { error, title = "", description = "", category = "", capacity = "" } = opts;

  const boardGroups = new Map<string, typeof CATEGORIES>();
  for (const c of CATEGORIES) {
    if (!boardGroups.has(c.board)) boardGroups.set(c.board, []);
    boardGroups.get(c.board)!.push(c);
  }
  const categoryOptions = Array.from(boardGroups.entries())
    .map(([board, cats]) =>
      `<optgroup label="${escapeHtml(board)}">${
        cats
          .map((c) =>
            `<option value="${escapeHtml(c.value)}"${c.value === category ? " selected" : ""}>${
              escapeHtml(c.label)
            }</option>`
          )
          .join("")
      }</optgroup>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Post a quest — Quest Board</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Caprasimo&family=Figtree:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/quest-board.css">
</head>
<body>
<div class="page signup-page">
  <div class="signup-card">
    <h1 class="signup-card__title">Post a quest</h1>
    <p class="signup-card__subtitle">an idea for something you'd already like to do</p>
    ${error ? `<p class="signup-card__error">${escapeHtml(error)}</p>` : ""}
    <details class="ai-assist">
      <summary>Not sure what to post? Let AI help</summary>
      <div class="ai-assist__body">
        <p class="ai-assist__hint">Answer a few quick prompts and get some quest ideas — grounded in what people on this board are actually into.</p>
        <label class="signup-form__field">
          <span>Something you loved doing as a kid, or still do</span>
          <input type="text" id="ai-childhood" placeholder="e.g. building blanket forts, catching bugs, arguing about books" autocomplete="off">
        </label>
        <label class="signup-form__field">
          <span>After a long week, you'd rather...</span>
          <select id="ai-energy">
            <option value="recharge alone">recharge alone</option>
            <option value="be around people">be around people</option>
          </select>
        </label>
        <label class="signup-form__field">
          <span>Indoor or outdoor?</span>
          <select id="ai-setting">
            <option value="either">either</option>
            <option value="indoor">indoor</option>
            <option value="outdoor">outdoor</option>
          </select>
        </label>
        <button type="button" class="quest-btn quest-btn--outline" id="ai-suggest-btn">Get quest ideas</button>
        <div id="ai-suggestions" class="ai-suggestions"></div>
      </div>
    </details>
    <form method="post" action="/quests/${escapeHtml(boardId)}/new" class="signup-form">
      <label class="signup-form__field">
        <span>Title</span>
        <input type="text" name="title" value="${escapeHtml(title)}" placeholder="e.g. Sunset hike at Bernal" required autocomplete="off">
      </label>
      <label class="signup-form__field">
        <span>Description</span>
        <textarea name="description" placeholder="optional details" rows="4">${escapeHtml(description)}</textarea>
      </label>
      <label class="signup-form__field">
        <span>Category</span>
        <select name="category" required>
          <option value="" disabled${category ? "" : " selected"}>pick a category&hellip;</option>
          ${categoryOptions}
        </select>
        <small class="signup-form__hint">picks which board this lands on</small>
      </label>
      <label class="signup-form__field">
        <span>Capacity</span>
        <input type="number" name="capacity" value="${escapeHtml(capacity)}" placeholder="optional, leave blank for no cap" min="1" step="1">
      </label>
      <button type="submit" class="quest-btn quest-btn--solid signup-form__submit">Post quest</button>
    </form>
    <p class="signup-card__footer"><a href="/quests">back to the quest board</a></p>
  </div>
</div>
<script type="module" src="/quest-board.js"></script>
</body>
</html>`;
}
