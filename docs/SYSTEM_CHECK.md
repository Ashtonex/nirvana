# System Check & Runbook

Purpose
- Provide a concise, reproducible set of diagnostics and triage steps for the Nirvana system so another engineer or operator can inspect, diagnose, and fix common problems (operations deposits, cash drift, staff chat/session issues, Supabase connectivity).

Owner / Access
- The most useful checks require an owner or admin account and access to the server running the app and the Postgres database (Supabase). Do not share credentials.

Quick owner-only diagnostics (API)
- Endpoint: GET `/api/hand/system-check` (owner-only)
  - Returns: `onlineStaff`, `staffChat`, `globalChat`, `recentOperations`, `recentDeposits`, `drifts`, `staffLogs`, `employeeMap`.
  - Usage (browser): sign in as owner and open `/api/hand/system-check`.
  - Usage (curl):

    ```bash
    curl -s -H "Cookie: nirvana_owner=<OWNER_COOKIE>" https://<your-host>/api/hand/system-check | jq .
    ```

  - Interpretation:
    - `onlineStaff`: who has recent `staff_sessions` (active / recently connected)
    - `staffChat`: per-shop chat streams; see sender ids and mapped employees
    - `recentOperations` / `recentDeposits`: last ledger rows to trace deposits
    - `drifts`: recent rationalize / drift logging
    - `staffLogs`: login/verify events useful for tracing logins and token issues

Local host diagnostics (Windows PowerShell)
- Run these on the host where the app runs to gather hardware and service info.
- Short checklist + commands:

  1) OS / Uptime / Basic system info

    ```powershell
    systeminfo
    Get-CimInstance Win32_OperatingSystem | Select-Object LastBootUpTime,Version,BuildNumber
    ```

  2) CPU / Memory / BIOS

    ```powershell
    Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors
    Get-CimInstance Win32_PhysicalMemory | Select-Object DeviceLocator,Manufacturer,Capacity,Speed
    Get-CimInstance Win32_BIOS | Select-Object Manufacturer,SMBIOSBIOSVersion,ReleaseDate
    ```

  3) Disk & Storage

    ```powershell
    Get-PhysicalDisk | Select FriendlyName,Size,MediaType
    Get-Volume | Select DriveLetter,FileSystemLabel,SizeRemaining,Size
    wmic logicaldisk get caption,size,freespace
    ```

  4) Network adapters & connectivity

    ```powershell
    Get-NetAdapter | Select Name,Status,LinkSpeed
    Test-NetConnection -ComputerName db.host.example -Port 5432
    ```

  5) Running processes / services (Node / Next / Docker / supabase proxy)

    ```powershell
    Get-Process -Name node -ErrorAction SilentlyContinue
    Get-Service | Where-Object {$_.Status -eq 'Running'} | Select -First 50
    docker version  # if using docker
    ```

Application-level checks (repo + runtime)
- Node / package manager versions

  ```bash
  node -v
  npm -v
  pnpm -v  # if used
  ```

- Environment variables (server) — ensure required keys present (Supabase service key, NEXT_PUBLIC_* env used for client). Inspect `.env` or deployment secrets.

- Next.js process logs
  - On the host, find and tail the Next.js stdout / pm2 / systemd logs. Example:

    ```powershell
    # if running via `npm run start` in a shell, view that terminal's output
    # if using pm2
    pm2 status
    pm2 logs --lines 200
    ```

Database & Supabase checks
- Quick SQL to list recent ledger entries and problematic kinds:

  ```sql
  -- Last 200 operations
  SELECT id, shop_id, amount, kind, title, employee_id, created_at
  FROM operations_ledger
  ORDER BY created_at DESC
  LIMIT 200;

  -- Recent positive deposits grouped by kind
  SELECT kind, count(*) AS cnt, sum(amount) AS total
  FROM operations_ledger
  WHERE amount > 0
  GROUP BY kind
  ORDER BY total DESC;
  ```

- Check `get_operations_computed_balance` RPC behaviour by running the RPC and comparing to aggregation of ledger rows.

Reproducing the "deposit rejected" flow
- Steps to reproduce as staff (shop-level):
  1) Sign in as a shop staff (`nirvana_staff` cookie). 2) From POS trigger EOD deposit flow (or call API):

    ```bash
    curl -X POST -H "Content-Type: application/json" -H "Cookie: nirvana_staff=<STAFF_COOKIE>" \
      -d '{"amount":100.00,"shopId":"shop_xyz","kind":"eod_deposit","title":"EOD deposit"}' \
      https://<your-host>/api/operations/ledger
    ```

  3) Verify the response. If 401/403, inspect `staff_sessions` and the `requireStaffActor` implementation.

Common issues & fixes
- Deposits rejected for staff:
  - Cause: staff session missing or expired; `nirvana_staff` cookie not present or token_hash not found in `staff_sessions`.
  - Fix: ensure the staff session exists, refresh login, or re-create session. Check `app/api/staff/verify/route.ts` for session creation logic.

- Hand shows zero contributions / persistent drift after rationalize:
  - Cause: control-center aggregation excluded deposit kinds or RPC mismatch.
  - Fix: Confirm `app/api/hand/control-center/route.ts` includes deposit kinds (`eod_deposit`, `overhead_deposit`, `savings_deposit`, etc.). Re-run `/api/hand/control-center` and rationalize again as owner if appropriate.

- Drift reappears after rationalize:
  - Cause: computed balance excludes rows or delayed ledger inserts from other ingestion sources.
  - Fix: Audit `operations_ledger` rows around rationalize time; if RPC excludes rows, adjust RPC or reclassify rows. Consider a migration script to reclassify legacy kinds.

Operator runbook (step-by-step)
1) Confirm you are owner/admin. Open `/api/hand/system-check` and save output.
2) If deposits are failing, copy a failing POST payload and run the reproduction curl above; inspect API response and server logs.
3) Check `staff_sessions` table for the staff token hash; if missing, have staff re-login or re-issue session.
4) Confirm recent operations in DB: run the SQL above to list recent ledger entries and deposits.
5) If per-shop contributions are zero, run `/api/hand/control-center` (owner) and inspect `operations.byShop` entries.
6) If rationalize is required, perform via existing owner-only UI or call rationalize API and then record the `operations_drifts` entry for audit.

Operational maintenance checklist
- Daily: review `staff_logs` and `staff_sessions` for abnormal activity.
- Weekly: run `/api/hand/system-check` and archive results if needed.
- After deploy: run smoke tests: POST a test `eod_deposit` as staff in a sandbox shop, verify it appears in `recentOperations` and `control-center` aggregates.

Notes for future work / improvements
- Replace `prompt()` UX with an audited modal for `Set Actual Balance` that requires a short reason and stores `operations_drifts` metadata.
- Add owner-only UI for the `system-check` output with filters and CSV export.
- Add automated tests for `app/api/operations/ledger` to assert staff can create allowed kinds.

Contact & escalation
- If DB-level fixes are required (migrations, reclassification), get a DBA or owner approval before running updates.
- For urgent cash discrepancies, follow the `RECOVERY_GUIDE.md` and contact the on-call operator.

File location
- This runbook: `docs/SYSTEM_CHECK.md` (this file).

---
Generated: April 30, 2026
