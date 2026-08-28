// "Not sure what to post?" quest suggestions — a single LLM call that
// turns a few quick prompts about what someone enjoys into 2-3 draft
// quests they can post with one click. Grounded in ClickHouse trending
// categories (src/clickhouse.ts's getTrendingCategories) so suggestions
// lean toward what people on this board are actually signing up for,
// not generic hobby ideas.
//
// Runs through OpenRouter (an OpenAI-compatible chat completions API in
// front of many providers) rather than the Anthropic API directly, so a
// plain fetch call is enough — no SDK dependency. OPENROUTER_MODEL
// defaults to a cheap model; override via env for something else.

import type { CategoryDef } from "./categories.ts";

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
const OPENROUTER_MODEL = Deno.env.get("OPENROUTER_MODEL") ?? "google/gemini-2.5-flash-lite";

export interface QuestSuggestion {
  title: string;
  description: string;
  category: string;
}

export async function suggestQuests(opts: {
  childhoodJoy: string;
  energy: string;
  setting: string;
  trendingCategories: string[];
  categories: CategoryDef[];
}): Promise<QuestSuggestion[]> {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const categoryList = opts.categories.map((c) => c.value).join(", ");
  const trendingLine = opts.trendingCategories.length
    ? ` People on this board have recently been saying yes to: ${opts.trendingCategories.join(", ")} — lean toward those when they fit.`
    : "";

  const systemPrompt =
    `You help someone who isn't sure what to post on a "Quest Board" — an app where people post ` +
    `events ("quests") they'd genuinely like to do, and others sign up to join. Given short answers ` +
    `about what they enjoy, suggest 2-3 specific, inviting quest ideas they could post as-is. Each needs ` +
    `a punchy title, a one-to-two sentence description that sounds like an invitation (not a chore), and ` +
    `a category.${trendingLine}\n\n` +
    `The "category" field MUST be copied character-for-character from this list, nothing else added — ` +
    `no board name, no extra words: [${categoryList}]\n\n` +
    `Respond with ONLY a JSON object of the shape ` +
    `{"suggestions": [{"title": string, "description": string, "category": string}]} — no prose, no markdown fences.`;

  const userPrompt =
    `Something I loved doing as a kid, or still do: ${opts.childhoodJoy || "not sure"}\n` +
    `After a long week I'd rather: ${opts.energy || "not sure"}\n` +
    `Indoor or outdoor: ${opts.setting || "either"}`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${OPENROUTER_API_KEY}`,
      // OpenRouter uses these for its public leaderboard attribution; harmless to send.
      "http-referer": "https://github.com/quest-board",
      "x-title": "Quest Board",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      max_tokens: 800,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter request failed: ${res.status} ${body}`);
  }

  const data = await res.json();
  const text: string | undefined = data.choices?.[0]?.message?.content;
  if (!text) return [];

  const jsonText = text.trim().replace(/^```(?:json)?\s*/, "").replace(/```$/, "");
  let parsed: { suggestions?: QuestSuggestion[] };
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    console.error("suggestQuests: failed to parse model output as JSON:", err, "\nraw text:", text);
    return [];
  }
  // Cheap models sometimes echo extra words around the category ("bird
  // watching, Nature board" instead of "bird watching") despite the
  // char-for-char instruction — recover by matching the longest known
  // category value contained in whatever came back, case-insensitively.
  const sortedValues = opts.categories.map((c) => c.value).sort((a, b) => b.length - a.length);
  function normalizeCategory(raw: string): string | undefined {
    const lower = raw.toLowerCase();
    return sortedValues.find((v) => lower.includes(v.toLowerCase()));
  }

  const suggestions = parsed.suggestions ?? [];
  const normalized = suggestions
    .map((s) => {
      const category = normalizeCategory(s.category);
      return category ? { ...s, category } : undefined;
    })
    .filter((s): s is QuestSuggestion => s !== undefined);

  if (normalized.length === 0 && suggestions.length > 0) {
    console.error(
      "suggestQuests: model returned suggestions but none matched a known category:",
      JSON.stringify(suggestions),
    );
  }
  return normalized;
}
