import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { supabaseAdmin } from "@/lib/supabase";
import { listOperationsLedgerEntries } from "@/lib/operations";
import { requirePrivilegedActor } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePrivilegedActor();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Fetch Audit Logs
    const { data: auditLog } = await supabaseAdmin
      .from("audit_log")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(50);

    // 2. Fetch Ledger
    const ledger = await listOperationsLedgerEntries(50);

    const payload = { audit_log: auditLog || [], ledger: ledger || [] };

    // 3. Execute Python
    const scriptPath = path.join(process.cwd(), "scripts", "system_health.py");
    
    const result = await new Promise((resolve, reject) => {
      const python = spawn("python", [scriptPath]);
      let stdout = "";
      let stderr = "";

      python.stdin.write(JSON.stringify(payload));
      python.stdin.end();

      python.stdout.on("data", (data) => (stdout += data.toString()));
      python.stderr.on("data", (data) => (stderr += data.toString()));

      python.on("close", (code) => {
        if (code !== 0) reject(new Error(stderr || "Python script failed"));
        try {
          resolve(JSON.parse(stdout));
        } catch (e) {
          reject(new Error("Failed to parse Python output"));
        }
      });
    });

    return NextResponse.json(result);
  } catch (e: any) {
    console.error("Health API Error:", e);
    return NextResponse.json({ status: "error", message: e.message }, { status: 500 });
  }
}
