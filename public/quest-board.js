// Progressive-enhancement wiring for the quest board: RSVP buttons and the
// "acting as" switcher use fetch + DOM swap instead of a full page reload.
// Plain <form method="post"> fallback (server-rendered 303 redirects) keeps
// working if this script fails to load or fetch throws.
//
// Note: public/vendor/datastar.js turns out to be a core-only build (just
// data-signals/data-computed, no data-on/backend-action plugins) — see the
// comment in src/server.ts's isFetchRequest. So this is hand-rolled rather
// than data-on-click/data-target as originally sketched in TASKS.md.

function boardIdFromPath() {
  const m = location.pathname.match(/^\/quests\/([0-9a-f-]+)/);
  return m ? m[1] : null;
}

function bindRsvpForm(form) {
  if (form.dataset.bound) return;
  form.dataset.bound = "1";
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const card = form.closest(".quest-card");
    try {
      const res = await fetch(form.action, {
        method: "POST",
        body: new FormData(form, e.submitter ?? undefined),
        headers: { "x-requested-with": "fetch" },
      });
      if (!res.ok || !card) throw new Error(`rsvp failed: ${res.status}`);
      card.outerHTML = await res.text();
      bindAll();
    } catch {
      form.submit();
    }
  });
}

function bindActingAsForm(form) {
  if (form.dataset.bound) return;
  form.dataset.bound = "1";
  const select = form.querySelector("select[name=uid]");
  if (!select) return;
  select.addEventListener("change", async () => {
    const boardId = form.dataset.boardId ?? boardIdFromPath();
    try {
      const url = `/act-as?uid=${encodeURIComponent(select.value)}${boardId ? `&boardId=${encodeURIComponent(boardId)}` : ""}`;
      const res = await fetch(url, { headers: { "x-requested-with": "fetch" } });
      if (!res.ok) throw new Error(`act-as failed: ${res.status}`);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const newPage = doc.querySelector(".page");
      const oldPage = document.querySelector(".page");
      if (!newPage || !oldPage) throw new Error("missing .page in response");
      oldPage.replaceWith(newPage);
      document.title = doc.title;
      if (boardId) history.pushState(null, "", `/quests/${boardId}`);
      bindAll();
    } catch {
      form.submit();
    }
  });
}

function escapeHtml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// "Not sure what to post?" AI suggestions on the new-quest page (see
// src/ai.ts + POST /quests/:boardId/suggest in server.ts). Suggestion
// cards fill in the real form fields rather than posting anything
// themselves — the user still reviews and submits.
function bindAiSuggest() {
  const btn = document.getElementById("ai-suggest-btn");
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = "1";
  const boardId = boardIdFromPath();

  btn.addEventListener("click", async () => {
    const container = document.getElementById("ai-suggestions");
    const childhoodJoy = document.getElementById("ai-childhood").value.trim();
    const energy = document.getElementById("ai-energy").value;
    const setting = document.getElementById("ai-setting").value;
    if (!childhoodJoy) {
      container.textContent = "Tell us a bit about what you enjoy first.";
      return;
    }

    btn.disabled = true;
    const originalLabel = btn.textContent;
    btn.textContent = "Thinking…";
    container.textContent = "";

    try {
      const res = await fetch(`/quests/${boardId}/suggest`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ childhoodJoy, energy, setting }),
      });
      const data = await res.json();
      if (!res.ok || !data.suggestions?.length) {
        container.textContent = data.error ?? "Couldn't come up with ideas — try posting your own.";
        return;
      }

      container.innerHTML = "";
      for (const s of data.suggestions) {
        const card = document.createElement("div");
        card.className = "ai-suggestion";
        card.innerHTML = `
          <strong class="ai-suggestion__title">${escapeHtml(s.title)}</strong>
          <p class="ai-suggestion__description">${escapeHtml(s.description)}</p>
          <span class="ai-suggestion__category">${escapeHtml(s.category)}</span>
        `;
        const useBtn = document.createElement("button");
        useBtn.type = "button";
        useBtn.className = "quest-btn quest-btn--ghost ai-suggestion__use";
        useBtn.textContent = "Use this";
        useBtn.addEventListener("click", () => {
          const form = document.querySelector(".signup-form");
          form.querySelector("[name=title]").value = s.title;
          form.querySelector("[name=description]").value = s.description;
          const catSelect = form.querySelector("[name=category]");
          if (catSelect) catSelect.value = s.category;
          form.querySelector("[name=title]").scrollIntoView({ behavior: "smooth", block: "center" });
        });
        card.appendChild(useBtn);
        container.appendChild(card);
      }
    } catch {
      container.textContent = "Something went wrong — try posting your own idea.";
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  });
}

function bindAll() {
  document.querySelectorAll(".quest-rsvp").forEach(bindRsvpForm);
  document.querySelectorAll("[data-acting-as]").forEach(bindActingAsForm);
  bindAiSuggest();
}

bindAll();
