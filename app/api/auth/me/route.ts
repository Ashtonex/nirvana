import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const cookieStore = await cookies();
  
  // 1. Try owner lookup
  const ownerToken = cookieStore.get("nirvana_owner");
  if (ownerToken?.value) {
    const tokenHash = createHash("sha256").update(ownerToken.value).digest("hex");
    const { data: session } = await supabaseAdmin
      .from("staff_sessions")
      .select("employee_id, expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (session && (!session.expires_at || new Date(session.expires_at).getTime() > Date.now())) {
      const { data: employee } = await supabaseAdmin
        .from("employees")
        .select("*")
        .eq("id", session.employee_id)
        .maybeSingle();

      if (employee && employee.role === "owner") {
        return NextResponse.json({ 
          user: { email: employee.email }, 
          employee 
        });
      }
    }
  }

  // 2. Try staff lookup
  const staffToken = cookieStore.get("nirvana_staff");
  if (staffToken?.value) {
    const tokenHash = createHash("sha256").update(staffToken.value).digest("hex");
    const { data: session } = await supabaseAdmin
      .from("staff_sessions")
      .select("employee_id, expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (session && (!session.expires_at || new Date(session.expires_at).getTime() > Date.now())) {
      const { data: employee } = await supabaseAdmin
        .from("employees")
        .select("*")
        .eq("id", session.employee_id)
        .maybeSingle();

      if (employee) {
        return NextResponse.json({ 
          user: { email: employee.email }, 
          employee 
        });
      }
    }
  }

  // 3. Try standard Supabase Auth session token
  const auth = cookieStore.get("sb-access-token");
  if (auth?.value) {
    try {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(auth.value);
      
      if (!error && user) {
        const { data: employee } = await supabaseAdmin
          .from("employees")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        return NextResponse.json({ user, employee });
      }
    } catch (e) {
      console.error("[/api/auth/me] Supabase auth token verification error:", e);
    }
  }

  return NextResponse.json({ user: null, employee: null });
}
