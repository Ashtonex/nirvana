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

  const body = await req.json().catch(() => ({}));
  const scenario = body.scenario || "Recession";
  const startTime = Date.now();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const sendElapsed = (step: string) => {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        send({ step, elapsed });
      };

      try {
        sendElapsed("fetching_data");
        send({ progress: 5, message: "Fetching system data..." });

        const [inventoryRes, salesRes, ledgerRes] = await Promise.all([
          supabaseAdmin.from("inventory_items").select("*"),
          supabaseAdmin.from("sales").select("*").order("date", { ascending: false }).limit(200),
          supabaseAdmin.from("ledger_entries").select("*").order("date", { ascending: false }).limit(200),
        ]);

        const cashBalance = await getOperationsComputedBalance();
        send({ progress: 15, message: "Data loaded. Initializing Monte Carlo engine..." });

        const payload = {
          scenario,
          inventory: inventoryRes.data || [],
          sales: salesRes.data || [],
          ledger: ledgerRes.data || [],
          cash_balance: cashBalance || 0,
        };

        const scriptPath = path.join(process.cwd(), "scripts", "stress_tester.py");
        const pythonCmd = process.platform === "win32" ? "python" : "python3";

        send({ progress: 20, message: "Launching simulation engine..." });

        const result = await new Promise<any>((resolve, reject) => {
          const python = spawn(pythonCmd, [scriptPath]);
          let buffer = "";

          python.stdout.on("data", (data: Buffer) => {
            const lines = data.toString().split("\n");
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;

              if (trimmed === "__NIRVANA_RESULT__") {
                buffer = "";
                continue;
              }

              if (trimmed.startsWith("PROGRESS:")) {
                const parts = trimmed.split(":");
                const pct = parseInt(parts[1], 10);
                const detail = parts.slice(2).join(":");
                const scaledProgress = 20 + Math.round(pct * 0.75);
                send({ progress: scaledProgress, message: detail || `Simulating... ${pct}%` });
              } else {
                buffer += trimmed;
              }
            }
          });

          python.stderr.on("data", (data: Buffer) => {
            console.error("Python stderr:", data.toString());
          });

          python.on("error", (err) => reject(err));

          python.on("close", (code) => {
            if (code !== 0) {
              const retryPy = spawn("py", [scriptPath]);
              let retryBuffer = "";

              retryPy.stdout.on("data", (data: Buffer) => {
                const lines = data.toString().split("\n");
                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed) continue;
                  if (trimmed === "__NIRVANA_RESULT__") { retryBuffer = ""; continue; }
                  if (trimmed.startsWith("PROGRESS:")) {
                    const parts = trimmed.split(":");
                    const pct = parseInt(parts[1], 10);
                    const detail = parts.slice(2).join(":");
                    const scaledProgress = 20 + Math.round(pct * 0.75);
                    send({ progress: scaledProgress, message: detail || `Simulating... ${pct}%` });
                  } else {
                    retryBuffer += trimmed;
                  }
                }
              });

              retryPy.stderr.on("data", (data: Buffer) => console.error("Python retry stderr:", data.toString()));
              retryPy.on("close", (c2) => {
                if (c2 !== 0) { reject(new Error("Python script failed")); return; }
                try { resolve(JSON.parse(retryBuffer)); } catch { reject(new Error("Failed to parse simulation output")); }
              });

              retryPy.stdin.write(JSON.stringify(payload));
              retryPy.stdin.end();
              return;
            }

            try { resolve(JSON.parse(buffer)); } catch { reject(new Error("Failed to parse simulation output")); }
          });

          python.stdin.write(JSON.stringify(payload));
          python.stdin.end();
        });

        send({ progress: 95, message: "Simulation complete. Generating report..." });

        if (result.status === "success" && result.report_html) {
          const reportsDir = path.join(process.cwd(), "public", "reports");
          if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

          const filePath = path.join(reportsDir, result.filename);
          fs.writeFileSync(filePath, result.report_html);

          send({ progress: 100, message: "Report ready!", reportUrl: `/reports/${result.filename}`, filename: result.filename, complete: true });
        } else {
          send({ error: result.message || "Simulation produced no output", complete: true });
        }
      } catch (e: any) {
        send({ error: e.message || "Simulation failed", complete: true });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
