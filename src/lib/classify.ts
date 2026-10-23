import type { Category, Severity, Confidence } from "./types";
import type { SourceItem } from "./sources";

export function classify(item: SourceItem): {
  category: Category; severity: Severity; confidence: Confidence;
  summary: string; locationText: string | null; region: string | null;
} {
  const text = `${item.title} ${item.description}`.toLowerCase();
  let category: Category = "other";
  if (/radovi|obustav|zatvoren|izmenjen režim|izmenjen rezim|asfalt|most|tunel|rekonstrukc|putni pravac/.test(text)) category = "roadworks";
  else if (/saobraćajna nezgoda|saobracajna nezgoda|udes|sudar|zastoj|gužv|guzv|kolona|traffic/.test(text)) category = "traffic";
  else if (/protest|manifestacij|koncert|utakmic|maraton|festival|događaj|dogadjaj|public event/.test(text)) category = "event";
  else if (/sneg|kiša|kisa|magla|vetar|vreme|upozorenje|poplav|poledic|weather/.test(text)) category = "weather";
  else if (/autobuska stanica|autobuskoj stanici|terminal|stajalište|stajaliste/.test(text)) category = "station";

  const severity: Severity = /potpuna obustava|potpuno zatvoren|full closure|evakuacij|crveni meteoalarm/i.test(text)
    ? "high"
    : category === "roadworks" || category === "traffic" ? "monitor" : "information";

  const confidence: Confidence = item.publishedAt ? "medium" : "low";
  const summary = item.description || "The source linked below contains the original announcement. Review it to verify location, timing, and restrictions.";
  const region = (text.match(/\b(beograd|novi sad|niš|nis|kragujevac|subotica|č a č a k|cacak|kruševac|krusevac|kraljevo|užice|uzice|zrenjanin|pančevo|pancevo|leskovac|smederevo|požarevac|pozarevac|valjevo|šabac|sabac|bor|zaječar|zajecar)\b/i)?.[0] || null);

  return { category, severity, confidence, summary: summary.slice(0, 1800), locationText: null, region };
}
