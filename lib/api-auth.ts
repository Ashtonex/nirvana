import { cookies } from "next/headers";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";

export function isApiAuthEnforced() {
  return process.env.NIRVANA_ENFORCE_API_AUTH === "true";
}

export async function getStaffSessionEmployeeId() {
  const token = (await cookies()).get("nirvana_staff")?.value;
  if (!token) return null;

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data: session, error } = await supabaseAdmin
    .from("staff_sessions")
    .select("employee_id, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !session) return null;
  if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) return null;

  return session.employee_id as string;
}

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] || "";
}

async function isOwnerFromBearer(req: Request) {
  const token = getBearerToken(req);
  if (!token) return false;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return false;

  const { data: emp } = await supabaseAdmin
    .from("employees")
    .select("id,role")
    .eq("id", data.user.id)
    .maybeSingle();

  return emp?.role === "owner";
}

export async function requireOwnerAccess(req: Request) {
  if (!isApiAuthEnforced()) {
    return { ok: true as const };
  }

  const ownerCookie = (await cookies()).get("nirvana_owner")?.value;
  if (ownerCookie) {
    return { ok: true as const };
  }

  const ownerBearer = await isOwnerFromBearer(req);
  if (ownerBearer) {
    return { ok: true as const };
  }

  return { ok: false as const, status: 401, error: "Unauthorized" };
}
