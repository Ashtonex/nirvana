"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type StaffContextValue = {
  staff: any | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const StaffContext = createContext<StaffContextValue>({
  staff: null,
  loading: true,
  refresh: async () => {},
  signOut: async () => {},
});

export function StaffProvider({ children }: { children: React.ReactNode }) {
  const [staff, setStaff] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const res = await fetch("/api/staff/me", { cache: "no-store", credentials: "include" });
      if (!res.ok) {
        setStaff(null);
        return;
      }
      const data = await res.json();
      setStaff(data?.staff || null);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    await fetch("/api/staff/logout", { method: "POST" });
    setStaff(null);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <StaffContext.Provider value={{ staff, loading, refresh, signOut }}>
      {children}
    </StaffContext.Provider>
  );
}

export function useStaff() {
  return useContext(StaffContext);
}
