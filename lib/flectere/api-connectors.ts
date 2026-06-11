import type { ApiConnectorConfig, ConnectorMetric } from "./types";

const STORAGE_KEY = "flectere_connectors";

export function loadConnectors(): ApiConnectorConfig[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveConnectors(list: ApiConnectorConfig[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function getDefaultConnectors(): ApiConnectorConfig[] {
  return [
    {
      id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
      name: "Shopify Store",
      baseUrl: "",
      endpoint: "/admin/api/2024-01/orders.json",
      method: "GET",
      authType: "bearer",
      refreshIntervalMs: 300000,
      enabled: false,
    },
    {
      id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
      name: "PayPal Payouts",
      baseUrl: "https://api-m.paypal.com",
      endpoint: "/v1/reporting/transactions",
      method: "POST",
      authType: "bearer",
      refreshIntervalMs: 600000,
      enabled: false,
    },
    {
      id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
      name: "Custom REST API",
      baseUrl: "",
      endpoint: "/api/data",
      method: "GET",
      authType: "api-key",
      apiKeyHeader: "X-API-Key",
      refreshIntervalMs: 300000,
      enabled: false,
    },
  ];
}

export function fetchConnectorData(
  config: ApiConnectorConfig,
  signal?: AbortSignal
): Promise<{ data: any; metrics: ConnectorMetric[]; error?: string }> {
  const url = `${config.baseUrl.replace(/\/$/, "")}${config.endpoint}`;
  const headers: Record<string, string> = { ...(config.headers || {}) };

  if (config.authType === "bearer" && config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  } else if (config.authType === "api-key" && config.apiKey && config.apiKeyHeader) {
    headers[config.apiKeyHeader] = config.apiKey;
  } else if (config.authType === "basic" && config.apiKey) {
    headers["Authorization"] = `Basic ${btoa(config.apiKey)}`;
  }
  if (config.method === "POST") {
    headers["Content-Type"] = "application/json";
  }

  const init: RequestInit = { method: config.method, headers, signal };
  if (config.method === "POST" && config.body) {
    init.body = config.body;
  }

  return fetch(url, init)
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      const json = await res.json();
      const metrics = extractMetrics(json, config.name);
      return { data: json, metrics };
    })
    .catch((err: Error) => ({
      data: null,
      metrics: [],
      error: err.message,
    }));
}

function extractMetrics(raw: any, connectorName: string): ConnectorMetric[] {
  const metrics: ConnectorMetric[] = [];
  const timestamp = new Date().toISOString();

  if (typeof raw !== "object" || raw === null) return metrics;

  if (Array.isArray(raw)) {
    metrics.push({
      connectorId: connectorName,
      connectorName,
      label: "Records",
      value: raw.length,
      unit: "rows",
      fetchedAt: timestamp,
    });
    return metrics;
  }

  for (const [key, val] of Object.entries(raw)) {
    if (typeof val === "number") {
      const label = key
        .replace(/([A-Z])/g, " $1")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
      metrics.push({
        connectorId: connectorName,
        connectorName,
        label: label.slice(0, 30),
        value: typeof val === "number" && val % 1 !== 0 ? Number(val.toFixed(2)) : val,
        unit: key.toLowerCase().includes("amount") || key.toLowerCase().includes("price") || key.toLowerCase().includes("revenue") ? "$" : "",
        fetchedAt: timestamp,
      });
    }
    if (Array.isArray(val) && metrics.length < 5) {
      metrics.push({
        connectorId: connectorName,
        connectorName,
        label: `${key} entries`,
        value: val.length,
        unit: "items",
        fetchedAt: timestamp,
      });
    }
  }

  return metrics.slice(0, 8);
}
