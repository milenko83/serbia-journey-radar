export type Category = "roadworks" | "traffic" | "event" | "weather" | "station" | "other";
export type Severity = "critical" | "high" | "monitor" | "information";
export type Confidence = "high" | "medium" | "low";

export type Incident = {
  id: string;
  title: string;
  summary: string;
  category: Category;
  severity: Severity;
  confidence: Confidence;
  review_status: string;
  location_text: string | null;
  region: string | null;
  starts_at: string | null;
  ends_at: string | null;
  published_at: string | null;
  source_name: string;
  source_url: string;
  source_item_url: string;
  source_excerpt: string | null;
  first_seen_at: string;
  last_seen_at: string;
  last_checked_at: string;
  status: string;
};
