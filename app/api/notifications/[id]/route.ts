import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getStaffSessionEmployeeId, isApiAuthEnforced } from "@/lib/api-auth";

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const staffEmployeeId = await getStaffSessionEmployeeId();
  if (isApiAuthEnforced() && !staffEmployeeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (id.startsWith("msg_")) {
    const messageId = id.replace("msg_", "");
    await supabaseAdmin
      .from("chat_messages")
      .update({ read: true })
      .eq("id", messageId);
  }

  return NextResponse.json({ success: true });
}
