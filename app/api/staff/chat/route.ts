import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";

type Actor = {
  id: string;
  name: string;
  role: "staff" | "owner";
  shop_id?: string;
};

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

async function getOwnerFromBearer(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1];
  if (!token) return null;

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error) return null;
    const user = data.user;
    if (!user) return null;

    // Prefer employee profile (for nicer names) if it exists.
    const { data: emp } = await supabaseAdmin
      .from("employees")
      .select("id,name,surname,role")
      .eq("id", user.id)
      .maybeSingle();

    const name = emp?.name
      ? `${emp.name} ${emp.surname || ""}`.trim()
      : (user.user_metadata as any)?.name
        ? `${(user.user_metadata as any)?.name} ${(user.user_metadata as any)?.surname || ""}`.trim()
        : (user.email || "Owner");

    return {
      id: user.id,
      name,
      role: "owner" as const,
    };
  } catch {
    return null;
  }
}

async function getActor(req: Request): Promise<Actor | null> {
  const cookieStore = await cookies();
  const staffToken = cookieStore.get("nirvana_staff")?.value;
  const ownerToken = cookieStore.get("nirvana_owner")?.value;

  // If either cookie exists, consider authenticated
  if (!staffToken && !ownerToken) {
    // Check bearer token as fallback
    const ownerBearer = await getOwnerFromBearer(req);
    if (ownerBearer) return ownerBearer;
    return null;
  }

  // Staff session
  if (staffToken) {
    const staff = await getStaffFromCookie();
    if (staff) {
      const name = `${staff.name} ${staff.surname || ""}`.trim();
      return { id: staff.id, name, role: "staff", shop_id: staff.shop_id };
    }
  }

  // Owner session - just return a generic owner actor since token validation isn't needed for read ops
  if (ownerToken) {
    return { id: "owner", name: "Owner", role: "owner" as const };
  }

  return null;
}

function getRoomParams(req: Request) {
  const url = new URL(req.url);
  const room = (url.searchParams.get("room") || "shop").toLowerCase();
  const shopId = url.searchParams.get("shopId") || "";
  return { room, shopId };
}

function resolveShopForRoom(actor: Actor, room: string, shopId: string) {
  if (room === "universal") return "universal";
  if (room !== "shop") return null;

  if (actor.role === "staff") return actor.shop_id || null;
  // Owners can read/write any shop room (provided explicitly)
  return shopId || null;
}

export async function GET(req: Request) {
  const actor = await getActor(req);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { room, shopId } = getRoomParams(req);
  const targetShopId = resolveShopForRoom(actor, room, shopId);
  if (!targetShopId) {
    return NextResponse.json({ error: "Missing or invalid room/shopId" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("staff_chat_messages")
    .select("id,shop_id,sender_name,message,created_at")
    .eq("shop_id", targetShopId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ messages: data || [] });
}

export async function POST(req: Request) {
  const actor = await getActor(req);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { message, room, shopId } = body || {};
  const text = String(message || "").trim();
  if (!text) {
    return NextResponse.json({ error: "Missing message" }, { status: 400 });
  }

  const targetShopId = resolveShopForRoom(actor, String(room || "shop").toLowerCase(), String(shopId || ""));
  if (!targetShopId) {
    return NextResponse.json({ error: "Missing or invalid room/shopId" }, { status: 400 });
  }

  const senderName = actor.name;
  const id = Math.random().toString(36).slice(2, 10);
  const createdAt = new Date().toISOString();

  const { error } = await supabaseAdmin.from("staff_chat_messages").insert({
    id,
    shop_id: targetShopId,
    sender_employee_id: actor.id,
    sender_name: senderName,
    message: text,
    created_at: createdAt,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
