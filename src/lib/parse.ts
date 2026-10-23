import { createHash } from "node:crypto";

// Roads that matter for your routes. Adjust to your own network.
const WATCHLIST_ROADS = ["IA-1", "IA-2", "IA-3", "IA-4", "IA-5"];
const WATCHLIST_TEXT = /(?<![\p{L}\d])(A[1-5]|E-?(70|75|80|761|763))(?![\p{L}\d])/iu;

export type ParsedTitle = {
  startsOn: string | null;   // YYYY-MM-DD
  road: string | null;       // e.g. "IA-2", "IIA-150"
  section: string | null;    // e.g. "Surčin jug - Prilipac"
};

// "23.10.2026. Radovi na državnom putu I A reda broj 2, na deonici Surčin jug - Prilipac"
export function parseTitle(title: string): ParsedTitle {
  const d = title.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  const startsOn = d ? `${d[3]}-${d[2].padStart(2, "0")}-${d[1].padStart(2, "0")}` : null;

  const r = title.match(/(?<![\p{L}])(I{1,2})\s?([AB])\s+reda\s+broj\s+(\d+)/iu);
  const road = r ? `${r[1]}${r[2]}-${r[3]}`.toUpperCase() : null;

  const s = title.match(/deonic[ia]\s+(.+)$/iu);
  const section = s ? s[1].trim() : null;

  return { startsOn, road, section };
}

// Looks for "do 25.10.2026" in the announcement text and returns end of that day (UTC)
export function parseEnd(text: string): string | null {
  const m = text.match(/(?<![\p{L}])do\s+(\d{1,2})\.(\d{1,2})\.(\d{4})/iu);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T23:59:59Z`;
}

export function scoreIncident(title: string, road: string | null, startsOn: string | null) {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Belgrade" }); // YYYY-MM-DD
  let score = 0;
  const why: string[] = [];

  if (/zatvor|obustav/i.test(title)) { score += 3; why.push("closure"); }
  else if (/radov/i.test(title))      { score += 1; why.push("roadworks"); }

  if (startsOn === today)             { score += 2; why.push("today"); }

  if ((road && WATCHLIST_ROADS.includes(road)) || WATCHLIST_TEXT.test(title)) {
    score += 2; why.push("watchlist road");
  }

  return { score, reason: why.length ? why.join(" + ") : null };
}

// Same roadworks posted by different sources collapse into one row.
// Returns null when the title can't be parsed; caller falls back to the URL-based key.
export function smartKey(road: string | null, section: string | null, startsOn: string | null): string | null {
  if (!road || !startsOn) return null;
  return createHash("sha1").update(`${road}|${section ?? ""}|${startsOn}`).digest("hex");
}

