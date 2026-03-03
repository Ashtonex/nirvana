import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST() {
  const jar = await cookies();
  const token = jar.get("nirvana_staff")?.value;
  if (token) {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await supabaseAdmin.from("staff_sessions").delete().eq("token_hash", tokenHash);
  }

  jar.set("nirvana_staff", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return NextResponse.json({ success: true });
}
