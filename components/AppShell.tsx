"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { AiChat } from "@/components/AiChat";
import { MobileNav } from "@/components/MobileNav";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { AccessGate } from "@/components/AccessGate";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  // Login routes render without the full app shell.
  if (!pathname || pathname.startsWith("/login") || pathname.startsWith("/staff-login")) {
    return <AccessGate>{children}</AccessGate>;
  }

  // Protected app shell
  return (
    <AccessGate>
      <div className="flex h-screen h-[100dvh] overflow-hidden w-full max-w-[100vw]">
        {/* Desktop sidebar - hidden on mobile */}
        <div className="hidden lg:block">
          <Sidebar />
        </div>
        
        {/* Main content area */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden w-full max-w-[100vw] px-2 sm:px-4 py-3 sm:py-6 pb-24 sm:pb-8">
          <div className="sticky top-0 z-40 -mx-2 sm:-mx-4 px-2 sm:px-4 py-2 bg-slate-950/70 backdrop-blur border-b border-slate-800/60">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 border-slate-800"
                onClick={() => {
                  try { router.back(); } catch { router.push("/"); }
                }}
                title="Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 truncate">
                {pathname === "/" ? "Command Center" : pathname}
              </div>
            </div>
          </div>
          <div className="w-full max-w-full overflow-x-hidden">
            {children}
          </div>
        </main>
        
        <AiChat />
        <MobileNav />
        <ServiceWorkerRegistration />
      </div>
    </AccessGate>
  );
}
