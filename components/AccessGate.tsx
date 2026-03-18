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
      try {
        const res = await fetch("/api/staff/me", { cache: "no-store", credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data?.staff?.shop_id) {
            setStaffShopId(data.staff.shop_id);
            setStaffRole(String(data?.staff?.role || ""));
            setChecked(true);
            return;
          }
        }
      } catch (e) {
        // Not staff
      }

      // If not staff, check owner session (Next route)
      try {
        const r2 = await fetch("/api/auth/me", { cache: "no-store", credentials: "include" });
        setOwnerOk(r2.ok);
      } catch {
        setOwnerOk(false);
      }
      setChecked(true);
    }
    checkStaff();
  }, []);

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
      pathname.startsWith("/finance/");
    
    if (onTheirShop || onStaffChat || (isManager && managerAllowed)) {
      return <>{children}</>;
    }

    // Staff trying to access anything else - redirect to their shop
    router.replace(`/shops/${staffShopId}`);
    return null;
  }

  // Not staff - let through (owner AuthProvider will handle owner check)
  if (ownerOk) return <>{children}</>;

  // Neither staff nor owner: force login instead of falling through to Command Center
  const staffPreferred = pathname.startsWith("/shops") || pathname.startsWith("/staff-chat");
  router.replace(staffPreferred ? "/staff-login" : "/login");
  return null;
}
