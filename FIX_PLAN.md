# Safe Fix Plan (Minimal Breakage)

This plan focuses on fixing the critical bugs with guardrails so production behavior stays stable.

## 0) Rollout guardrails (do this first)
- Create feature flags for risky behavior changes:
  - `NIRVANA_ENFORCE_API_AUTH=true`
  - `NIRVANA_HARD_FAIL_AUTH_FLOW=true`
- Deploy behind flags OFF first, then enable per environment (dev -> staging -> prod).
- Add structured logs + alerts for 4xx/5xx on auth and backup routes.

## 1) Lock down dangerous endpoints (Critical)
### Endpoints
- `/api/backups`
- `/api/backups/download`
- `/api/backups/restore`
- `/api/test`
- `/api/notifications`
- `/api/notifications/[id]`

### Safe fix
1. Reuse owner/session auth middleware used by admin routes.
2. Require owner role for backup + restore + internal test routes.
3. For notifications, derive employee ID from authenticated session, **never** query param.
4. Return 401/403 for unauthorized access.

### Why this is safe
- It only narrows access; no schema changes.
- Can be feature-flagged and tested in staging with known owner accounts.

## 2) Fix false-success auth flows (Critical)
### Problems
- `staff/request`: no check on `staff_login_codes.insert` result.
- `staff/verify`: no check on `staff_sessions.insert` result.

### Safe fix
1. After each DB write, check `{ error }` and return 500 with stable error payload.
2. Only return `{ success: true }` after all required writes succeed.
3. If email send fails, optionally delete inserted login code (best effort) to avoid orphaned valid codes.

### Why this is safe
- Preserves API contracts; only changes incorrect success behavior.

## 3) Make admin nuke deterministic (Critical)
### Problem
- Suppressed delete failures produce partial wipes with success response.

### Safe fix
1. Collect per-table results into an array.
2. Return `207 Multi-Status` or `500` when any required table fails.
3. Add `dryRun=true` mode to report what would be deleted.
4. Keep current delete order, but stop swallowing errors silently.

### Why this is safe
- Improves observability and prevents false confidence.
- `dryRun` allows validation before actual destruction.

## 4) Clean minor functional issues
### 4.1 Email matching consistency
- Normalize `workEmail` with `trim().toLowerCase()` in `request` and `verify`, matching `login`.

### 4.2 Cookie security parity
- Use `secure: process.env.NODE_ENV === "production"` in `verify` route, same as `login`.

### 4.3 Notification/chat field mismatch
- Standardize on one column (`message` or `content`) across writer and reader.
- Add compatibility fallback during migration (`body: m.message ?? m.content`).

### 4.4 Realtime active staff metric quality
- Use session `last_seen_at` heartbeat (or equivalent) instead of `created_at`.

## 5) Testing matrix (before enabling flags)
1. Unauthorized users cannot access backup/test endpoints.
2. Authorized owner can list/download/restore backups.
3. Staff request/verify fail loudly on DB write failures.
4. verify cookie works on local HTTP and production HTTPS.
5. Notifications only return current user data.
6. Nuke dry-run output matches expected delete targets.

## 6) Suggested implementation order
1. Add auth middleware helpers.
2. Protect endpoints.
3. Fix auth flow error handling.
4. Fix nuke reporting/dry-run.
5. Minor cleanup (email/cookie/field mismatch/metric).
6. Enable flags progressively.

