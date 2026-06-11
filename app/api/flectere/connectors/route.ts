import { NextRequest, NextResponse } from "next/server";
import type { ApiConnectorConfig, ConnectorMetric } from "@/lib/flectere/types";
import { fetchConnectorData } from "@/lib/flectere/api-connectors";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const configs: ApiConnectorConfig[] = body.connectors;

    if (!Array.isArray(configs) || configs.length === 0) {
      return NextResponse.json({ metrics: [] });
    }

    const enabled = configs.filter((c) => c.enabled && c.baseUrl);
    if (enabled.length === 0) {
      return NextResponse.json({ metrics: [] });
    }

    const results = await Promise.allSettled(
      enabled.map((c) => fetchConnectorData(c))
    );

    const allMetrics: (ConnectorMetric & { connectorName: string })[] = [];
    const updatedConfigs = [...configs];

    results.forEach((result, i) => {
      const config = enabled[i];
      const idx = configs.findIndex((c) => c.id === config.id);

      if (result.status === "fulfilled") {
        const { metrics, error } = result.value;
        allMetrics.push(...metrics.map((m) => ({ ...m, connectorName: config.name })));
        if (idx >= 0) {
          updatedConfigs[idx] = {
            ...updatedConfigs[idx],
            lastFetched: new Date().toISOString(),
            lastData: result.value.data,
            lastError: error || undefined,
          };
        }
      } else {
        if (idx >= 0) {
          updatedConfigs[idx] = {
            ...updatedConfigs[idx],
            lastFetched: new Date().toISOString(),
            lastError: result.reason?.message || "Unknown error",
          };
        }
      }
    });

    return NextResponse.json({ metrics: allMetrics, connectors: updatedConfigs });
  } catch (err) {
    console.error("[Flectere Connectors] Error:", err);
    return NextResponse.json({ metrics: [], connectors: [] }, { status: 500 });
  }
}
