# Repo Bug Audit (static + runtime checks)

Date: 2026-03-12
Scope: Whole repository via automated checks (`npm run lint`, `npm run build`) plus targeted API and UI code review.

## Legend
- 🟣 **Purple** = Critical
- 🟢 **Green** = Minor
- **Breaks functionality?** = whether it can directly break normal product behavior (not just code quality/security posture).

## Bugs grouped by severity color

| Color | Bug | Evidence | Breaks functionality? |
|---|---|---|---|
| 🟣 | **Backup APIs are unauthenticated** (`/api/backups`, `/api/backups/download`, `/api/backups/restore`). Any caller can enumerate backups, download data, and restore old backups. | No auth checks in handlers before file operations. | **Yes** (restore can overwrite production data). |
| 🟣 | **Internal test endpoint can mutate production-like data** when `NIRVANA_ENABLE_INTERNAL_TESTS=true`, and has no auth gate. | `/api/test` runs `updateGlobalExpenses`, `processShipment`, `recordSale`, `transferInventory` in `GET` flow. | **Yes** (writes inventory/sales data). |
| 🟣 | **Staff login-code request ignores DB insert/send failures** and can report success incorrectly. | `/api/staff/request` does `insert` and `sendEmail` without checking insert response; exceptions only from `sendEmail`. | **Yes** (user may never receive a valid login path but API can still report success in partial-failure scenarios). |
| 🟣 | **Staff verify ignores session insert failure** and still returns `{ success: true }`. | `/api/staff/verify` inserts into `staff_sessions` without checking `error`, then responds success. | **Yes** (user can be told login worked while session was not persisted). |
| 🟣 | **Nuke endpoint suppresses delete errors and still reports success** causing partial wipes with false success state. | Multiple `catch {}` / `.catch(() => undefined)` around destructive operations in `/api/admin/nuke`. | **Yes** (system can end in inconsistent partially-deleted state). |
| 🟣 | **Notification APIs are unauthenticated** (`/api/notifications`, `/api/notifications/[id]`). Data disclosure and arbitrary read-state mutation possible. | `employeeId` accepted from query/route only; no identity check. | **No direct runtime crash**, but severe security/data-integrity impact. |
| 🟢 | **Email matching inconsistency across staff auth routes**: `login` uses case-insensitive `ilike`, but `request`/`verify` use case-sensitive `.eq("email", workEmail)`. | Route query differences across `staff/login`, `staff/request`, `staff/verify`. | **Yes** for users entering different casing (auth flow fails unexpectedly). |
| 🟢 | **`secure: true` cookie in staff verify path can break local HTTP login** while staff login path correctly uses env-aware secure flag. | `/api/staff/verify` sets cookie with `secure: true`; `/api/staff/login` uses `process.env.NODE_ENV === "production"`. | **Yes** in non-HTTPS dev/staging environments. |
| 🟢 | **Realtime dashboard “active staff” logic can undercount active users.** It uses `staff_sessions.created_at` (session creation time) rather than activity heartbeat. | `/api/dashboard/realtime` computes online users from sessions created in last 5 minutes. | **No** (metric quality bug; dashboard inaccuracy). |
| 🟢 | **Potential chat schema mismatch in notifications payload mapping**: notifications map `m.content` while chat creation and UI use `message`. | `/api/notifications` selects `content`; chat UI inserts/reads `message`. | **No hard crash guaranteed**, but can produce blank/incorrect notification bodies depending on DB schema. |

## Automated checks run

- `npm run lint` → failed with **467 errors** + **168 warnings** (many `no-explicit-any`, some import/style issues).
- `npm run build` → failed in this environment because Next.js font fetch to Google Fonts (`Inter`) could not be reached.

