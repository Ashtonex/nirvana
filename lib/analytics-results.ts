import { supabaseAdmin } from "@/lib/supabase";

export type AnalyticsKind = "demand_forecast" | "expense_anomaly" | "inventory_velocity" | "capital_allocation";

export type AnalyticsResult = {
  id: string;
  kind: AnalyticsKind | string;
  status: "success" | "warning" | "error" | string;
  generated_at: string;
  summary: string | null;
  payload: any;
  created_at: string;
};

export const ANALYTICS_KINDS: AnalyticsKind[] = [
  "demand_forecast",
  "expense_anomaly",
  "inventory_velocity",
  "capital_allocation",
];

export async function getLatestAnalyticsResults(kinds: string[] = ANALYTICS_KINDS) {
  const results: Record<string, AnalyticsResult | null> = {};
  await Promise.all(
    kinds.map(async (kind) => {
      try {
        const { data, error } = await supabaseAdmin
          .from("analytics_results")
          .select("id, kind, status, generated_at, summary, payload, created_at")
          .eq("kind", kind)
          .order("generated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          results[kind] = null;
          return;
        }
        results[kind] = data as AnalyticsResult | null;
      } catch {
        results[kind] = null;
      }
    })
  );
  return results;
}

export function getAnalyticsFreshness(result: AnalyticsResult | null) {
  if (!result?.generated_at) return "No snapshot yet";
  const generated = new Date(result.generated_at).getTime();
  if (!Number.isFinite(generated)) return "Snapshot date unknown";
  const hours = Math.max(0, Math.round((Date.now() - generated) / (1000 * 60 * 60)));
  if (hours < 1) return "Updated less than 1h ago";
  if (hours < 24) return `Updated ${hours}h ago`;
  return `Updated ${Math.round(hours / 24)}d ago`;
}
