import sys
import json
import datetime
import http.client
import urllib.parse

def check_self_health(data):
    """
    Checks the current system state for obvious failure points.
    """
    health_report = {
        "status": "healthy",
        "timestamp": datetime.datetime.now().isoformat(),
        "checks": [],
        "alerts": []
    }

    # 1. Audit Log Anomaly Detection (Shift-readiness)
    audit_log = data.get("audit_log", [])
    error_count = sum(1 for entry in audit_log if "error" in entry.get("action", "").lower())
    
    health_report["checks"].append({
        "name": "Audit Log Integrity",
        "result": "OK" if error_count < 5 else "CONCERN",
        "details": f"Found {error_count} recent system errors."
    })
    
    if error_count > 10:
        health_report["status"] = "degraded"
        health_report["alerts"].append("High volume of system errors detected in last sync.")

    # 2. Financial Connection (Uncommitted entries)
    ledger = data.get("ledger", [])
    unassigned = sum(1 for entry in ledger if not entry.get("employee_id") and entry.get("category") == "POS Sale")
    
    health_report["checks"].append({
        "name": "Financial Attribution",
        "result": "OK" if unassigned == 0 else "WARNING",
        "details": f"{unassigned} unassigned sales detected."
    })
    
    if unassigned > 5:
        health_report["alerts"].append("Multiple sales records missing employee attribution. Shift handover risk.")

    # 3. Process Stability (Empty opening balances)
    # If this was called at shift start, we'd check if today has an opening balance
    # For now, we simulate a check on data presence
    if not ledger and not audit_log:
        health_report["status"] = "critical"
        health_report["alerts"].append("No operational data detected. Data pipeline may be stalled.")

    return health_report

if __name__ == "__main__":
    try:
        input_data = sys.stdin.read()
        if not input_data:
            print(json.dumps({"status": "error", "message": "No input received"}))
            sys.exit(1)
            
        payload = json.loads(input_data)
        result = check_self_health(payload)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}))
