import { getSupabase } from "@/lib/supabase";
import type { Incident } from "@/lib/types";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = getSupabase();
  let incidents: Incident[] = [];
  let lastRun: { finished_at: string | null; status: string; source_url: string } | null = null;
  let dbError = "";

  if (!supabase) {
    dbError = "Database is not configured yet. Add the Supabase URL and service-role key to your environment variables, then redeploy.";
  } else {
    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from("incidents")
      .select("*")
      .eq("status", "active")                          // hide dismissed and expired items
      .neq("review_status", "not_relevant")            // hide items marked not relevant
      .or(`ends_at.is.null,ends_at.gte.${nowIso}`)     // hide items whose end date has passed
      .order("priority_score", { ascending: false })   // most important first
      .order("starts_at", { ascending: false, nullsFirst: false })
      .order("last_seen_at", { ascending: false })
      .limit(150);
    if (error) dbError = `Could not read incidents: ${error.message}`;
    else incidents = (data || []) as Incident[];

    const { data: runData } = await supabase
      .from("collection_runs")
      .select("finished_at,status,source_url")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    lastRun = runData;
  }

  return <Dashboard incidents={incidents} dbError={dbError} lastRun={lastRun} />;
}
