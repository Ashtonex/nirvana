"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabaseAuth } from "@/components/AuthProvider";

export function AccessGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || "";

  const [ownerData, setOwnerData] = useState<any>(null);
  const [staffData, setStaffData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Check both auth states on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        // Check owner auth
        const { data: sessionData } = await supabaseAuth.auth.getSession();
        if (sessionData?.session?.user) {
          const { data: empData } = await supabaseAuth
            .from('employees')
            .select('*')
            .eq('id', sessionData.session.user.id)
            .single();
          setOwnerData(empData);
        } else {
          setOwnerData(null);
        }
      } catch (e) {
        setOwnerData(null);
      }

      try {
        // Check staff cookie
        const res = await fetch("/api/staff/me", { cache: "no-store" });
        const data = await res.json();
        setStaffData(data?.staff || null);
      } catch (e) {
        setStaffData(null);
      }

      setLoading(false);
    }

    checkAuth();
  }, []);

  // While loading, show nothing
  if (loading) {
    return null;
  }

  const isOwner = ownerData?.role === "owner";
  const isStaff = Boolean(staffData?.shop_id) && staffData?.role !== "owner";
  
  const isLoginPage = pathname === "/login" || pathname === "/staff-login";
  const isShopPage = pathname.startsWith("/shops/");
  const isStaffChatPage = pathname === "/staff-chat";
  const isPOSPage = isShopPage || isStaffChatPage;
  const isAdminPage = 
    pathname.startsWith("/admin") || 
    pathname.startsWith("/employees") || 
    pathname.startsWith("/inventory") ||
    pathname.startsWith("/finance") ||
    pathname.startsWith("/reports") ||
    pathname === "/";

  // If on login page
  if (isLoginPage) {
    // Already logged in as owner -> go to dashboard
    if (isOwner) {
      router.replace("/");
      return null;
    }
    // Already logged in as staff -> go to their shop
    if (isStaff && staffData.shop_id) {
      router.replace(`/shops/${staffData.shop_id}`);
      return null;
    }
    // Not logged in -> stay on login
    return <>{children}</>;
  }

  // If trying to access any protected page without auth -> go to login
  if (!isOwner && !isStaff) {
    router.replace("/login");
    return null;
  }

  // Staff restrictions
  if (isStaff) {
    // Staff trying to access admin pages -> go to their shop
    if (isAdminPage && staffData.shop_id) {
      router.replace(`/shops/${staffData.shop_id}`);
      return null;
    }
    
    // Staff trying to access wrong shop -> go to their shop
    if (isShopPage && staffData.shop_id) {
      if (!pathname.includes(`/${staffData.shop_id}`)) {
        router.replace(`/shops/${staffData.shop_id}`);
        return null;
      }
    }
  }

  // Owner has full access - no restrictions
  return <>{children}</>;
}
