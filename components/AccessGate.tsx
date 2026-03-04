"use client";

import React, { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useStaff } from "@/components/StaffProvider";

export function AccessGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || "";

  const { user: ownerUser, employee: ownerEmployee, loading: ownerLoading } = useAuth();
  const { staff, loading: staffLoading } = useStaff();

  const loading = ownerLoading || staffLoading;

  // Login page is ALWAYS public - don't block it
  const isLoginPage = pathname === "/login";
  
  // If on login page, always render it without restrictions
  if (isLoginPage) {
    return <>{children}</>;
  }

  // Determine auth state
  const isOwner = Boolean(ownerUser) && ownerEmployee?.role === "owner";
  const isStaff = Boolean(staff) && staff?.role !== "owner" && Boolean(staff?.shop_id);
  
  // Page types
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

  // While checking auth, show nothing (except login page which is handled above)
  if (loading) {
    return null;
  }

  // If NOT on login page and NOT authenticated, redirect to login
  if (!isOwner && !isStaff) {
    router.replace("/login");
    return null;
  }
  
  // Staff Access Enforcement
  if (isStaff) {
    // Staff trying to access admin pages -> redirect to their shop
    if (isAdminPage) {
      router.replace(`/shops/${staff.shop_id}`);
      return null;
    }
    
    // Staff trying to access wrong shop -> redirect to their shop
    if (isShopPage && staff.shop_id && !pathname.includes(`/${staff.shop_id}/`)) {
      router.replace(`/shops/${staff.shop_id}`);
      return null;
    }
  }
  
  // Owner has full access - no restrictions
  return <>{children}</>;
}