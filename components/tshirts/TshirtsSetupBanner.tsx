import type { TeeSetupAlert } from "@/lib/tshirts-setup-alerts";
import Link from "next/link";

const styles: Record<TeeSetupAlert["severity"], string> = {
  error:
    "border-rose-500/40 bg-rose-950/30 text-rose-100 [&_a]:text-rose-200 [&_a]:underline",
  warning:
    "border-amber-500/40 bg-amber-950/20 text-amber-100 [&_a]:text-amber-200 [&_a]:underline",
  info: "border-sky-500/30 bg-sky-950/20 text-sky-100 [&_a]:text-sky-200 [&_a]:underline",
};

export function TshirtsSetupBanner({ alerts }: { alerts: TeeSetupAlert[] }) {
  if (!alerts?.length) return null;

  return (
    <div className="space-y-2" role="status" aria-live="polite">
      {alerts.map((a, i) => (
        <div
          key={`${a.code}-${a.itemId ?? "global"}-${i}`}
          className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${styles[a.severity]}`}
        >
          <p className="font-black uppercase text-[10px] tracking-widest opacity-80 mb-1">
            {a.severity === "error" ? "Action required" : a.severity === "warning" ? "Heads up" : "Info"}
            {a.itemName ? ` · ${a.itemName}` : ""}
          </p>
          <p>{a.message}</p>
          {a.itemId && (
            <p className="mt-2 text-[11px] font-mono opacity-70">SKU id: {a.itemId}</p>
          )}
        </div>
      ))}
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
