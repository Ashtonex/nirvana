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

  const errors: string[] = [];

  const runDelete = async (table: string, col: string) => {
    try {
      await deleteAll(table, col);
    } catch (e: any) {
      errors.push(e.message || String(e));
    }
  };

  // Hard wipe (keep: owners + shops + settings)
  // Order tries to avoid FK issues.
  await runDelete("staff_sessions", "token_hash");
  await runDelete("staff_login_codes", "id");

  await Promise.all([
    // Comms + requests
    runDelete("staff_chat_messages", "id"),
    runDelete("stock_requests", "id"),

    // Commerce + ops
    runDelete("quotations", "id"),
    runDelete("sales", "id"),
    runDelete("transfers", "id"),

    // Accounting + logs
    runDelete("ledger_entries", "id"),
    runDelete("oracle_emails", "id"),
    runDelete("audit_log", "id"),
  ]);

  // Inventory
  await runDelete("inventory_allocations", "item_id");
  await runDelete("inventory_items", "id");
  await runDelete("shipments", "id");

  // Employees (keep owners)
  const delEmp = await supabaseAdmin.from("employees").delete().neq("role", "owner");
  if (delEmp.error) {
    errors.push(`employees: ${delEmp.error.message}`);
    // If FK constraints exist, fall back to soft-disable (best-effort)
    const softDisable = await supabaseAdmin
      .from("employees")
      .update({ is_active: false, active: false })
      .neq("role", "owner");
    if (softDisable.error) {
      errors.push(`employees soft-disable: ${softDisable.error.message}`);
    }
  }

  // Ensure the calling owner remains active (schema tolerant)
  try {
    const ownerVerify = await supabaseAdmin
      .from("employees")
      .update({ is_active: true, active: true })
      .eq("id", auth.userId);
    if (ownerVerify.error) {
      errors.push(`calling owner status recovery: ${ownerVerify.error.message}`);
    }
  } catch (e: any) {
    errors.push(`calling owner status recovery exception: ${e.message || String(e)}`);
  }

  return NextResponse.json({
    success: errors.length === 0,
    adminName: auth.name,
    errors: errors.length > 0 ? errors : undefined
  });
}
