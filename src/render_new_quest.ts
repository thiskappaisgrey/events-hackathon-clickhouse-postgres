// Add-quest page — server-side HTML rendering.

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
        <input type="text" name="category" value="${escapeHtml(category)}" placeholder="e.g. hiking" required autocomplete="off">
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
</body>
</html>`;
}
