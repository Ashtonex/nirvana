import { cookies } from "next/headers";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";

export type Actor =
  | { type: "owner_cookie" }
  | { type: "staff"; employeeId: string; shopId: string | null; role: string | null };

function isPrivilegedRole(role: string | null | undefined) {
  const r = String(role || "").toLowerCase();
  return r === "owner" || r === "admin";
}

export async function requirePrivilegedActor(): Promise<Actor> {
  const jar = await cookies();
  const ownerToken = jar.get("nirvana_owner")?.value;
  if (ownerToken) return { type: "owner_cookie" };

  const staffToken = jar.get("nirvana_staff")?.value;
  if (!staffToken) throw new Error("Unauthorized");

  const tokenHash = createHash("sha256").update(staffToken).digest("hex");
  const { data: session } = await supabaseAdmin
    .from("staff_sessions")
    .select("employee_id, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!session || (session.expires_at && new Date(session.expires_at).getTime() < Date.now())) {
    throw new Error("Unauthorized");
  }

  const { data: staff } = await supabaseAdmin
    .from("employees")
    .select("id, shop_id, role")
    .eq("id", session.employee_id)
    .maybeSingle();

  if (!staff?.id) throw new Error("Unauthorized");
  if (!isPrivilegedRole((staff as any).role)) throw new Error("Forbidden");

  return {
    type: "staff",
    employeeId: String((staff as any).id),
    shopId: (staff as any).shop_id ? String((staff as any).shop_id) : null,
    role: (staff as any).role ? String((staff as any).role) : null,
  };
}

