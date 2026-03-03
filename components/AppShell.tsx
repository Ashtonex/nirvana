"use client";

import React from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { AiChat } from "@/components/AiChat";
import { MobileNav } from "@/components/MobileNav";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { Gatekeeper } from "@/components/Gatekeeper";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Login route renders without the full app shell, but still runs Gatekeeper
  // so it can redirect after sign-in.
  if (!pathname || pathname.startsWith("/login")) {
    return <Gatekeeper>{children}</Gatekeeper>;
  }

  // Protected app shell
  return (
    <Gatekeeper>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-8 pb-20 md:pb-8">
          {children}
        </main>
        <AiChat />
        <MobileNav />
        <ServiceWorkerRegistration />
      </div>
    </Gatekeeper>
  );
}
