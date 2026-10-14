import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes, createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    const ownerEmail = process.env.OWNER_EMAIL || "flectere@dev.com";
    const ownerPassword = process.env.OWNER_PASSWORD || "Ashytana";

    if (email?.toLowerCase() === ownerEmail.toLowerCase() && password === ownerPassword) {
      const token = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

      // Look up owner employee record from DB
      let employeeId = "c4d7f1b5-f286-4f11-bd4b-409537619f5c"; // default fallback ID
      const { data: employee } = await supabaseAdmin
        .from("employees")
        .select("id")
        .ilike("email", ownerEmail)
        .eq("role", "owner")
        .maybeSingle();

      if (employee?.id) {
        employeeId = employee.id;
      }

      // Persist owner session in the database
      const { error: sessionError } = await supabaseAdmin.from("staff_sessions").insert({
        employee_id: employeeId,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });

      if (sessionError) {
        console.error("Failed to persist owner session:", sessionError);
        return NextResponse.json({ error: "Failed to persist session" }, { status: 500 });
      }

      (await cookies()).set("nirvana_owner", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 14 * 24 * 60 * 60,
      });

      return NextResponse.json({ success: true, email: ownerEmail });
    }

    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  } catch (error) {
    console.error("Owner login exception:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
