import { NextResponse } from "next/server";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePrivilegedActor();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: sessions, error } = await supabaseAdmin
      .from("staff_sessions")
      .select("*, created_at")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) throw error;

    const { data: employees } = await supabaseAdmin
      .from("employees")
      .select("id, name, surname, shop_id");

    const entries = (sessions || []).map((s: any) => {
      const emp = employees?.find((e: any) => e.id === s.employee_id);
      return {
        id: s.id,
        employee_id: s.employee_id,
        employee_name: emp ? `${emp.name} ${emp.surname || ""}`.trim() : s.employee_id,
        shop_id: emp?.shop_id,
        action: "login",
        timestamp: s.created_at,
      };
    });

    const { data: audit } = await supabaseAdmin
      .from("audit_log")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(30);

    const sessionActions = (audit || [])
      .filter((a: any) => 
        a.action?.includes("sale") || 
        a.action?.includes("expense") || 
        a.action?.includes("transfer") ||
        a.action?.includes("eod")
      )
      .map((a: any) => ({
        id: a.id,
        employee_id: a.employee_id,
        shop_id: a.shop_id,
        action: a.action,
        amount: a.details?.amount,
        timestamp: a.timestamp,
      }));

    const allEntries = [...entries, ...sessionActions]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 50);

    return NextResponse.json({ entries: allEntries });
  } catch (e: any) {
    console.error("Sessions API error:", e);
    return NextResponse.json({ error: e.message, entries: [] }, { status: 500 });
  }
}
