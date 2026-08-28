// Signup / create-user page — server-side HTML rendering.

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderSignupPage(opts: {
  error?: string;
  handle?: string;
  displayName?: string;
} = {}): string {
  const { error, handle = "", displayName = "" } = opts;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Create an account — Quest Board</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Caprasimo&family=Figtree:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/quest-board.css">
</head>
<body>
<div class="page signup-page">
  <div class="signup-card">
    <h1 class="signup-card__title">Join the board</h1>
    <p class="signup-card__subtitle">pick a handle, tell us your name, and you're in</p>
    ${error ? `<p class="signup-card__error">${escapeHtml(error)}</p>` : ""}
    <form method="post" action="/signup" class="signup-form">
      <label class="signup-form__field">
        <span>Handle</span>
        <input type="text" name="handle" value="${escapeHtml(handle)}" placeholder="e.g. wanderer" required autocomplete="off">
      </label>
      <label class="signup-form__field">
        <span>Display name</span>
        <input type="text" name="displayName" value="${escapeHtml(displayName)}" placeholder="e.g. Sam Rivera" required autocomplete="off">
      </label>
      <button type="submit" class="quest-btn quest-btn--solid signup-form__submit">Create account</button>
    </form>
    <p class="signup-card__footer"><a href="/quests">back to the quest board</a></p>
  </div>
</div>
</body>
</html>`;
}
