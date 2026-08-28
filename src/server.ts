// Quest Board — HTTP server
// Run with `deno task dev` (auto-restarts / hot-swaps on save via --watch-hmr).

import { serveDir } from "@std/http/file-server";
import {
  addBoardMember,
  createQuest,
  createUser,
  listBoardMembers,
  listBoards,
  listQuestsByBoard,
  listSignupsForQuest,
  upsertSignup,
  type SignupResponse,
} from "./db.ts";
import { renderQuestsPage } from "./render.ts";
import { renderNewQuestPage } from "./render_new_quest.ts";
import { renderSignupPage } from "./render_signup.ts";

function getCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

async function currentUserId(req: Request, boardId: string): Promise<string | undefined> {
  const uid = getCookie(req, "uid");
  if (!uid) return undefined;
  const members = await listBoardMembers(boardId);
  return members.some((u) => u.id === uid) ? uid : undefined;
}

async function renderBoard(req: Request): Promise<Response> {
  const boards = await listBoards();
  const board = boards[0];
  if (!board) {
    return new Response("No board seeded yet — run `deno task seed`.", { status: 503 });
  }

  const users = await listBoardMembers(board.id);
  let uid = await currentUserId(req, board.id);
  const headers = new Headers({ "content-type": "text/html; charset=utf-8" });
  if (!uid) {
    uid = users[0]?.id;
    if (uid) headers.append("set-cookie", `uid=${uid}; Path=/; SameSite=Lax`);
  }
  if (!uid) {
    return new Response("No users seeded yet — run `deno task seed`.", { status: 503 });
  }

  const quests = await listQuestsByBoard(board.id);
  const signupsByQuest = new Map(
    await Promise.all(
      quests.map(async (q) => [q.id, await listSignupsForQuest(q.id)] as const),
    ),
  );

  const html = renderQuestsPage(board, quests, signupsByQuest, users, uid);
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
    return await renderBoard(req);
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
    const board = boards[0];
    if (board) await addBoardMember(board.id, user.id);

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
    const boards = await listBoards();
    const board = boards[0];
    const members = board ? await listBoardMembers(board.id) : [];
    if (!uid || !members.some((u) => u.id === uid)) {
      return new Response("Unknown user", { status: 400 });
    }
    return new Response(null, {
      status: 303,
      headers: {
        location: "/quests",
        "set-cookie": `uid=${uid}; Path=/; SameSite=Lax`,
      },
    });
  }

  if (url.pathname === "/quests/new" && req.method === "GET") {
    const boards = await listBoards();
    const board = boards[0];
    const uid = board ? await currentUserId(req, board.id) : undefined;
    if (!uid) return Response.redirect(new URL("/signup", url), 303);

    return new Response(renderNewQuestPage(), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  if (url.pathname === "/quests/new" && req.method === "POST") {
    const boards = await listBoards();
    const board = boards[0];
    const uid = board ? await currentUserId(req, board.id) : undefined;
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
          renderNewQuestPage({
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

    if (!title || !category) {
      return new Response(
        renderNewQuestPage({
          error: "Title and category are both required.",
          title,
          description,
          category,
          capacity: capacityRaw,
        }),
        { status: 400, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }

    await createQuest({
      boardId: board!.id,
      authorId: uid,
      title,
      description: description || undefined,
      category,
      capacity,
    });

    return Response.redirect(new URL("/quests", url), 303);
  }

  const rsvpMatch = url.pathname.match(/^\/quests\/([0-9a-f-]+)\/rsvp$/);
  if (rsvpMatch && req.method === "POST") {
    const boards = await listBoards();
    const board = boards[0];
    const uid = board ? await currentUserId(req, board.id) : undefined;
    if (!uid) return new Response("No acting user selected", { status: 400 });

    const form = await req.formData();
    const response = form.get("response");
    if (response !== "yes" && response !== "no" && response !== "maybe") {
      return new Response("Invalid RSVP response", { status: 400 });
    }
    await upsertSignup(rsvpMatch[1], uid, response as SignupResponse);
    return Response.redirect(new URL("/quests", url), 303);
  }

  return serveDir(req, { fsRoot: "public" });
});
