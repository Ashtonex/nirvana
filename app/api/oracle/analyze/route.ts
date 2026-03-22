import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const scriptPath = path.join(process.cwd(), "scripts", "oracle_brain.py");
    
    if (!fs.existsSync(scriptPath)) {
      return NextResponse.json({ error: "Oracle brain script not found" }, { status: 500 });
    }

    return new Promise((resolve) => {
      const pythonCmd = process.platform === "win32" ? "python" : "python3";
      const child = spawn(pythonCmd, [scriptPath]);
      
      let stdout = "";
      let stderr = "";
      
      child.stdout.on("data", (data) => { stdout += data.toString(); });
      child.stderr.on("data", (data) => { stderr += data.toString(); });
      
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
            child2.stdin.write(JSON.stringify(data));
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

      child.stdin.write(JSON.stringify(data));
      child.stdin.end();
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
