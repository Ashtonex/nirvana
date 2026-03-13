# Repo Bug Audit (Static scan)

Date: 2026-03-12

## What was (and wasn't) run
- Node/npm are not available in this environment, so I could not re-run `npm run lint` or `npm run build` today.
- This audit is based on repo-wide static scans (ripgrep) + targeted review of API routes and auth.

## Legend
- 🟣 **Purple** = Critical
- 🟠 **Orange** = High/Medium
- 🟢 **Green** = Minor

---

## 🟣 Critical

1) **Hardcoded owner credentials + broken owner session validation**
- `app/api/owner/login/route.ts`: hardcoded `OWNER_EMAIL` + `OWNER_PASSWORD`; generated token is never persisted server-side.
- `lib/api-auth.ts`: `requireOwnerAccess` treats *presence* of `nirvana_owner` cookie as authenticated owner.
- `app/actions.ts`: treats `nirvana_owner` cookie as a “simple privileged session” and returns owner context without verifying token.
Impact: Anyone who can send a request with a `Cookie: nirvana_owner=anything` header can bypass protections that rely on this cookie.

2) **Unauthenticated service-role write endpoint** (`/api/sales/offline`)
- `app/api/sales/offline/route.ts`: uses `SUPABASE_SERVICE_ROLE_KEY` and performs inserts/updates with no auth gate.
Impact: remote attacker can write sales + trigger inventory decrements.

3) **Unauthenticated business data dashboard** (`/api/dashboard/realtime`)
- `app/api/dashboard/realtime/route.ts`: exposes today's sales, unread messages count, pending stock requests, and active staff counts with no auth gate.

4) **Unauthenticated settings mutation** (`/api/settings/update-tax`)
- `app/api/settings/update-tax/route.ts`: updates global tax settings via `updateGlobalSettings()` with no auth guard.

5) **Unauthenticated historical EOD report generator** (`/api/eod/historical`)
- `app/api/eod/historical/route.ts`: reads sales/ledger and sends email with no auth gate.

6) **Auth bypass via query param** (`/api/eod/pdf?test=true`)
- `app/api/eod/pdf/route.ts`: skips auth when `test=true`.

7) **Unauthenticated staff presence manipulation + data leak** (`/api/staff/status`)
- `app/api/staff/status/route.ts`: POST accepts `{ employeeId }` from request body (no auth) and updates `employees.last_active`.
- `app/api/staff/status/route.ts`: GET returns staff names + shop IDs.

8) **Unauthenticated AI/chat cost + data leakage risk** (`/api/chat`)
- `app/api/chat/route.ts`: no auth/rate limit; any caller can stream model output.
- `lib/ai-context.ts`: includes a live business snapshot in the system prompt.

9) **Mobile verification can target arbitrary employees when not logged in**
- `app/api/verify-mobile/route.ts` + `app/api/verify-mobile/confirm/route.ts`: only blocks mismatches if a staff cookie exists; when unauthenticated (`staffId` null) it allows acting on any `employeeId`.

10) **Security controls are feature-flagged off by default**
- `lib/api-auth.ts`: `NIRVANA_ENFORCE_API_AUTH` gates enforcement; when unset/false, routes that call `requireOwnerAccess()` allow access.
Impact: backups/test/notifications remain effectively public unless the env flag is enabled.

---

## 🟠 High/Medium

1) **False-success staff auth flows (missing Supabase error handling)**
- `app/api/staff/request/route.ts`: inserts login code but doesn't check the insert result; can return success even if DB insert fails.
- `app/api/staff/verify/route.ts`: inserts staff session but doesn't check insert result; can return success even if session wasn't created.

2) **Email matching inconsistency (case sensitivity)**
- `app/api/staff/login/route.ts` uses `.ilike('email', ...)`
- `app/api/staff/request/route.ts` + `app/api/staff/verify/route.ts` use `.eq('email', workEmail)`
Impact: auth flow breaks if casing differs.

3) **Admin nuke reports success even on partial failure**
- `app/api/admin/nuke/route.ts`: multiple `catch {}` / `.catch(() => undefined)` hide failures.

4) **`/api/auth/me` token usage looks incorrect/unreliable**
- `app/api/auth/me/route.ts` reads Supabase cookies but calls `supabaseAdmin.auth.getUser()` without passing a token.

5) **Weak default device PIN fallbacks**
- `app/api/staff/login/route.ts` falls back to `1234/5678/0000` when env pins are missing.

---

## 🟢 Minor

1) **`secure: true` cookies break local HTTP flows**
- `app/api/staff/verify/route.ts` and `app/api/staff/logout/route.ts` set `secure: true` instead of env-aware `NODE_ENV === 'production'`.

2) **Non-UUID identifiers may collide**
- Multiple routes generate IDs via `Math.random().toString(36)` (returns, stock requests, staff chat, untracked/offline sales).

3) **Dashboard active-staff metric quality**
- `app/api/dashboard/realtime/route.ts` uses `staff_sessions.created_at` for “online” rather than an activity heartbeat.
