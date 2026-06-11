export interface ApiConnectorConfig {
  id: string;
  name: string;
  baseUrl: string;
  endpoint: string;
  method: "GET" | "POST";
  authType: "none" | "api-key" | "bearer" | "basic";
  apiKey?: string;
  apiKeyHeader?: string;
  headers?: Record<string, string>;
  body?: string;
  refreshIntervalMs: number;
  enabled: boolean;
  lastFetched?: string;
  lastData?: any;
  lastError?: string;
}

export interface ConnectorMetric {
  connectorId: string;
  connectorName: string;
  label: string;
  value: string | number;
  change?: string;
  changeDirection?: "up" | "down" | "flat";
  unit?: string;
  fetchedAt: string;
}

export interface AiInsight {
  id: string;
  category: "sales" | "inventory" | "finance" | "operations" | "external";
  title: string;
  body: string;
  severity: "positive" | "warning" | "critical" | "info";
  metric?: { label: string; value: string };
  action?: string;
}

export interface DashboardFilters {
  dateRange: [string, string];
  shops: string[];
}

export const ALL_SHOP_IDS = ["kipasa", "dubdub", "tradecenter", "tshirts"] as const;
export type ShopId = (typeof ALL_SHOP_IDS)[number];

export const SHOP_LABELS: Record<string, string> = {
  kipasa: "Kipasa",
  dubdub: "Dub Dub",
  tradecenter: "Trade Center",
  tshirts: "Nirvana Tees",
};
