// Quest Board — HTTP server
// Run with `deno task dev` (auto-restarts / hot-swaps on save via --watch-hmr).

import { serveDir } from "@std/http/file-server";
import {
  addBoardMember,
  createQuest,
  createUser,
  getQuest,
  getUser,
  listBoardMembers,
  listBoards,
  listPendingNudges,
  listQuestsByBoard,
  listSignupsForQuest,
  listUsers,
  resolveNudge,
  upsertSignup,
  type SignupResponse,
} from "./db.ts";
import { getTrendingCategories, logActivities, logActivity } from "./clickhouse.ts";
import { runNudgePipeline } from "./nudges.ts";
import { paletteIndexFor, renderEmptyBoardPage, renderQuestCard, renderQuestsPage } from "./render.ts";
import { renderNewQuestPage } from "./render_new_quest.ts";
import { boardNameForCategory, CATEGORIES } from "./categories.ts";
import { suggestQuests } from "./ai.ts";
import { renderSignupPage } from "./render_signup.ts";
import { renderNudgesPage } from "./render_nudges.ts";

function getCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

// public/vendor/datastar.js turns out to be a core-only build (signals +
// computed only — no data-on/backend-action plugins), so the RSVP/acting-as
// no-reload wiring below is done with a small hand-rolled fetch+swap script
// (public/quest-board.js) instead of literal Datastar attributes. Requests
// from that script set this header; plain <form> posts (no-JS) don't, and
// keep getting the classic redirect.
function isFetchRequest(req: Request): boolean {
  return req.headers.get("x-requested-with") === "fetch";
}

async function currentUserId(req: Request, boardId: string): Promise<string | undefined> {
  const uid = getCookie(req, "uid");
  if (!uid) return undefined;
  const members = await listBoardMembers(boardId);
  return members.some((u) => u.id === uid) ? uid : undefined;
}

async function renderBoard(req: Request, boardId: string): Promise<Response> {
  const boards = await listBoards();
  if (boards.length === 0) {
    return new Response("No board seeded yet — run `deno task seed`.", { status: 503 });
  }
  const board = boards.find((b) => b.id === boardId);
  if (!board) {
    return new Response("Unknown board", { status: 404 });
  }

  const users = await listBoardMembers(board.id);
  let uid = await currentUserId(req, board.id);
  const headers = new Headers({ "content-type": "text/html; charset=utf-8" });
  if (!uid) {
    uid = users[0]?.id;
    if (uid) headers.append("set-cookie", `uid=${uid}; Path=/; SameSite=Lax`);
  }
  if (!uid) {
    return new Response(renderEmptyBoardPage(board, boards), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const quests = await listQuestsByBoard(board.id);
  const signupsByQuest = new Map(
    await Promise.all(
      quests.map(async (q) => [q.id, await listSignupsForQuest(q.id)] as const),
    ),
  );

  const debug = new URL(req.url).searchParams.get("debug") === "1";
  const html = renderQuestsPage(board, boards, quests, signupsByQuest, users, uid, debug);

  // Fire-and-forget: don't let ClickHouse being down break the page.
  logActivities(
    quests.map((q) => ({
      eventType: "quest_viewed",
      userId: uid,
      boardId: board.id,
      questId: q.id,
      category: q.category,
    })),
  ).catch((err) => console.error("activity log (quest_viewed) failed:", err));

  return new Response(html, { headers });
}

Deno.serve({ port: Number(Deno.env.get("PORT") ?? 8787) }, async (req) => {
  const url = new URL(req.url);

  if (url.pathname === "/health") {
    return Response.json({ ok: true });
  }

  if (url.pathname === "/" ) {
    return Response.redirect(new URL("/quests", url), 302);
  }

  if (url.pathname === "/quests" && req.method === "GET") {
    const boards = await listBoards();
    const board = boards[0];
    if (!board) {
      return new Response("No board seeded yet — run `deno task seed`.", { status: 503 });
    }
    return Response.redirect(new URL(`/quests/${board.id}`, url), 302);
  }

  const boardMatch = url.pathname.match(/^\/quests\/([0-9a-f-]+)$/);
  if (boardMatch && req.method === "GET") {
    return await renderBoard(req, boardMatch[1]);
  }

  if (url.pathname === "/signup" && req.method === "GET") {
    return new Response(renderSignupPage(), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  if (url.pathname === "/signup" && req.method === "POST") {
    const form = await req.formData();
    const handle = String(form.get("handle") ?? "").trim();
    const displayName = String(form.get("displayName") ?? "").trim();

    if (!handle || !displayName) {
      return new Response(renderSignupPage({ error: "Handle and display name are both required.", handle, displayName }), {
        status: 400,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    let user;
    try {
      user = await createUser(handle, displayName);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isConflict = message.includes("duplicate key") || message.includes("unique");
      return new Response(
        renderSignupPage({
          error: isConflict ? `Handle "${handle}" is already taken — try another.` : "Something went wrong creating your account.",
          handle,
          displayName,
        }),
        {
          status: isConflict ? 409 : 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        },
      );
    }

    const boards = await listBoards();
    await Promise.all(boards.map((board) => addBoardMember(board.id, user.id)));

    return new Response(null, {
      status: 303,
      headers: {
        location: "/quests",
        "set-cookie": `uid=${user.id}; Path=/; SameSite=Lax`,
      },
    });
  }

  if (url.pathname === "/act-as" && req.method === "GET") {
    const uid = url.searchParams.get("uid");
    const user = uid ? await getUser(uid) : undefined;
    if (!user) {
      return new Response("Unknown user", { status: 400 });
    }
    const setCookie = `uid=${uid}; Path=/; SameSite=Lax`;
    const boardId = url.searchParams.get("boardId");
    if (isFetchRequest(req) && boardId) {
      const boardReq = new Request(new URL(`/quests/${boardId}`, url), {
        headers: { cookie: `uid=${uid}` },
      });
      const res = await renderBoard(boardReq, boardId);
      res.headers.append("set-cookie", setCookie);
      return res;
    }
    return new Response(null, {
      status: 303,
      headers: {
        location: "/quests",
        "set-cookie": setCookie,
      },
    });
  }

  const newQuestMatch = url.pathname.match(/^\/quests\/([0-9a-f-]+)\/new$/);
  if (newQuestMatch && req.method === "GET") {
    const boardId = newQuestMatch[1];
    const uid = await currentUserId(req, boardId);
    if (!uid) return Response.redirect(new URL("/signup", url), 303);

    return new Response(renderNewQuestPage(boardId), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  if (newQuestMatch && req.method === "POST") {
    const boardId = newQuestMatch[1];
    const uid = await currentUserId(req, boardId);
    if (!uid) return Response.redirect(new URL("/signup", url), 303);

    const form = await req.formData();
    const title = String(form.get("title") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const category = String(form.get("category") ?? "").trim();
    const capacityRaw = String(form.get("capacity") ?? "").trim();

    let capacity: number | undefined;
    if (capacityRaw) {
      capacity = Number(capacityRaw);
      if (!Number.isInteger(capacity) || capacity <= 0) {
        return new Response(
          renderNewQuestPage(boardId, {
            error: "Capacity must be a positive whole number.",
            title,
            description,
            category,
            capacity: capacityRaw,
          }),
          { status: 400, headers: { "content-type": "text/html; charset=utf-8" } },
        );
      }
    }

    const targetBoardName = category ? boardNameForCategory(category) : undefined;

    if (!title || !category || !targetBoardName) {
      return new Response(
        renderNewQuestPage(boardId, {
          error: !title || !category
            ? "Title and category are both required."
            : "Unknown category — pick one from the list.",
          title,
          description,
          category,
          capacity: capacityRaw,
        }),
        { status: 400, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }

    // The category picked determines which board the quest actually belongs
    // on (see src/categories.ts) — not the board whose "post a quest" link
    // happened to be clicked, so a hiking quest always lands on Nature even
    // if it was opened from Art's page.
    const boards = await listBoards();
    const targetBoard = boards.find((b) => b.name === targetBoardName) ?? boards.find((b) => b.id === boardId);
    if (!targetBoard) {
      return new Response("Unknown board", { status: 404 });
    }

    const quest = await createQuest({
      boardId: targetBoard.id,
      authorId: uid,
      title,
      description: description || undefined,
      category,
      capacity,
    });

    logActivity({
      eventType: "quest_posted",
      userId: uid,
      boardId: targetBoard.id,
      questId: quest.id,
      category: quest.category,
    }).catch((err) => console.error("activity log (quest_posted) failed:", err));

    return Response.redirect(new URL(`/quests/${targetBoard.id}`, url), 303);
  }

  const suggestMatch = url.pathname.match(/^\/quests\/([0-9a-f-]+)\/suggest$/);
  if (suggestMatch && req.method === "POST") {
    const boardId = suggestMatch[1];
    let body: { childhoodJoy?: string; energy?: string; setting?: string };
    try {
      body = await req.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const trending = await getTrendingCategories(boardId).catch((err) => {
      console.error("getTrendingCategories failed:", err);
      return [] as string[];
    });

    try {
      const suggestions = await suggestQuests({
        childhoodJoy: body.childhoodJoy ?? "",
        energy: body.energy ?? "",
        setting: body.setting ?? "",
        trendingCategories: trending,
        categories: CATEGORIES,
      });
      return Response.json({ suggestions });
    } catch (err) {
      console.error("suggestQuests failed:", err);
      return Response.json(
        { suggestions: [], error: "Couldn't come up with ideas right now — try posting your own." },
        { status: 502 },
      );
    }
  }

  const rsvpMatch = url.pathname.match(/^\/quests\/([0-9a-f-]+)\/rsvp$/);
  if (rsvpMatch && req.method === "POST") {
    const quest = await getQuest(rsvpMatch[1]);
    if (!quest) return new Response("Unknown quest", { status: 404 });

    const uid = await currentUserId(req, quest.board_id);
    if (!uid) return new Response("No acting user selected", { status: 400 });

    const form = await req.formData();
    const response = form.get("response");
    if (response !== "yes" && response !== "no" && response !== "maybe") {
      return new Response("Invalid RSVP response", { status: 400 });
    }
    await upsertSignup(rsvpMatch[1], uid, response as SignupResponse);

    logActivity({
      eventType: "signup",
      userId: uid,
      boardId: quest.board_id,
      questId: quest.id,
      category: quest.category,
      response,
    }).catch((err) => console.error("activity log (signup) failed:", err));

    if (isFetchRequest(req)) {
      const [signups, members] = await Promise.all([
        listSignupsForQuest(quest.id),
        listBoardMembers(quest.board_id),
      ]);
      const usersById = new Map(members.map((u) => [u.id, u]));
      const card = renderQuestCard(quest, signups, usersById, uid, paletteIndexFor(quest.id));
      return new Response(card, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    return Response.redirect(new URL(`/quests/${quest.board_id}`, url), 303);
  }

  if (url.pathname === "/guild-master" && req.method === "GET") {
    const members = await listUsers();
    const usersById = new Map(members.map((u) => [u.id, u]));
    const nudges = await listPendingNudges();
    return new Response(renderNudgesPage(nudges, usersById), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  if (url.pathname === "/guild-master/run" && req.method === "POST") {
    const boards = await listBoards();
    for (const board of boards) await runNudgePipeline(board.id);
    return Response.redirect(new URL("/guild-master", url), 303);
  }

  const resolveMatch = url.pathname.match(/^\/guild-master\/([0-9a-f-]+)\/resolve$/);
  if (resolveMatch && req.method === "POST") {
    const form = await req.formData();
    const status = form.get("status");
    if (status !== "contacted" && status !== "dismissed") {
      return new Response("Invalid status", { status: 400 });
    }
    await resolveNudge(resolveMatch[1], status);
    return Response.redirect(new URL("/guild-master", url), 303);
  }

  return serveDir(req, { fsRoot: "public" });
});
