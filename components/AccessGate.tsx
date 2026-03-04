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

  const isOwner = Boolean(ownerUser) && ownerEmployee?.role === "owner";
  const isStaff = Boolean(staff) && staff?.role !== "owner";

  const isLoginPage = pathname === "/login" || pathname === "/staff-login";
  const isPublic = isLoginPage;

  const isShopPage = pathname.startsWith("/shops/");
  const isStaffChatPage = pathname === "/staff-chat";
  const isPOSAccessible = isShopPage || isStaffChatPage;

  const isAdminPage = 
    pathname.startsWith("/admin") || 
    pathname.startsWith("/employees") || 
    pathname.startsWith("/inventory") ||
    pathname.startsWith("/finance") ||
    pathname.startsWith("/reports") ||
    pathname === "/";

  const loading = ownerLoading || staffLoading;

  // Redirect away from login if authenticated
  useEffect(() => {
    if (loading) return;
    
    if (isLoginPage) {
      if (isOwner) {
        router.replace("/");
        return;
      }
      if (isStaff && staff?.shop_id) {
        router.replace(`/shops/${staff.shop_id}`);
        return;
      }
    }
  }, [loading, isLoginPage, isOwner, isStaff, staff, router]);

  // Owner has full access - no restrictions
  // Staff can only access POS pages and staff chat
  useEffect(() => {
    if (loading) return;
    if (isPublic) return;
    
    // Staff restrictions
    if (isStaff) {
      // Staff trying to access admin/owner pages - redirect to their shop
      if (isAdminPage) {
        if (staff?.shop_id) {
          router.replace(`/shops/${staff.shop_id}`);
        } else {
          router.replace("/login?mode=staff");
        }
        return;
      }
      
      // Staff trying to access other shops - redirect to their shop
      if (isShopPage && !pathname.includes(`/${staff?.shop_id}/`)) {
        if (staff?.shop_id) {
          router.replace(`/shops/${staff.shop_id}`);
        }
        return;
      }
    }
    
    // Unauthenticated access to protected pages
    if (!isOwner && !isStaff) {
      if (isAdminPage || isPOSAccessible) {
        router.replace("/login");
        return;
      }
    }
  }, [loading, isPublic, isOwner, isStaff, isAdminPage, isPOSAccessible, isShopPage, staff, router]);

  if (loading) {
    return null;
  }

  return <>{children}</>;
}
