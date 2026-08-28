// Fixed quest categories, grouped by which of the 4 seeded boards (TASKS.md
// Task 4) they belong to. Previously the "post a quest" form took a free-text
// category, so a quest typed while looking at one board's page could end up
// mis-filed (e.g. a "hiking" quest posted from the Art board). Categories are
// now a closed set, each tied to exactly one board, so the quest always lands
// on the board that actually matches what it's about.
export interface CategoryDef {
  value: string;
  label: string;
  board: string;
}

export const CATEGORIES: CategoryDef[] = [
  { value: "comedy", label: "Comedy", board: "Art" },
  { value: "guitar", label: "Guitar / music", board: "Art" },
  { value: "study", label: "Study group", board: "Learning" },
  { value: "databases", label: "Databases", board: "Learning" },
  { value: "games", label: "Games", board: "Social" },
  { value: "swing dancing", label: "Swing dancing", board: "Social" },
  { value: "restaurants", label: "Restaurants", board: "Social" },
  { value: "hiking", label: "Hiking", board: "Nature" },
  { value: "bird watching", label: "Bird watching", board: "Nature" },
];

export function boardNameForCategory(category: string): string | undefined {
  return CATEGORIES.find((c) => c.value === category)?.board;
}
