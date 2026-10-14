import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { getStaffSessionEmployeeId, requireOwnerAccess } from "@/lib/api-auth";

export async function POST(req: Request) {
  const staffId = await getStaffSessionEmployeeId();
  const ownerAccess = await requireOwnerAccess(req);

  const body = await req.json();
  const { employeeId, status } = body;

  if (!ownerAccess.ok && (!staffId || staffId !== employeeId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!employeeId || !status) {
    return NextResponse.json(
      { error: 'Missing employeeId or status' },
      { status: 400 }
    );
  }

  // Update last activity timestamp
  const { error } = await supabaseAdmin
    .from('employees')
    .update({ last_active: new Date().toISOString() })
    .eq('id', employeeId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function GET(req: Request) {
  const staffId = await getStaffSessionEmployeeId();
  const ownerAccess = await requireOwnerAccess(req);

  if (!staffId && !ownerAccess.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Get count of staff online (active in last 5 minutes)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data: activeStaff, error } = await supabaseAdmin
    .from('employees')
    .select('id, name, shop_id')
    .gte('last_active', fiveMinutesAgo)
    .eq('active', true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    count: activeStaff?.length || 0,
    staff: activeStaff || []
  });
}
