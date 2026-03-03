"use client";

import React, { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Unlock } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

export function Gatekeeper({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || "";
  const { user, employee, loading, signOut } = useAuth();

  const isLoginPage = pathname.startsWith("/login");

  const userRole = (employee?.role as string | undefined) || undefined;
  const userShop = (employee?.shop_id as string | undefined) || undefined;

  const defaultStage = (() => {
    if (userRole === "owner") return "/";
    if (userShop) return `/shops/${userShop}`;
    return "/";
  })();

  // 1) Unauthenticated users get sent to /login (except while already there)
  useEffect(() => {
    if (loading) return;
    if (!user && !isLoginPage) {
      router.replace("/login");
    }
  }, [loading, user, isLoginPage, router]);

  // 2) After sign-in, kick user off /login once employee profile is loaded
  useEffect(() => {
    if (!user || !employee) return;
    if (isLoginPage) {
      router.replace(defaultStage);
    }
  }, [user, employee, isLoginPage, defaultStage, router]);

  // 3) Enforce role-based routing
  useEffect(() => {
    if (!user || !employee) return;

    const role = userRole || "sales";
    const shopPath = userShop ? `/shops/${userShop}` : "/";

    if (role === "owner") return;

    const allowedPrefixes = role === "manager"
      ? [shopPath, "/chat", "/transfers"]
      : [shopPath, "/chat"];

    const ok = allowedPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    if (!ok) {
      router.replace(shopPath);
    }
  }, [user, employee, userRole, userShop, pathname, router]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-violet-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-400 font-medium">Loading Nirvana...</p>
        </div>
      </div>
    );
  }

  // Allow /login to render when logged out
  if (!user && isLoginPage) {
    return <>{children}</>;
  }

  // Non-login routes while logged out: nothing (redirect effect handles it)
  if (!user) {
    return null;
  }

  // Logged in, but no employee record (or RLS blocks it)
  if (!employee) {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-xl w-full bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
          <h1 className="text-xl font-black uppercase italic text-white">Account Not Provisioned</h1>
          <p className="text-slate-400 mt-2">
            Your login exists in Supabase Auth, but you do not have an employee profile yet.
            An owner must add your row in the `employees` table (and set role/shop).
          </p>
          <div className="mt-4 text-xs text-slate-500 font-mono break-all">{user.email}</div>
          <button
            onClick={async () => {
              await signOut();
              router.replace("/login");
            }}
            className="mt-6 px-4 py-2 rounded-lg bg-rose-600 text-white font-black uppercase text-xs"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <>
      {children}
      <div className="fixed bottom-4 right-4 z-[90] flex items-center gap-2">
        <div className="bg-slate-900/90 backdrop-blur px-3 py-2 rounded-lg border border-slate-800 flex items-center gap-2">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-[10px] font-black text-slate-400 uppercase">
            {employee.name} ({employee.role})
          </span>
          <button
            onClick={handleLogout}
            className="ml-2 text-slate-500 hover:text-rose-500 transition-colors"
            title="Sign Out"
          >
            <Unlock className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}
