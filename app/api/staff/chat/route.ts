import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";

async function getStaffFromCookie() {
  const token = (await cookies()).get("nirvana_staff")?.value;
  if (!token) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const { data: session } = await supabaseAdmin
    .from("staff_sessions")
    .select("employee_id, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!session) return null;
  if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) return null;

  const { data: staff } = await supabaseAdmin
    .from("employees")
    .select("id,name,surname,shop_id,role")
    .eq("id", session.employee_id)
    .maybeSingle();

  return staff || null;
}

export async function GET() {
  const staff = await getStaffFromCookie();
  if (!staff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("staff_chat_messages")
    .select("id,shop_id,sender_name,message,created_at")
    .eq("shop_id", staff.shop_id)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ messages: data || [] });
}

export async function POST(req: Request) {
  const staff = await getStaffFromCookie();
  if (!staff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { message } = await req.json();
  const text = String(message || "").trim();
  if (!text) {
    return NextResponse.json({ error: "Missing message" }, { status: 400 });
  }

  const senderName = `${staff.name} ${staff.surname || ""}`.trim();
  const id = Math.random().toString(36).slice(2, 10);
  const createdAt = new Date().toISOString();

  const { error } = await supabaseAdmin.from("staff_chat_messages").insert({
    id,
    shop_id: staff.shop_id,
    sender_employee_id: staff.id,
    sender_name: senderName,
    message: text,
    created_at: createdAt,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
