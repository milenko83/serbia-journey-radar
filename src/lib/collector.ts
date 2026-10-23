import { getSupabase } from "./supabase";
import { getSourceUrls, fetchSourceItems, dedupeKey } from "./sources";
import { classify } from "./classify";
import { parseTitle, parseEnd, scoreIncident, smartKey } from "./parse";

type RunResult = {
  source: string;
  found: number;
  saved: number;
  status: string;
  error?: string;
};

export async function collectAll() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");

  // Close out runs that died mid-flight (e.g. serverless timeout) so they don't sit on "started" forever
  await supabase.from("collection_runs")
    .update({ status: "failed", finished_at: new Date().toISOString(), error_message: "Run did not finish (timeout?)" })
    .eq("status", "started")
    .lt("started_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());

  const results: RunResult[] = [];

  for (const sourceUrl of getSourceUrls()) {
    let runId: string | null = null;
    try {
      const run = await supabase.from("collection_runs")
        .insert({ source_url: sourceUrl, status: "started", started_at: new Date().toISOString() })
        .select("id").single();
      if (run.error) throw run.error;
      runId = run.data.id;

      const items = await fetchSourceItems(sourceUrl);
      const now = new Date().toISOString();
      const rows = new Map<string, Record<string, unknown>>(); // keyed by dedupe_key: no duplicates inside one upsert

      for (const item of items) {
        const classification = classify(item);
        const { startsOn, road, section } = parseTitle(item.title);
        const { score, reason } = scoreIncident(item.title, road, startsOn);
        const key = smartKey(road, section, startsOn) ?? dedupeKey(item);

        rows.set(key, {
          dedupe_key: key,
          title: item.title.slice(0, 300),
          summary: classification.summary,
          category: classification.category,
          severity: classification.severity,
          confidence: classification.confidence,
          // review_status and status are deliberately NOT sent:
          // DB defaults apply on insert, existing rows keep their review state on update.
          location_text: section ?? classification.locationText,
          region: classification.region,
          road,
          section_text: section,
          starts_at: startsOn ? `${startsOn}T00:00:00Z` : null,
          ends_at: parseEnd(item.description),
          priority_score: score,
          priority_reason: reason,
          published_at: item.publishedAt,
          source_name: item.sourceName,
          source_url: item.sourceUrl,
          source_item_url: item.link,
          source_excerpt: item.description.slice(0, 2000),
          last_seen_at: now,
          last_checked_at: now,
          updated_at: now,
        });
      }

      const batch = [...rows.values()];
      let saved = 0;
      if (batch.length) {
        const up = await supabase.from("incidents").upsert(batch, { onConflict: "dedupe_key" });
        if (up.error) throw up.error;
        saved = batch.length;

        // Bring back items that were auto-expired but reappeared (never touches dismissed items)
        await supabase.from("incidents")
          .update({ status: "active" })
          .in("dedupe_key", [...rows.keys()])
          .eq("status", "expired")
          .or(`ends_at.is.null,ends_at.gte.${now}`);
      }

      // Zero items is suspicious (layout change, JS-rendered page): flag it instead of calling it a clean success
      const status = items.length === 0 ? "empty" : "success";
      await supabase.from("collection_runs").update({
        status,
        finished_at: new Date().toISOString(),
        items_found: items.length,
        items_saved: saved,
        error_message: items.length === 0 ? "Source returned 0 items (layout change or JS-rendered page?)" : null,
      }).eq("id", runId);

      results.push({ source: sourceUrl, found: items.length, saved, status });
    } catch (e) {
      const error = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
      if (runId) await supabase.from("collection_runs").update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_message: error.slice(0, 1000),
      }).eq("id", runId);
      results.push({ source: sourceUrl, found: 0, saved: 0, status: "failed", error });
    }
  }

  // Expire stale items: end date passed, or not seen for 3 days
  const nowIso = new Date().toISOString();
  const staleIso = new Date(Date.now() - 3 * 86400000).toISOString();
  const oldStartIso = new Date(Date.now() - 2 * 86400000).toISOString();
  await supabase.from("incidents")
    .update({ status: "expired" })
    .eq("status", "active")
    // end date passed, OR not seen for 3 days, OR no end date but the start date is over 2 days old
    .or(`ends_at.lt.${nowIso},last_seen_at.lt.${staleIso},and(ends_at.is.null,starts_at.lt.${oldStartIso})`);

  return { completedAt: new Date().toISOString(), results };
}
