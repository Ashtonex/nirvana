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

  const isOwner = Boolean(ownerUser);
  const isStaff = Boolean(staff);

  const isOwnerLogin = pathname.startsWith("/login");
  const isStaffLogin = pathname.startsWith("/staff-login");
  const isPublic = isOwnerLogin || isStaffLogin;

  const needsOwner = pathname.startsWith("/admin") || pathname.startsWith("/employees") || pathname.startsWith("/inventory") || pathname.startsWith("/finance") || pathname.startsWith("/reports") || pathname === "/";
  const needsStaff = pathname.startsWith("/shops") || pathname.startsWith("/chat") || pathname.startsWith("/transfers") || pathname.startsWith("/mobile-menu");

  // Redirect away from login pages if already authenticated
  useEffect(() => {
    if (ownerLoading || staffLoading) return;

    if ((isOwnerLogin || isStaffLogin) && (isOwner || isStaff)) {
      if (isOwner) router.replace("/");
      else if (staff?.shop_id) router.replace(`/shops/${staff.shop_id}`);
      else router.replace("/");
    }
  }, [ownerLoading, staffLoading, isOwnerLogin, isStaffLogin, isOwner, isStaff, staff, router]);

  // Auth enforcement
  useEffect(() => {
    if (ownerLoading || staffLoading) return;
    if (isPublic) return;

    if (needsOwner && !isOwner) {
      router.replace("/login");
      return;
    }

    if (needsStaff && !(isOwner || isStaff)) {
      router.replace("/staff-login");
      return;
    }
  }, [ownerLoading, staffLoading, isPublic, needsOwner, needsStaff, isOwner, isStaff, router]);

  // Staff role enforcement (owners bypass)
  useEffect(() => {
    if (ownerLoading || staffLoading) return;
    if (isOwner) return;
    if (!staff) return;

    const role = staff.role || "sales";
    const shopPath = staff.shop_id ? `/shops/${staff.shop_id}` : "/staff-login";

    if (pathname.startsWith("/transfers") && role !== "manager" && role !== "owner") {
      router.replace(shopPath);
      return;
    }

    // Sales cannot browse other shops
    if (pathname.startsWith("/shops/") && staff.shop_id) {
      const parts = pathname.split("/");
      const shopId = parts[2];
      if (shopId && shopId !== staff.shop_id) {
        router.replace(shopPath);
      }
    }
  }, [ownerLoading, staffLoading, isOwner, staff, pathname, router]);

  if (ownerLoading || staffLoading) {
    return null;
  }

  return <>{children}</>;
}
