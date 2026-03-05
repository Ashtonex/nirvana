import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";

async function requireOwner() {
  const cookieStore = await cookies();
  const auth = cookieStore.get("sb-access-token");
  const refresh = cookieStore.get("sb-refresh-token");
  const token = auth?.value || refresh?.value;
  
  if (!token) return { ok: false, status: 401, error: "Not authenticated" };

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return { ok: false, status: 401, error: "Invalid token" };

  const { data: emp } = await supabaseAdmin
    .from("employees")
    .select("id,role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (emp?.role !== "owner") return { ok: false, status: 403, error: "Forbidden" };

  return { ok: true, userId: data.user.id };
}

export async function POST(req: Request) {
  const auth = await requireOwner();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== "PURGE_ALL_STOCK") {
    return NextResponse.json({ error: "Missing confirm" }, { status: 400 });
  }

  try {
    await supabaseAdmin.from("inventory_allocations").delete().not("id", "is", null);
    await supabaseAdmin.from("inventory_items").delete().not("id", "is", null);
    await supabaseAdmin.from("shipments").delete().not("id", "is", null);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Purge failed" }, { status: 500 });
  }
}
