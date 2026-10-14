import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST() {
  const jar = await cookies();
  const token = jar.get("nirvana_owner")?.value;
  if (token) {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    try {
      await supabaseAdmin.from("staff_sessions").delete().eq("token_hash", tokenHash);
    } catch (e) {
      console.error("Failed to delete owner session from DB:", e);
    }
  }

  jar.delete("nirvana_owner");
  return NextResponse.json({ success: true });
}
