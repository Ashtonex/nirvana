# Nirvana Architecture & Costing

This document breaks down (1) the system architecture, (2) component-by-component costs, (3) an estimated sale price, and (4) a leasing (monthly) price model.

All numbers are estimates in USD and will vary by region, usage, and support/SLA.

## 1) Architecture (what each piece does)

### Client (UI)
- Next.js App Router UI: POS, inventory, employees, reports, tax ledger, chat.
- Tailwind-based component UI (`components/ui`).

### Application Server
- Next.js server routes (`app/api/...`) and server actions (`app/actions.ts`).
- Business logic: shipments -> inventory lots, POS sales/quotes, transfers, EOD, chat, stock requests.

### Data
- Supabase Postgres: primary source of truth for employees, sales, inventory items, allocations, shipments, quotes, staff chat messages, stock requests, settings.
- Optional local JSON DB (`lib/db.json`) + backup endpoints exist; ideal for dev/demo or a single-box setup, not ideal for serverless.

### Authentication & Authorization
- Owner: Supabase Auth (email/password).
- Staff: custom login (work email + shop device PIN) -> cookie (`nirvana_staff`) -> `staff_sessions` table.
- Access gating:
  - Client routing gate: `components/AccessGate.tsx`.
  - Server-side route restriction (staff cookie) + optional basic auth outer gate: `middleware.ts`.

### Messaging
- SendGrid: transactional emails (EOD report, alerts). Optional depending on workflow.
- Twilio: SMS verification endpoints exist (optional; can be disabled if not used).

### Chat
- Universal room + store room via `staff_chat_messages` (`shop_id = 'universal'` for global).
- Stock requests stored in `stock_requests` and also broadcast into universal chat.

## 2) Ongoing costs (SaaS + infra)

Below are typical monthly costs. Choose the row that matches your usage.

### Assumptions for sizing
- Small: 3 shops, 5-15 users total, <= 10k pageviews/month, <= 5k DB writes/day.
- Medium: 5-15 shops, 20-80 users, <= 100k pageviews/month, <= 50k DB writes/day.
- Large: 20+ shops, 100+ users, heavier analytics and automation.

### Cost table (monthly)

| Component | What it covers | Small | Medium | Large |
|---|---|---:|---:|---:|
| Hosting (Next.js) | Vercel/Render/Fly; build + runtime | $0-$40 | $40-$200 | $200-$800+ |
| Database (Supabase) | Postgres + Auth + storage | $0-$25 | $25-$100 | $100-$500+ |
| Email (SendGrid) | EOD + alerts | $0-$20 | $20-$90 | $90-$300+ |
| SMS (Twilio) | Verification (optional) | $0-$30 | $30-$150 | $150-$500+ |
| Observability | error tracking, uptime, logs | $0-$20 | $20-$100 | $100-$400+ |
| Domain + SSL | custom domain | ~$1-$3 | ~$1-$3 | ~$1-$3 |
| Backups | automated DB backups | $0-$20 | $20-$80 | $80-$300+ |
| Total (est.) | excluding support | $0-$158 | $155-$723 | $721-$2803+ |

Notes:
- If you run on a single on-prem Windows box (LAN) with a static IP, hosting cost shifts to hardware + maintenance.
- Supabase pricing depends heavily on DB size, compute, and read/write volume.

## 3) Build cost (one-time implementation)

This is what it costs to deliver a production-ready, supportable version.

| Workstream | What you get | Est. effort | Cost (USD) |
|---|---|---:|---:|
| Product hardening | server-side auth model, rate limiting, RLS strategy | 3-7 days | $3,000-$12,000 |
| POS readiness | offline tolerance plan, receipts, printer hooks, edge cases | 3-10 days | $3,000-$18,000 |
| Data model cleanup | unify lots vs products, migrations, constraints | 3-10 days | $3,000-$20,000 |
| QA + test day | scripted test plan, fixes, regression | 2-6 days | $2,000-$10,000 |
| Deployment | CI/CD, env setup, secrets, backups | 1-3 days | $1,000-$5,000 |
| Total | typical delivery | 12-36 days | $12,000-$65,000 |

If you want enterprise-grade controls (SOC2-ish posture, audit trails, approvals, immutable logs), add $25k-$150k depending on scope.

## 4) What the system should sell for (outright)

There are two common ways to price a retail ops system:

### A) Cost-plus (implementation-led)
- Sale price = build cost + risk margin + 6-18 months of maintenance value.
- Typical: $25,000 to $150,000 for a custom multi-shop POS + ops suite.

### B) Value-based (revenue + operational impact)
- If the system improves margin, reduces shrinkage, and centralizes control, pricing is usually anchored to the value (not dev hours).
- Typical: 0.25% to 1.5% of annual revenue influenced by the system, capped for SMB.

### Recommended sale price (for this product stage)
- SMB (3 shops, early rollout): $35,000 to $85,000.
- Growing (10+ shops, needs SLAs + strict controls): $85,000 to $250,000.

## 5) Leasing / subscription (monthly)

Leasing should cover:
1) your infra pass-through,
2) your support + maintenance,
3) a margin,
4) the fact that you keep ownership of the IP.

### Recommended subscription model

Base fee + per-shop + per-active-staff (simple and scalable):
- Base platform: $299-$699 / month
- Per shop: $99-$249 / month
- Per active staff: $5-$15 / month

Example (your current footprint: 3 shops, ~12 staff active):
- Base: $499
- Shops: 3 x $149 = $447
- Staff: 12 x $9 = $108
- Subtotal: $1,054/month
- Add support tier (below): +$0 to +$1,500/month

### Support tiers (add-ons)
- Standard: $0 (email only, best-effort, next-business-day)
- Business: $500-$1,000 (priority, same-day on weekdays)
- Critical: $1,500-$5,000 (SLA, on-call, weekend coverage)

### Quick “all-in” lease price guidance
- Small (3 shops): $900 to $2,500/month
- Medium (10 shops): $2,500 to $7,500/month
- Large (20+ shops): $7,500 to $25,000/month

## 6) What changes pricing the most

- Number of shops (multi-tenant needs, data isolation, reporting)
- POS hardware integrations (receipt printers, barcode scanners, cash drawers)
- Offline-first requirements
- Compliance/audit requirements
- Support SLAs
- Data migration from legacy systems

## 7) What I’d recommend for your test-day setup

- Use the optional outer gate (`middleware.ts`) during the test day if you’re on a public URL.
- Keep Twilio verification disabled if not needed (reduces abuse surface and cost).
- Use SendGrid only for EOD + critical alerts.
