import type { TeeSetupAlert } from "@/lib/tshirts-setup-alerts";
import Link from "next/link";
import { X } from "lucide-react";
import { useState } from "react";

const styles: Record<TeeSetupAlert["severity"], string> = {
  error:
    "border-rose-500/40 bg-rose-950/30 text-rose-100 [&_a]:text-rose-200 [&_a]:underline",
  warning:
    "border-amber-500/40 bg-amber-950/20 text-amber-100 [&_a]:text-amber-200 [&_a]:underline",
  info: "border-sky-500/30 bg-sky-950/20 text-sky-100 [&_a]:text-sky-200 [&_a]:underline",
};

export function TshirtsSetupBanner({ alerts }: { alerts: TeeSetupAlert[] }) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  if (!alerts?.length) return null;

  const visibleAlerts = alerts.filter((a) => {
    const key = `${a.code}-${a.itemId ?? "global"}`;
    return !dismissedIds.has(key);
  });

  if (visibleAlerts.length === 0) {
    return (
      <div className="text-[11px] text-slate-500 px-4 py-2 rounded-xl border border-slate-800/50">
        All setup alerts dismissed. ({alerts.length} total)
      </div>
    );
  }

  return (
    <div className="space-y-2" role="status" aria-live="polite">
      {visibleAlerts.map((a, i) => {
        const alertKey = `${a.code}-${a.itemId ?? "global"}`;
        return (
          <div
            key={`${alertKey}-${i}`}
            className={`rounded-xl border px-4 py-3 text-sm leading-relaxed flex gap-3 items-start ${styles[a.severity]}`}
          >
            <div className="flex-1 min-w-0">
              <p className="font-black uppercase text-[10px] tracking-widest opacity-80 mb-1">
                {a.severity === "error" ? "Action required" : a.severity === "warning" ? "Heads up" : "Info"}
                {a.itemName ? ` · ${a.itemName}` : ""}
              </p>
              <p>{a.message}</p>
              {a.itemId && (
                <p className="mt-2 text-[11px] font-mono opacity-70">SKU id: {a.itemId}</p>
              )}
            </div>
            <button
              onClick={() => {
                const newDismissed = new Set(dismissedIds);
                newDismissed.add(alertKey);
                setDismissedIds(newDismissed);
              }}
              className="flex-shrink-0 mt-1 p-1 hover:bg-black/30 rounded transition-colors"
              aria-label="Dismiss alert"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
      <p className="text-[11px] text-slate-500">
        Reference:{" "}
        <Link href="/tshirts/setup-guide" className="text-orange-400 hover:underline">
          Tee setup guide
        </Link>{" "}
        (canonical categories and pitfalls).
      </p>
    </div>
  );
}
