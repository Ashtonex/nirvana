/**
 * System Health Check Script
 * Converts Python system_health.py to JavaScript
 */

function checkSelfHealth(data) {
    const healthReport = {
        status: "healthy",
        timestamp: new Date().toISOString(),
        checks: [],
        alerts: []
    };

    // 1. Audit Log Anomaly Detection
    const auditLog = data.audit_log || [];
    const errorCount = auditLog.filter(entry => 
        (entry.action || "").toLowerCase().includes("error")
    ).length;
    
    healthReport.checks.push({
        name: "Audit Log Integrity",
        result: errorCount < 5 ? "OK" : "CONCERN",
        details: `Found ${errorCount} recent system errors.`
    });
    
    if (errorCount > 10) {
        healthReport.status = "degraded";
        healthReport.alerts.push("High volume of system errors detected in last sync.");
    }

    // 2. Financial Connection (Uncommitted entries)
    const ledger = data.ledger || [];
    const unassigned = ledger.filter(entry => 
        !entry.employee_id && entry.category === "POS Sale"
    ).length;
    
    healthReport.checks.push({
        name: "Financial Attribution",
        result: unassigned === 0 ? "OK" : "WARNING",
        details: `${unassigned} unassigned sales detected.`
    });
    
    if (unassigned > 5) {
        healthReport.alerts.push("Multiple sales records missing employee attribution. Shift handover risk.");
    }

    // 3. Process Stability
    if (!ledger.length && !auditLog.length) {
        healthReport.status = "critical";
        healthReport.alerts.push("No operational data detected. Data pipeline may be stalled.");
    }

    return healthReport;
}

// Export for use
module.exports = { checkSelfHealth };

// CLI usage
if (require.main === module) {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
    
    let input = '';
    rl.on('line', (line) => { input += line; });
    rl.on('close', () => {
        try {
            if (!input.trim()) {
                console.log(JSON.stringify({ status: "error", message: "No input received" }));
                process.exit(1);
            }
            const payload = JSON.parse(input);
            const result = checkSelfHealth(payload);
            console.log(JSON.stringify(result));
        } catch (e) {
            console.log(JSON.stringify({ status: "error", message: e.message }));
            process.exit(1);
        }
    });
}
