// Quest Board — integration tests for src/db.ts
// Exercises the "user creates an event, others sign up/RSVP" flow against
// a real Postgres instance (see Justfile: `just up`). Each test run uses
// unique handles so it can be re-run without manual cleanup, and every
// row it creates is deleted in a `finally` block.

import { assert, assertEquals, assertExists } from "jsr:@std/assert@^1";
import * as db from "./db.ts";

const suffix = () => crypto.randomUUID().slice(0, 8);

Deno.test({
  name: "organizer creates an event, others RSVP",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const tag = suffix();
    let organizer: db.User;
    let alice: db.User;
    let bob: db.User;
    let board: db.Board;
    let quest: db.Quest;

    try {
      await t.step("create users", async () => {
        organizer = await db.createUser(`organizer-${tag}`, "Orin Organizer");
        alice = await db.createUser(`alice-${tag}`, "Alice Attendee");
        bob = await db.createUser(`bob-${tag}`, "Bob Baker");
        assertExists(organizer.id);
        assertExists(alice.id);
        assertExists(bob.id);
      });

      await t.step("organizer creates a board and invites attendees", async () => {
        board = await db.createBoard(`Hiking Circle ${tag}`, "circle", organizer.id);
        assertEquals(board.created_by, organizer.id);

        await db.addBoardMember(board.id, organizer.id);
        await db.addBoardMember(board.id, alice.id);
        await db.addBoardMember(board.id, bob.id);

        const members = await db.listBoardMembers(board.id);
        const memberIds = members.map((m) => m.id).sort();
        assertEquals(memberIds, [organizer.id, alice.id, bob.id].sort());

        const boardsForAlice = await db.listUserBoards(alice.id);
        assert(boardsForAlice.some((b) => b.id === board.id));
      });

      await t.step("organizer posts a quest (event)", async () => {
        quest = await db.createQuest({
          boardId: board.id,
          authorId: organizer.id,
          title: "Sunrise hike",
          description: "Meet at the trailhead at 6am",
          category: "hiking",
          capacity: 2,
        });
        assertEquals(quest.status, "open");
        assertEquals(quest.board_id, board.id);

        const fetched = await db.getQuest(quest.id);
        assertEquals(fetched?.title, "Sunrise hike");

        const questsOnBoard = await db.listQuestsByBoard(board.id);
        assert(questsOnBoard.some((qu) => qu.id === quest.id));
      });

      await t.step("attendees sign up / RSVP", async () => {
        const aliceSignup = await db.upsertSignup(quest.id, alice.id, "yes");
        assertEquals(aliceSignup.response, "yes");

        await db.upsertSignup(quest.id, bob.id, "maybe");

        const signups = await db.listSignupsForQuest(quest.id);
        assertEquals(signups.length, 2);
        const byUser = Object.fromEntries(signups.map((s) => [s.user_id, s.response]));
        assertEquals(byUser[alice.id], "yes");
        assertEquals(byUser[bob.id], "maybe");

        const aliceSignups = await db.listSignupsForUser(alice.id);
        assert(aliceSignups.some((s) => s.quest_id === quest.id && s.response === "yes"));
      });

      await t.step("attendee changes their RSVP", async () => {
        const updated = await db.upsertSignup(quest.id, bob.id, "yes");
        assertEquals(updated.response, "yes");

        const signups = await db.listSignupsForQuest(quest.id);
        const bobSignup = signups.find((s) => s.user_id === bob.id);
        assertEquals(bobSignup?.response, "yes");
      });

      await t.step("attendee cancels their RSVP", async () => {
        await db.removeSignup(quest.id, bob.id);
        const signups = await db.listSignupsForQuest(quest.id);
        assert(!signups.some((s) => s.user_id === bob.id));
        assert(signups.some((s) => s.user_id === alice.id));
      });

      await t.step("organizer locks then completes the quest", async () => {
        const locked = await db.updateQuestStatus(quest.id, "locked");
        assertEquals(locked?.status, "locked");

        const completed = await db.updateQuestStatus(quest.id, "completed");
        assertEquals(completed?.status, "completed");
      });
    } finally {
      if (quest!) await db.deleteQuest(quest.id); // cascades quest_signups
      if (board!) await db.deleteBoard(board.id); // cascades board_members
      if (bob!) await db.deleteUser(bob.id);
      if (alice!) await db.deleteUser(alice.id);
      if (organizer!) await db.deleteUser(organizer.id);
    }
  },
});

Deno.test({
  name: "user profile CRUD",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const tag = suffix();
    const user = await db.createUser(`renamer-${tag}`, "Original Name");
    try {
      assertEquals(user.display_name, "Original Name");

      const fetched = await db.getUser(user.id);
      assertEquals(fetched?.handle, `renamer-${tag}`);

      const renamed = await db.updateUserDisplayName(user.id, "New Name");
      assertEquals(renamed?.display_name, "New Name");

      const all = await db.listUsers();
      assert(all.some((u) => u.id === user.id));
    } finally {
      await db.deleteUser(user.id);
      assertEquals(await db.getUser(user.id), undefined);
    }
  },
});

Deno.test({
  name: "nudge queue for dormant users",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const tag = suffix();
    const user = await db.createUser(`dormant-${tag}`, "Dormant Dan");
    let nudge: db.Nudge | undefined;
    try {
      nudge = await db.createNudge(user.id, "dormant_14d");
      assertEquals(nudge.status, "pending");

      const pending = await db.listPendingNudges();
      assert(pending.some((n) => n.id === nudge!.id));

      const resolved = await db.resolveNudge(nudge.id, "contacted");
      assertEquals(resolved?.status, "contacted");
      assertExists(resolved?.resolved_at);

      const pendingAfter = await db.listPendingNudges();
      assert(!pendingAfter.some((n) => n.id === nudge!.id));
    } finally {
      // nudges.user_id has no ON DELETE clause and db.ts exposes no
      // deleteNudge, so the user (and its resolved nudge row) are left
      // in place rather than failing this cleanup on a FK violation.
    }
  },
});
