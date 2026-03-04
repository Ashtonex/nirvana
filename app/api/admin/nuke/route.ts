import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] || "";
}

async function requireOwner(req: Request) {
  const token = getBearerToken(req);
  if (!token) return { ok: false as const, status: 401, error: "Missing bearer token" };

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return { ok: false as const, status: 401, error: "Invalid token" };

  const user = data.user;
  const { data: emp } = await supabaseAdmin
    .from("employees")
    .select("id,role,name,surname")
    .eq("id", user.id)
    .maybeSingle();

  if (emp?.role !== "owner") {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  const name = `${emp.name || "Admin"} ${emp.surname || ""}`.trim();
  return { ok: true as const, userId: user.id, name };
}

async function deleteAll(table: string, whereNotNullColumn: string) {
  // Supabase requires a filter for delete(). This pattern deletes all rows.
  const res = await supabaseAdmin.from(table).delete().not(whereNotNullColumn, "is", null);
  if (res.error) throw new Error(`${table}: ${res.error.message}`);
}

export async function POST(req: Request) {
  if (process.env.NIRVANA_ENABLE_NUKE !== "true") {
    return NextResponse.json({ error: "Nuke disabled" }, { status: 403 });
  }

  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== "NUKE") {
    return NextResponse.json({ error: "Missing confirm" }, { status: 400 });
  }

  // Hard wipe (keep: owners + shops + settings)
  // Order tries to avoid FK issues.
  try {
    await deleteAll("staff_sessions", "token_hash");
  } catch {}
  try {
    await deleteAll("staff_login_codes", "id");
  } catch {}

  await Promise.all([
    // Comms + requests
    deleteAll("staff_chat_messages", "id").catch(() => undefined),
    deleteAll("stock_requests", "id").catch(() => undefined),

    // Commerce + ops
    deleteAll("quotations", "id").catch(() => undefined),
    deleteAll("sales", "id").catch(() => undefined),
    deleteAll("transfers", "id").catch(() => undefined),

    // Accounting + logs
    deleteAll("ledger_entries", "id").catch(() => undefined),
    deleteAll("oracle_emails", "id").catch(() => undefined),
    deleteAll("audit_log", "id").catch(() => undefined),
  ]);

  // Inventory
  await deleteAll("inventory_allocations", "item_id").catch(() => undefined);
  await deleteAll("inventory_items", "id").catch(() => undefined);
  await deleteAll("shipments", "id").catch(() => undefined);

  // Employees (keep owners)
  const delEmp = await supabaseAdmin.from("employees").delete().neq("role", "owner");
  if (delEmp.error) {
    // If FK constraints exist, fall back to soft-disable (best-effort)
    await supabaseAdmin
      .from("employees")
      .update({ is_active: false, active: false })
      .neq("role", "owner");
  }

  // Ensure the calling owner remains active (schema tolerant)
  try {
    await supabaseAdmin
      .from("employees")
      .update({ is_active: true, active: true })
      .eq("id", auth.userId);
  } catch {}

  return NextResponse.json({ success: true, adminName: auth.name });
}
