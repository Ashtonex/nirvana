import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { shopId } = await req.json();
    const scriptPath = path.join(process.cwd(), "scripts", "oracle_brain.py");
    const memoryPath = path.join(process.cwd(), "scripts", "oracle_memory.json");
    
    if (!fs.existsSync(scriptPath)) {
      return NextResponse.json({ error: "Oracle brain script not found" }, { status: 500 });
    }

    // Load knowledge memory
    let memory = {};
    if (fs.existsSync(memoryPath)) {
      try {
        memory = JSON.parse(fs.readFileSync(memoryPath, "utf8"));
      } catch (e) {
        console.error("Failed to load oracle memory:", e);
      }
    }

    // Fetch Deep Scan Data
    const [salesRes, ledgerRes, quotesRes, auditRes, employeesRes] = await Promise.all([
      supabaseAdmin.from("sales").select("*").order("date", { ascending: false }).limit(500),
      supabaseAdmin.from("ledger_entries").select("*").order("date", { ascending: false }).limit(500),
      supabaseAdmin.from("quotations").select("*").eq("is_layby", true).limit(100),
      supabaseAdmin.from("audit_log").select("*").order("timestamp", { ascending: false }).limit(300),
      supabaseAdmin.from("employees").select("id, name, surname, role")
    ]);

    const payload = {
      sales: salesRes.data || [],
      ledger: ledgerRes.data || [],
      quotations: quotesRes.data || [],
      audit_log: auditRes.data || [],
      employees: employeesRes.data || [],
      memory,
      shopId
    };

    // Handle memory updates (if the user answered a question)
    const { answer, questionId } = await req.json().catch(() => ({}));
    if (answer && questionId) {
      memory = { ...memory, [questionId]: { answer, timestamp: new Date().toISOString() } };
      try {
        fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2));
      } catch (e) {
        console.error("Failed to save oracle memory:", e);
      }
    }

    return new Promise<NextResponse>((resolve) => {
      const pythonCmd = process.platform === "win32" ? "python" : "python3";
      const child = spawn(pythonCmd, [scriptPath]);
      
      let stdout = "";
      let stderr = "";
      
      child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
      child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
      
      child.on("close", (code) => {
        if (code !== 0) {
          console.error("Oracle execution failed:", stderr);
          // Retry with 'py' on windows
          if (process.platform === "win32") {
            const child2 = spawn("py", [scriptPath]);
            let s2 = "", e2 = "";
            child2.stdout.on("data", (d) => { s2 += d.toString(); });
            child2.stderr.on("data", (d) => { e2 += d.toString(); });
            child2.on("close", (c2) => {
                if (c2 !== 0) {
                    resolve(NextResponse.json({ error: "Failed to execute Python AI", details: e2 }, { status: 500 }));
                } else {
                    try { resolve(NextResponse.json(JSON.parse(s2))); } 
                    catch (e) { resolve(NextResponse.json({ error: "Invalid AI response", details: s2 }, { status: 500 })); }
                }
            });
            child2.stdin.write(JSON.stringify(payload));
            child2.stdin.end();
            return;
          }
          resolve(NextResponse.json({ error: "AI process exited with error", details: stderr }, { status: 500 }));
          return;
        }

        try {
          resolve(NextResponse.json(JSON.parse(stdout)));
        } catch (e) {
          resolve(NextResponse.json({ error: "Malformed AI output", raw: stdout }, { status: 500 }));
        }
      });

      child.stdin.write(JSON.stringify(payload));
      child.stdin.end();
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
