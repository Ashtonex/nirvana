"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export function AccessGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || "";

  // Check if staff is logged in
  const [staffShopId, setStaffShopId] = useState<string | null>(null);
  const [staffRole, setStaffRole] = useState<string | null>(null);
  const [ownerOk, setOwnerOk] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    async function checkStaff() {
      console.log("[AccessGate] Starting auth check, pathname:", pathname);
      try {
        const res = await fetch("/api/staff/me", { cache: "no-store", credentials: "include" });
        console.log("[AccessGate] /api/staff/me status:", res.status);
        if (res.ok) {
          const data = await res.json();
          console.log("[AccessGate] /api/staff/me data:", JSON.stringify(data));
          if (data?.staff?.shop_id) {
            console.log("[AccessGate] Staff found with shop_id:", data.staff.shop_id);
            setStaffShopId(data.staff.shop_id);
            setStaffRole(String(data?.staff?.role || ""));
            setChecked(true);
            return;
          }

          const r = String(data?.staff?.role || "").toLowerCase();
          console.log("[AccessGate] Staff role:", r, "has shop_id:", !!data?.staff?.shop_id);
          if (data?.staff && (r === "owner" || r === "admin")) {
            console.log("[AccessGate] Owner/admin detected, allowing through");
            setOwnerOk(true);
            setChecked(true);
            return;
          }
        } else {
          console.log("[AccessGate] /api/staff/me returned non-OK status");
        }
      } catch (e) {
        console.error("[AccessGate] /api/staff/me error:", e);
      }

      try {
        const r2 = await fetch("/api/auth/me", { cache: "no-store", credentials: "include" });
        const data2 = await r2.json().catch(() => ({}));
        console.log("[AccessGate] /api/auth/me data:", JSON.stringify(data2));
        const role = String(data2?.employee?.role || "").toLowerCase();
        setOwnerOk(role === "owner" || role === "admin");
        console.log("[AccessGate] Owner session check, role:", role, "ownerOk:", role === "owner" || role === "admin");
      } catch {
        console.log("[AccessGate] /api/auth/me error");
        setOwnerOk(false);
      }
      console.log("[AccessGate] Auth check complete");
      setChecked(true);
    }
    checkStaff();
  }, [pathname]);

  // Always allow login page
  if (pathname === "/login" || pathname === "/staff-login") {
    return <>{children}</>;
  }

  // While checking, show nothing
  if (!checked) {
    return null;
  }

  // If staff is logged in, STRICTLY limit to their shop and staff-chat only
  if (staffShopId) {
    const onTheirShop = pathname === `/shops/${staffShopId}` || pathname.startsWith(`/shops/${staffShopId}/`);
    const onStaffChat = pathname === "/staff-chat";
    const onCommandCenter = pathname === "/";

    const r = String(staffRole || "").toLowerCase();
    const isManager =
      r === "manager" ||
      r === "lead_manager" ||
      r === "lead manager" ||
      r === "admin" ||
      r === "owner";

    const managerAllowed =
      pathname === "/inventory/stocktake" ||
      pathname === "/admin/audit" ||
      pathname === "/admin/settings" ||
      pathname === "/admin/pos-audit" ||
      pathname.startsWith("/admin/pos-audit/") ||
      pathname === "/intelligence" ||
      pathname.startsWith("/intelligence/") ||
      pathname === "/finance/oracle" ||
      pathname.startsWith("/finance/") ||
      pathname === "/operations" ||
      pathname.startsWith("/operations/") ||
      pathname === "/invest" ||
      pathname.startsWith("/invest/") ||
      pathname === "/logic" ||
      pathname.startsWith("/logic/");
    
    if (onTheirShop || onStaffChat || (isManager && managerAllowed)) {
      console.log("[AccessGate] Allowing access - staff on their shop or staff-chat or manager page");
      return <>{children}</>;
    }

    // Staff trying to access anything else - redirect to their shop
    console.log("[AccessGate] Staff blocked, redirecting to their shop:", staffShopId);
    router.replace(`/shops/${staffShopId}`);
    return null;
  }

  // Not staff - let through (owner AuthProvider will handle owner check)
  if (ownerOk) {
    console.log("[AccessGate] Allowing owner/admin through");
    return <>{children}</>;
  }

  // Neither staff nor owner: force login instead of falling through to Command Center
  const staffPreferred = pathname.startsWith("/shops") || pathname.startsWith("/staff-chat");
  const redirectTarget = staffPreferred ? "/staff-login" : "/login";
  console.log("[AccessGate] No auth found, redirecting to:", redirectTarget);
  router.replace(redirectTarget);
  return null;
}
