import { getSupabase } from "./supabase";
import { getSourceUrls, fetchSourceItems, dedupeKey } from "./sources";
import { classify } from "./classify";

export async function collectAll() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");

  const results: { source: string; found: number; saved: number; status: string; error?: string }[] = [];
  for (const sourceUrl of getSourceUrls()) {
    const startedAt = new Date().toISOString();
    let runId: string | null = null;
    try {
      const run = await supabase.from("collection_runs").insert({ source_url: sourceUrl, status: "started", started_at: startedAt }).select("id").single();
      if (run.error) throw run.error;
      runId = run.data.id;
      const items = await fetchSourceItems(sourceUrl);
      let saved = 0;
      for (const item of items) {
        const classification = classify(item);
        const key = dedupeKey(item);
        const row = {
          dedupe_key: key,
          title: item.title.slice(0, 300),
          summary: classification.summary,
          category: classification.category,
          severity: classification.severity,
          confidence: classification.confidence,
          review_status: "needs_review",
          location_text: classification.locationText,
          region: classification.region,
          published_at: item.publishedAt,
          source_name: item.sourceName,
          source_url: item.sourceUrl,
          source_item_url: item.link,
          source_excerpt: item.description.slice(0, 2000),
          last_seen_at: new Date().toISOString(),
          last_checked_at: new Date().toISOString(),
          status: "active",
          updated_at: new Date().toISOString(),
        };
        const upsert = await supabase.from("incidents").upsert(row, { onConflict: "dedupe_key" });
        if (!upsert.error) saved++;
      }
      await supabase.from("collection_runs").update({
        status: "success", finished_at: new Date().toISOString(), items_found: items.length, items_saved: saved,
      }).eq("id", runId);
      results.push({ source: sourceUrl, found: items.length, saved, status: "success" });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      if (runId) await supabase.from("collection_runs").update({
        status: "failed", finished_at: new Date().toISOString(), error_message: error.slice(0, 1000),
      }).eq("id", runId);
      results.push({ source: sourceUrl, found: 0, saved: 0, status: "failed", error });
    }
  }
  return { completedAt: new Date().toISOString(), results };
}
