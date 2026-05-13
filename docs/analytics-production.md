# Analytics Production Runbook

Nirvana's Python analytics sidecar runs outside the POS request path. It reads Supabase, writes durable snapshots to `analytics_results`, and the Next.js app displays the latest successful snapshot.

## 1. Apply the migration

Run this SQL in Supabase SQL Editor or through your deployment migration flow:

```text
supabase/migrations/20260513_create_analytics_results.sql
```

## 2. Generate snapshots from the app

Go to `/intelligence` and use the **Run Analytics** card:

- **Full Snapshot** runs all analytics jobs.
- **Forecast** runs demand forecasting only.
- **Expenses** runs expense anomaly detection only.
- **Inventory** runs inventory velocity/dead-stock analysis only.
- **Capital** runs allocation advice for Inventory, Invest, Blackbox, Reserves, and Stockvel.

Each job reports whether it **Works** or **Needs Fix**. Successful jobs are saved into `analytics_results` and then shown in the **Analytics Pulse** card.

## 3. Terminal fallback

From the repo root:

```powershell
npm run analytics:snapshot
```

Individual jobs:

```powershell
npm run analytics:forecast:save
npm run analytics:expenses:save
npm run analytics:inventory:save
npm run analytics:capital:save
```

For custom research arguments, call Python directly:

```powershell
.venv\Scripts\python.exe -m analytics.nirvana_analytics.demand_forecast --days 30 --horizon 7
```

## 4. App integration

- `/api/analytics/latest` returns the latest snapshot for all analytics kinds.
- `/api/analytics/latest?kind=demand_forecast` returns one kind.
- `/api/analytics/run` runs one or all Python analytics jobs from the app.
- `/intelligence` renders the latest snapshots through `AnalyticsPulse`.

If a snapshot is missing, the app still works and shows a quiet empty state. POS, inventory writes, and operations posting do not depend on Python.

## 5. Suggested schedule

Start with once daily after close of business. Move to every 4-6 hours only after the output proves useful.
