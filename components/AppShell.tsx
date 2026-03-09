"use client";

import React from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { AiChat } from "@/components/AiChat";
import { MobileNav } from "@/components/MobileNav";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { AccessGate } from "@/components/AccessGate";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

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
