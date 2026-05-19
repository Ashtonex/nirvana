import { Shirt } from "lucide-react";
import { TshirtsNav } from "./TshirtsNav";

export function TshirtsHeader({
  title = "Nirvana Tees",
  subtitle,
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/25">
            <Shirt className="h-6 w-6 text-white" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-orange-500/80">
              Plain T-Shirt · Plain Golf T-Shirt
            </p>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tighter uppercase italic text-white">
              {title}
            </h1>
          </div>
        </div>
        {subtitle && (
          <p className="text-slate-400 text-sm max-w-2xl">{subtitle}</p>
        )}
      </div>
      <TshirtsNav />
    </div>
  );
}

