"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { supabaseAuth, useAuth } from "@/components/AuthProvider";
import { Loader2, Skull, ShieldAlert } from "lucide-react";

type Phase = "idle" | "confirm" | "running" | "done" | "error";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function useScript(adminName: string) {
  return useMemo(() => {
    const name = adminName || "Admin";
    return [
      "Initiating system wipe sequence...",
      "Locking staff sessions...",
      "Revoking access tokens...",
      "Erasing operational ledgers...",
      "Purging inventory lots...",
      "Clearing sales, quotations, transfers...",
      "System neutralised.",
      "Now attempting repairs...",
      "Repairs successful.",
      "Admin Dev rights restored.",
      "Admin Dash active.",
      `Welcome ${name}.`,
      "Nirvana online.",
      "POS systems active.",
      "KIPASA POS active",
      "DUB DUB POS active",
      "TRADECENTER POS active",
      "Taxes active",
      "Inventory active",
      "Chat active",
      "System fully rebooted.",
      "User authenticated as Admin.",
      "WELCOME TO NIRVANA.",
    ];
  }, [adminName]);
}

export default function NukeConsole() {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>("idle");
  const [confirmText, setConfirmText] = useState("");
  const [lines, setLines] = useState<string[]>([]);
  const [adminName, setAdminName] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef(false);

  const script = useScript(adminName || (user?.email || "Admin"));

  const run = async () => {
    setBusy(true);
    setPhase("running");
    setLines([]);
    abortRef.current = false;

    const { data } = await supabaseAuth.auth.getSession();
    const token = data.session?.access_token || "";
    if (!token) {
      setPhase("error");
      setLines(["ERROR: Missing owner session token."]);
      setBusy(false);
      return;
    }

    // Print a few lines first for effect
    for (let i = 0; i < 6; i++) {
      if (abortRef.current) return;
      setLines((p) => [...p, script[i]]);
      await sleep(350);
    }

    // Execute wipe
    setLines((p) => [...p, "EXECUTE: NIRVANA_NUKE"]);
    const res = await fetch("/api/admin/nuke", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ confirm: "NUKE" }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPhase("error");
      setLines((p) => [...p, `ERROR: ${payload?.error || "Nuke failed"}`]);
      setBusy(false);
      return;
    }

    if (payload?.adminName) setAdminName(String(payload.adminName));

    // Continue script
    for (let i = 6; i < script.length; i++) {
      if (abortRef.current) return;
      setLines((p) => [...p, script[i]]);
      await sleep(i >= script.length - 4 ? 500 : 250);
    }

    setPhase("done");
    await sleep(900);
    setLines((p) => [...p, "Loading admin dashboard..."]);
    await sleep(600);
    window.location.href = "/";
  };

  const disabled = busy || !user;

  return (
    <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-rose-400" />
            <h3 className="text-sm font-black uppercase italic tracking-widest text-rose-300">System Nuke</h3>
          </div>
          <p className="mt-1 text-[10px] font-bold uppercase text-rose-300/70">
            Test-day tool. Wipes operational data and removes staff. Owners remain.
          </p>
        </div>

        <Button
          variant="destructive"
          className="h-10 px-4 text-[10px] font-black uppercase tracking-widest"
          disabled={disabled}
          onClick={() => setPhase("confirm")}
        >
          <Skull className="h-4 w-4 mr-2" /> Nuke
        </Button>
      </div>

      {phase === "confirm" && (
        <div className="mt-4 rounded-xl border border-rose-500/20 bg-slate-950/40 p-4">
          <div className="text-xs font-black text-rose-300">Type NUKE to confirm.</div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="NUKE"
              className="h-10 w-full sm:w-44 rounded-md border border-slate-800 bg-slate-950 px-3 text-sm font-black tracking-[0.35em] text-center text-slate-100 outline-none"
              autoFocus
            />
            <Button
              variant="destructive"
              className="h-10 w-full sm:w-auto text-[10px] font-black uppercase tracking-widest"
              disabled={confirmText !== "NUKE" || busy}
              onClick={run}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm & Execute"}
            </Button>
            <Button
              variant="outline"
              className="h-10 w-full sm:w-auto text-[10px] font-black uppercase tracking-widest"
              disabled={busy}
              onClick={() => {
                setPhase("idle");
                setConfirmText("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {(phase === "running" || phase === "done" || phase === "error") && (
        <div className="mt-4">
          <div className="fixed inset-0 z-[200] bg-slate-950/90 backdrop-blur-sm" />
          <div className="fixed inset-0 z-[210] p-4 flex items-center justify-center">
            <div className="w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/40">
                <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">NIRVANA // SYSTEM CONSOLE</div>
                <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">
                  {phase === "error" ? "ERROR" : phase === "done" ? "COMPLETE" : "RUNNING"}
                </div>
              </div>
              <div className="p-4 sm:p-6 font-mono text-xs text-slate-200 h-[60svh] overflow-auto">
                {lines.map((l, idx) => (
                  <div key={idx} className="whitespace-pre-wrap leading-relaxed">
                    <span className="text-slate-500">$</span> {l}
                  </div>
                ))}
                {phase === "running" && (
                  <div className="mt-3 inline-flex items-center gap-2 text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>erasing…</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
