"use client";

import { useMemo, useState } from "react";
import type { Incident, Category } from "@/lib/types";

const categories: { value: string; label: string }[] = [
  { value: "all", label: "All categories" },
  { value: "roadworks", label: "Roadworks" },
  { value: "traffic", label: "Traffic incidents" },
  { value: "event", label: "Events & protests" },
  { value: "weather", label: "Weather" },
  { value: "station", label: "Station access" },
  { value: "other", label: "Other" },
];

const labels: Record<string, string> = {
  roadworks: "Roadworks", traffic: "Traffic", event: "Event", weather: "Weather", station: "Station", other: "Other",
};
const severityLabel: Record<string, string> = {
  critical: "Critical", high: "High priority", monitor: "Monitor", information: "Information",
};
const runStatusLabel: Record<string, string> = {
  success: "success",
  empty: "empty (source returned 0 items)",
  failed: "failed",
  started: "in progress",
};

// Items with this score or higher count as "Priority review"
const PRIORITY_THRESHOLD = 3;

// Date AND time, in Belgrade time (used for collection timestamps)
function dateLabel(value: string | null) {
  if (!value) return "Time not specified";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Time not specified" : date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Belgrade" });
}

// Date only. Announcement dates are stored as midnight UTC, so they are formatted in UTC
// to avoid shifting them to "02:00" Belgrade time.
function dayLabel(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("en-GB", { dateStyle: "medium", timeZone: "UTC" });
}

function periodLabel(start: string | null, end: string | null, published: string | null) {
  const from = dayLabel(start) ?? dayLabel(published);
  const to = dayLabel(end);
  if (from && to && from !== to) return `${from} – ${to}`;
  if (from && to) return `${from} (ends the same day)`;
  if (from) return `${from} · end date not stated`;
  return "Time not specified";
}

function timeAgo(value: string | null) {
  if (!value) return "Not reported";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not reported";
  const hours = Math.max(0, Math.floor((Date.now() - date.getTime()) / 3600000));
  return hours < 1 ? "Less than 1 hour ago" : hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

export default function Dashboard({ incidents, dbError, lastRun }: {
  incidents: Incident[];
  dbError: string;
  lastRun: { finished_at: string | null; status: string; source_url: string } | null;
}) {
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [review, setReview] = useState("all");

  const filtered = useMemo(() => incidents.filter(item => {
    const matchesCategory = category === "all" || item.category === category;
    const search = `${item.title} ${item.summary} ${item.region || ""} ${item.location_text || ""} ${item.road || ""} ${item.source_name}`.toLowerCase();
    const matchesQuery = search.includes(query.toLowerCase());
    const matchesReview = review === "all" || item.review_status === review;
    return matchesCategory && matchesQuery && matchesReview;
  }), [incidents, category, query, review]);

  const isPriority = (i: Incident) =>
    i.severity === "critical" || i.severity === "high" || (i.priority_score ?? 0) >= PRIORITY_THRESHOLD;

  const counts = {
    total: incidents.length,
    urgent: incidents.filter(isPriority).length,
    review: incidents.filter(i => i.review_status === "needs_review").length,
    sources: new Set(incidents.map(i => i.source_name)).size,
  };

  return <main className="shell">
    <header className="topbar">
      <div className="brand">
        <div className="logo">⌁</div>
        <div><h1>Serbia Journey Radar</h1><div className="sub">Transport disruption intelligence</div></div>
      </div>
      <div className="top-actions">
        <span className="pill">SERBIA · NATIONAL COVERAGE</span>
        <span className="pill">Daily briefing</span>
      </div>
    </header>

    <section className="hero">
      <div>
        <div className="eyebrow">Operational awareness · Public-source monitoring</div>
        <h1>Know what could disrupt the journey.</h1>
        <p>One place to review roadworks, traffic incidents, public events, and weather warnings across Serbia. Every item links back to its source; potential impacts must be verified before operational action.</p>
      </div>
      <span className="pill">Last collection: {lastRun?.finished_at ? dateLabel(lastRun.finished_at) : "Not run yet"}</span>
    </section>

    {dbError && <div className="error">{dbError}</div>}

    <section className="stats">
      <div className="stat"><div className="stat-label">Collected records</div><div className="stat-value">{counts.total}</div><div className="stat-note">Active candidate items</div></div>
      <div className="stat"><div className="stat-label">Priority review</div><div className="stat-value">{counts.urgent}</div><div className="stat-note">Rule-based priority, not confirmed impact</div></div>
      <div className="stat"><div className="stat-label">Needs verification</div><div className="stat-value">{counts.review}</div><div className="stat-note">Manual review recommended</div></div>
      <div className="stat"><div className="stat-label">Sources represented</div><div className="stat-value">{counts.sources}</div><div className="stat-note">Sources with stored records</div></div>
    </section>

    <div className="layout">
      <section className="panel">
        <div className="panel-head"><h2>Disruption feed</h2><small>{filtered.length} records</small></div>
        <div className="filters">
          <select value={category} onChange={e => setCategory(e.target.value)} aria-label="Filter by category">
            {categories.map(c => <option value={c.value} key={c.value}>{c.label}</option>)}
          </select>
          <select value={review} onChange={e => setReview(e.target.value)} aria-label="Filter by verification status">
            <option value="all">All review statuses</option>
            <option value="needs_review">Needs review</option>
            <option value="verified">Verified</option>
          </select>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search title, place, road, source…" aria-label="Search incidents"/>
        </div>

        <div className="incidents">
          {filtered.length === 0 ? <div className="empty"><strong>No records match these filters.</strong>{incidents.length === 0 ? "No active disruptions are stored right now. This dashboard will not fabricate incidents." : "Try another category or search term."}</div> :
            filtered.map(item => <article className="incident" key={item.id}>
              <div className="incident-top">
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <span className={`tag ${item.severity}`}>{severityLabel[item.severity] || item.severity}</span>
                  {(item.priority_score ?? 0) >= PRIORITY_THRESHOLD && <span className="tag high">Priority {item.priority_score}</span>}
                  <span className={`tag ${item.category}`}>{labels[item.category] || item.category}</span>
                  <span className="tag information">{item.review_status === "verified" ? "Verified" : "Needs review"}</span>
                </div>
                <span style={{fontSize:11,color:"var(--muted)"}}>{timeAgo(item.last_seen_at)}</span>
              </div>
              <h3>{item.title}</h3>
              <p>{item.summary}</p>
              <div className="meta">
                <span>📍 {item.location_text || item.region || "Location not extracted"}</span>
                {item.road && <span>🛣 {item.road}</span>}
                <span>🕒 {periodLabel(item.starts_at, item.ends_at, item.published_at)}</span>
                <span>Source: {item.source_name}</span>
              </div>
              {item.priority_reason && <div style={{fontSize:11,color:"var(--muted)",marginTop:6}}>Why prioritised: {item.priority_reason}</div>}
              <a className="source-link" href={item.source_item_url} target="_blank" rel="noreferrer">Open original source ↗</a>
            </article>)
          }
        </div>
      </section>

      <aside>
        <section className="panel">
          <div className="panel-head"><h2>Daily briefing</h2><small>Current records</small></div>
          <div className="notice">This is a public-information monitor, not a live navigation system. It does not yet match incidents to Flix routes or calculate delay minutes.</div>
          <div style={{marginTop:15}}>
            <h3 style={{fontSize:13,marginBottom:8}}>What to review first</h3>
            <p style={{fontSize:12,color:"var(--muted)",lineHeight:1.6}}>1. High-priority restrictions and closures<br/>2. Incidents with dates overlapping today's travel<br/>3. Records with missing end dates or unclear locations<br/>4. Items that need confirmation from the original publisher</p>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head"><h2>Monitored sources</h2><small>Starting set</small></div>
          <div className="source-row"><strong>Putevi Srbije</strong><span>State road conditions and restrictions (collected)</span><br/><a href="https://www.putevi-srbije.rs/" target="_blank" rel="noreferrer">Open official website ↗</a></div>
          <div className="source-row"><strong>AMSS</strong><span>Road conditions and traffic reports (not collected: blocks automated access)</span><br/><a href="https://www.amss.org.rs/" target="_blank" rel="noreferrer">Open official website ↗</a></div>
          <div className="source-row"><strong>RHMZ</strong><span>Weather forecasts and warnings (not collected yet)</span><br/><a href="https://www.hidmet.gov.rs/" target="_blank" rel="noreferrer">Open official website ↗</a></div>
          <p style={{fontSize:11,color:"var(--muted)",lineHeight:1.55,marginTop:13}}>Collection coverage depends on what each source exposes to automated access. A source listed here is not proof that every page is successfully ingested.</p>
        </section>

        <section className="panel">
          <div className="panel-head"><h2>Collection status</h2></div>
          <p style={{fontSize:12,color:"var(--muted)",lineHeight:1.7}}>Last run: {lastRun?.finished_at ? dateLabel(lastRun.finished_at) : "No completed run"}<br/>Latest source status: {lastRun ? (runStatusLabel[lastRun.status] || lastRun.status) : "Not available"}<br/>New records remain marked for review until verified.</p>
        </section>
      </aside>
    </div>

    <footer className="footer">Serbia Journey Radar · MVP v0.1 · Public-source information only. Verify current restrictions with the original publisher before making operational decisions. No route-specific impacts or delay estimates are asserted.</footer>
  </main>;
}

