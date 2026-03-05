"use client";

import React from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { AiChat } from "@/components/AiChat";
import { MobileNav } from "@/components/MobileNav";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { AccessGate } from "@/components/AccessGate";
import { useAuth } from "@/components/AuthProvider";
import { useStaff } from "@/components/StaffProvider";
import { User } from "lucide-react";

function StaffHeader() {
  const { staff } = useStaff();
  
  if (!staff) return null;
  
  return (
    <div className="fixed top-0 right-0 z-50 flex items-center gap-2 px-4 py-2 bg-slate-900/80 backdrop-blur border-b border-slate-800">
      <User className="h-4 w-4 text-slate-400" />
      <span className="text-sm font-medium text-slate-200">
        {staff.name} {staff.surname}
      </span>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user: ownerUser, loading: ownerLoading } = useAuth();
  const { staff, loading: staffLoading } = useStaff();

  // Wait for auth to load
  if (ownerLoading || staffLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-pulse text-slate-500">Loading...</div>
      </div>
    );
  }

  // Login routes render without the full app shell.
  if (!pathname || pathname.startsWith("/login") || pathname.startsWith("/staff-login")) {
    return <AccessGate>{children}</AccessGate>;
  }

  // Show sidebar and mobile nav only for owner (not for staff)
  const showNav = !staff && (ownerUser?.email === "flectere@dev.com" || ownerUser?.email);

  return (
    <AccessGate>
      <div className="flex h-screen overflow-hidden">
        {showNav && <Sidebar />}
        <main className={`flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-8 ${staff ? 'pb-20' : 'pb-8'}`}>
          <StaffHeader />
          {children}
        </main>
        {showNav && <AiChat />}
        {showNav && <MobileNav />}
        {!showNav && staff && <AiChat />}
        <ServiceWorkerRegistration />
      </div>
    </AccessGate>
  );
}
