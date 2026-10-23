import type { Category, Severity, Confidence } from "./types";
import type { SourceItem } from "./sources";

// NOTE: \b is ASCII-only in JS, so it fails on š/č/ć/ž. Unicode lookarounds are used instead.

const REGIONS: [RegExp, string][] = [
  [/(?<!\p{L})beograd/iu, "Beograd"],
  [/(?<!\p{L})novi\s+sad/iu, "Novi Sad"],
  [/(?<!\p{L})ni[šs](?!\p{L})|(?<!\p{L})ni[šs]u(?!\p{L})/iu, "Niš"],
  [/(?<!\p{L})kragujevac|(?<!\p{L})kragujevc/iu, "Kragujevac"],
  [/(?<!\p{L})subotic/iu, "Subotica"],
  [/(?<!\p{L})[čc]a[čc]k/iu, "Čačak"],
  [/(?<!\p{L})kru[šs]evac|(?<!\p{L})kru[šs]evc/iu, "Kruševac"],
  [/(?<!\p{L})kraljev/iu, "Kraljevo"],
  [/(?<!\p{L})u[žz]ic/iu, "Užice"],
  [/(?<!\p{L})zrenjanin/iu, "Zrenjanin"],
  [/(?<!\p{L})pan[čc]ev/iu, "Pančevo"],
  [/(?<!\p{L})leskovac|(?<!\p{L})leskovc/iu, "Leskovac"],
  [/(?<!\p{L})smederev/iu, "Smederevo"],
  [/(?<!\p{L})po[žz]arevac|(?<!\p{L})po[žz]arevc/iu, "Požarevac"],
  [/(?<!\p{L})valjev/iu, "Valjevo"],
  [/(?<!\p{L})[šs]aba[cč]|(?<!\p{L})[šs]apc/iu, "Šabac"],
  [/(?<!\p{L})bor(?!\p{L})|(?<!\p{L})boru(?!\p{L})/iu, "Bor"],
  [/(?<!\p{L})za[jě]e[čc]ar/iu, "Zaječar"],
];

function detectRegion(text: string): string | null {
  return REGIONS.find(([re]) => re.test(text))?.[1] ?? null;
}

function detectCategory(text: string): Category {
  if (/radovi|obustav|zatvoren|izmenjen re[žz]im|asfalt|mostov|(?<!\p{L})most(?!\p{L})|tunel|rekonstrukc|putni pravac/u.test(text)) return "roadworks";
  if (/saobra[ćc]ajna nezgoda|(?<!\p{L})udes|sudar|zastoj|gu[žz]v|kolona|traffic/u.test(text)) return "traffic";
  if (/protest|manifestacij|koncert|utakmic|maraton|festival|doga[đd]aj|public event/u.test(text)) return "event";
  if (/sneg|ki[šs]a|magla|vetar|vreme|upozorenje|poplav|poledic|weather/u.test(text)) return "weather";
  if (/autobuska stanica|autobuskoj stanici|terminal|stajali[šs]te/u.test(text)) return "station";
  return "other";
}

export function classify(item: SourceItem): {
  category: Category; severity: Severity; confidence: Confidence;
  summary: string; locationText: string | null; region: string | null;
} {
  const titleText = item.title.toLowerCase();
  const fullText = `${item.title} ${item.description}`.toLowerCase();

  // Title first: the page body can contain sidebar/menu words that would misclassify the item.
  let category = detectCategory(titleText);
  if (category === "other") category = detectCategory(fullText);

  const fullClosure = /potpuna obustava|potpuno zatvoren|full closure|evakuacij|crveni meteoalarm/.test(fullText);
  const titleClosure = /obustav\w*\s+saobra[ćc]aj|zatvoren\w*\s+(put|saobra[ćc]aj)/u.test(titleText);
  const severity: Severity = fullClosure || titleClosure
    ? "high"
    : category === "roadworks" || category === "traffic" ? "monitor" : "information";

  const confidence: Confidence = item.publishedAt ? "medium" : "low";

  const hasDetail = item.description && item.description.trim() !== item.title.trim();
  const summary = hasDetail
    ? item.description
    : "The source linked below contains the original announcement. Review it to verify location, timing, and restrictions.";

  const region = detectRegion(titleText) ?? detectRegion(fullText);

  return { category, severity, confidence, summary: summary.slice(0, 1800), locationText: null, region };
}
