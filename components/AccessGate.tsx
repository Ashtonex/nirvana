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

  // Wait for BOTH providers to finish loading
  const loading = ownerLoading || staffLoading;

  // Determine auth state
  const isOwner = Boolean(ownerUser) && ownerEmployee?.role === "owner";
  const isStaff = Boolean(staff) && staff?.role !== "owner" && Boolean(staff?.shop_id);
  
  // Detect login pages
  const isLoginPage = pathname === "/login" || pathname === "/staff-login";
  
  // Detect page types
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

  // DON'T redirect while still loading - wait for auth check to complete
  useEffect(() => {
    if (loading) return;

    // If on login page and already authenticated, redirect to appropriate page
    if (isLoginPage) {
      if (isOwner) {
        router.replace("/");
        return;
      }
      if (isStaff && staff?.shop_id) {
        router.replace(`/shops/${staff.shop_id}`);
        return;
      }
      return; // Not authenticated, stay on login
    }

    // If trying to access POS/chat without any auth, go to login
    if (isPOSPage && !isOwner && !isStaff) {
      router.replace("/login");
      return;
    }

    // If trying to access admin pages without owner auth, go to login
    if (isAdminPage && !isOwner) {
      // If staff tries to access admin, send them to their shop
      if (isStaff && staff?.shop_id) {
        router.replace(`/shops/${staff.shop_id}`);
        return;
      }
      router.replace("/login");
      return;
    }

    // Staff trying to access wrong shop - send to their shop
    if (isStaff && isShopPage && staff?.shop_id) {
      if (!pathname.includes(`/${staff.shop_id}/`)) {
        router.replace(`/shops/${staff.shop_id}`);
        return;
      }
    }

    // Staff trying to access admin from shop - redirect to their shop
    if (isStaff && isAdminPage && staff?.shop_id) {
      router.replace(`/shops/${staff.shop_id}`);
      return;
    }

  }, [loading, isLoginPage, isOwner, isStaff, staff, isPOSPage, isAdminPage, isShopPage, pathname, router]);

  // Show nothing while loading to prevent flash
  if (loading) {
    return null;
  }

  return <>{children}</>;
}
