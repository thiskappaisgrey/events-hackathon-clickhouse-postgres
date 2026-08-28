// Quest Board — HTTP server
// Run with `deno task dev` (auto-restarts / hot-swaps on save via --watch-hmr).

import { serveDir } from "@std/http/file-server";
import {
  listBoardMembers,
  listBoards,
  listQuestsByBoard,
  listSignupsForQuest,
  upsertSignup,
  type SignupResponse,
} from "./db.ts";
import { renderQuestsPage } from "./render.ts";

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
