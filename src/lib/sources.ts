import * as cheerio from "cheerio";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { createHash } from "node:crypto";

export type SourceItem = {
  title: string;
  link: string;
  description: string;
  publishedAt: string | null;
  sourceUrl: string;
  sourceName: string;
};

// AMSS map page removed from defaults: it is JavaScript-rendered and returns 0 items.
// Add it back (or RHMZ / other sources) via the SOURCE_URLS env var once a text/RSS list page is found.
const DEFAULT_SOURCES = [
  "https://www.putevi-srbije.rs/index.php/sr/stanje-na-drzavnim-putevima",
];

const USER_AGENT = "SerbiaJourneyRadar/0.1 (public-information monitoring; contact: project owner)";

// Cap on how many item pages are opened per run (keeps the serverless function within its time limit)
const MAX_DETAIL_FETCHES = 8;

// Words that indicate a real disruption/announcement. Deliberately NO bare "put":
// it matched "putarina", "putevi", "putni objekti" and turned menu pages into records.
const KEYWORDS =
  /(?<!\p{L})(radovi|radova|obustav\w*|izmenjen\w*\s+re[žz]im|zatvor\w*|nezgod\w*|zastoj|protest|manifestacij\w*|upozorenj\w*|sneg|magl\w*|poplav\w*|poledic\w*)/iu;

// Site sections that are never incidents
const NOISE_URL = /\/(organizacija|galerija|godi(š|s|%C5%A1)nji|brojanje)/i;

export function getSourceUrls(): string[] {
  const configured = (process.env.SOURCE_URLS || "").split(",").map(s => s.trim()).filter(Boolean);
  return [...new Set(configured.length ? configured : DEFAULT_SOURCES)];
}

function sourceName(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("putevi-srbije")) return "Putevi Srbije";
    if (host.includes("amss")) return "AMSS";
    if (host.includes("hidmet")) return "RHMZ";
    return host;
  } catch { return "Unknown source"; }
}

function clean(s: string) {
  return s.replace(/\s+/g, " ").trim().slice(0, 2500);
}

function parseDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// "23.10.2026. Radovi na ..." -> ISO date at midnight UTC
function dateFromTitle(title: string): string | null {
  const m = title.match(/^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function slugify(title: string) {
  return title.toLowerCase().replace(/[^\p{L}\d]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

// The announcement text of an accordion item is in the element after the title link
// (or after its parent). Returns "" when nothing usable is found.
function accordionPanelText($: cheerio.CheerioAPI, el: any): string {
  const candidates = [$(el).next(), $(el).parent().next()];
  for (const c of candidates) {
    if (!c.length || c.is("a.accordionTitle") || c.find("a.accordionTitle").length) continue;
    const text = clean(c.text());
    if (text) return text;
  }
  return "";
}

function isNoiseUrl(link: string) {
  let decoded = link;
  try { decoded = decodeURIComponent(link); } catch { /* keep raw */ }
  return NOISE_URL.test(link) || NOISE_URL.test(decoded);
}

function itemFromXml(item: any, sourceUrl: string, name: string): SourceItem | null {
  const title = clean(String(item.title?.["#text"] ?? item.title ?? ""));
  const linkValue = item.link?.href ?? item.link ?? item.guid ?? sourceUrl;
  const link = typeof linkValue === "string" ? linkValue : sourceUrl;
  const desc = item.description ?? item.summary ?? item["content:encoded"] ?? "";
  const description = clean(typeof desc === "string" ? cheerio.load(desc).text() : JSON.stringify(desc));
  if (!title && !description) return null;
  return {
    title: title || description.slice(0, 120),
    link: safeUrl(link, sourceUrl),
    description,
    publishedAt: parseDate(item.pubDate ?? item.published ?? item.updated ?? item["dc:date"]),
    sourceUrl,
    sourceName: name,
  };
}

function safeUrl(link: string, base: string) {
  try { return new URL(link, base).toString(); } catch { return base; }
}

// Opens one announcement page and returns its main text (empty string on any failure)
async function fetchDetail(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html;q=0.9,*/*;q=0.8" },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (!response.ok) return "";
    const $d = cheerio.load(await response.text());
    $d("script, style, nav, footer, header, noscript, svg").remove();
    return clean($d("main, article, .content, body").first().text());
  } catch {
    return "";
  }
}

export async function fetchSourceItems(sourceUrl: string): Promise<SourceItem[]> {
  const name = sourceName(sourceUrl);
  const response = await fetch(sourceUrl, {
    headers: {
      "user-agent": USER_AGENT,
      "accept": "text/html,application/rss+xml,application/atom+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(18000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${sourceUrl}`);
  const body = await response.text();
  const contentType = response.headers.get("content-type") || "";
  const looksXml = contentType.includes("xml") || /^\s*<\?xml/i.test(body) || /<rss[\s>]|<feed[\s>]/i.test(body);

  if (looksXml && XMLValidator.validate(body) === true) {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text", isArray: (n) => ["item", "entry"].includes(n) });
    const parsed = parser.parse(body);
    const entries = parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? parsed?.channel?.item ?? [];
    const array = Array.isArray(entries) ? entries : [entries];
    return array.map((item: any) => itemFromXml(item, sourceUrl, name)).filter(Boolean).slice(0, 100) as SourceItem[];
  }

  const $ = cheerio.load(body);
  $("script, style, nav, footer, header, noscript, svg").remove();
  const items: SourceItem[] = [];
  const seen = new Set<string>();

  // 1) Accordion announcements (Putevi Srbije): the title link is javascript:void(0) and the
  //    announcement text sits in the element right after it. Each one gets its own link
  //    (page address + #slug) so they are not collapsed into a single item.
  $("a.accordionTitle").each((_, el) => {
    const title = clean($(el).text());
    if (title.length < 10 || seen.has(title)) return;
    seen.add(title);
    const alt = clean($(el).find("img").attr("alt") || "");
    const panel = accordionPanelText($, el);
    items.push({
      title,
      link: `${sourceUrl}#${slugify(title)}`,
      description: panel ? clean(`${alt ? alt + ". " : ""}${panel}`) : title,
      publishedAt: dateFromTitle(title),
      sourceUrl,
      sourceName: name,
    });
  });

  // 2) Ordinary links (only real web addresses, never javascript: or mailto:)
  $("a[href]").each((_, el) => {
    if ($(el).hasClass("accordionTitle")) return;
    const title = clean($(el).text());
    const link = safeUrl(String($(el).attr("href") || ""), sourceUrl);
    if (!/^https?:/i.test(link)) return;
    if (title.length < 18 || !KEYWORDS.test(title)) return;
    if (isNoiseUrl(link) || seen.has(link) || link === sourceUrl) return;
    seen.add(link);
    items.push({
      title,
      link,
      description: title,
      publishedAt: dateFromTitle(title),
      sourceUrl,
      sourceName: name,
    });
  });

  // Enrich the first few dated announcements with the full page text
  // (restrictions, time windows, end date). Failures fall back to the title.
  const dated = items
    .filter(i => i.publishedAt && i.description === i.title && /^https?:/i.test(i.link) && !i.link.includes("#"))
    .slice(0, MAX_DETAIL_FETCHES);
  await Promise.all(dated.map(async (item) => {
    const detail = await fetchDetail(item.link);
    if (detail) item.description = detail;
  }));

  // Do not convert a generic page visit into an incident. If no relevant entries
  // can be extracted, return zero items and let the collection log show that.
  return items.slice(0, 80);
}

export function dedupeKey(item: SourceItem) {
  return createHash("sha256").update(item.link || `${item.sourceUrl}|${item.title}`).digest("hex");
}
