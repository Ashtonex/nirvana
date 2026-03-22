import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { supabaseAdmin } from "@/lib/supabase";
import { getOperationsComputedBalance } from "@/lib/operations";
import { requirePrivilegedActor } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requirePrivilegedActor();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const scenario = body.scenario || "Recession";

    // 1. Fetch Context Data
    const [
      { data: inventory },
      { data: sales },
      { data: ledger },
      cashBalance
    ] = await Promise.all([
      supabaseAdmin.from("inventory_items").select("*"),
      supabaseAdmin.from("sales").select("*").order("date", { ascending: false }).limit(200),
      supabaseAdmin.from("ledger_entries").select("*").order("date", { ascending: false }).limit(200),
      getOperationsComputedBalance()
    ]);

    const payload = {
        scenario,
        inventory: inventory || [],
        sales: sales || [],
        ledger: ledger || [],
        cash_balance: cashBalance || 0
    };

    // 2. Execute Python Stress Tester
    const scriptPath = path.join(process.cwd(), "scripts", "stress_tester.py");
    
    const result: any = await new Promise((resolve, reject) => {
      const pythonCmd = process.platform === "win32" ? "python" : "python3";
      const python = spawn(pythonCmd, [scriptPath]);
      let stdout = "";
      let stderr = "";

      python.stdin.write(JSON.stringify(payload));
      python.stdin.end();

      python.stdout.on("data", (data) => (stdout += data.toString()));
      python.stderr.on("data", (data) => (stderr += data.toString()));

      python.on("close", (code) => {
        if (code !== 0) {
            if (process.platform === "win32") {
                const pyRetry = spawn("py", [scriptPath]);
                let s2 = "", e2 = "";
                pyRetry.stdin.write(JSON.stringify(payload));
                pyRetry.stdin.end();
                pyRetry.stdout.on("data", (d) => (s2 += d.toString()));
                pyRetry.stderr.on("data", (d) => (e2 += d.toString()));
                pyRetry.on("close", (c2) => {
                    if (c2 !== 0) reject(new Error(e2 || "Python retry failed"));
                    try { resolve(JSON.parse(s2)); } catch { reject(new Error("Failed to parse retry output")); }
                });
                return;
            }
            reject(new Error(stderr || "Python script failed"));
        }
        try {
          resolve(JSON.parse(stdout));
        } catch (e) {
          reject(new Error("Failed to parse Python output"));
        }
      });
    });

    if (result.status === "success" && result.report_html) {
        // 3. Save Report to public/reports
        const reportsDir = path.join(process.cwd(), "public", "reports");
        if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
        
        const filePath = path.join(reportsDir, result.filename);
        fs.writeFileSync(filePath, result.report_html);
        
        return NextResponse.json({
            success: true,
            reportUrl: `/reports/${result.filename}`,
            filename: result.filename
        });
    }

    return NextResponse.json({ 
        success: false, 
        message: result.message || "Simulation failed to generate report output",
        raw: result
    }, { status: 500 });
  } catch (e: any) {
    console.error("Stress Test API Error:", e);
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}
