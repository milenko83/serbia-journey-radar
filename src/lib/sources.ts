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

const DEFAULT_SOURCES = [
  "https://www.putevi-srbije.rs/index.php/sr/stanje-na-drzavnim-putevima",
  "https://www.amss.org.rs/na-putu/stanje-na-putu/strana/mapa",
];

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

export async function fetchSourceItems(sourceUrl: string): Promise<SourceItem[]> {
  const name = sourceName(sourceUrl);
  const response = await fetch(sourceUrl, {
    headers: {
      "user-agent": "SerbiaJourneyRadar/0.1 (public-information monitoring; contact: project owner)",
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
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text", isArray: (name) => ["item", "entry"].includes(name) });
    const parsed = parser.parse(body);
    const entries = parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? parsed?.channel?.item ?? [];
    const array = Array.isArray(entries) ? entries : [entries];
    return array.map((item: any) => itemFromXml(item, sourceUrl, name)).filter(Boolean).slice(0, 100) as SourceItem[];
  }

  const $ = cheerio.load(body);
  $("script, style, nav, footer, header, noscript, svg").remove();
  const items: SourceItem[] = [];
  const seen = new Set<string>();
  const keywords = /radovi|obustav|izmenjen režim|izmenjen rezim|saobraćaj|saobracaj|zastoj|nezgoda|zatvoren|protest|manifestacij|događaj|dogadjaj|upozorenje|sneg|magla|poplav|put|road|traffic|closure|works/i;

  $("a[href]").each((_, el) => {
    const title = clean($(el).text());
    const link = safeUrl(String($(el).attr("href") || ""), sourceUrl);
    if (title.length < 18 || !keywords.test(title) || seen.has(link) || link === sourceUrl) return;
    seen.add(link);
    items.push({
      title,
      link,
      description: title,
      publishedAt: null,
      sourceUrl,
      sourceName: name,
    });
  });

  // Do not convert a generic page visit into an incident. If no relevant entries
  // can be extracted, return zero items and let the collection log show that.
  return items.slice(0, 80);
}

export function dedupeKey(item: SourceItem) {
  return createHash("sha256").update(item.link || `${item.sourceUrl}|${item.title}`).digest("hex");
}
