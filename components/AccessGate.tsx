"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export function AccessGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || "";

  // Check if staff is logged in
  const [staffShopId, setStaffShopId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    async function checkStaff() {
      try {
        const res = await fetch("/api/staff/me", { cache: "no-store" });
        const data = await res.json();
        if (data?.staff?.shop_id) {
          setStaffShopId(data.staff.shop_id);
        }
      } catch (e) {
        // Not staff
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
    
    if (onTheirShop || onStaffChat) {
      return <>{children}</>;
    }

    // Staff trying to access anything else - redirect to their shop
    router.replace(`/shops/${staffShopId}`);
    return null;
  }

  // Not staff - let through (owner AuthProvider will handle owner check)
  return <>{children}</>;
}
