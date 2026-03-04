import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const cookieStore = await cookies();
  const auth = cookieStore.get("sb-access-token");
  const authHeader = cookieStore.get("sb-refresh-token");
  
  if (!auth?.value && !authHeader?.value) {
    return NextResponse.json({ user: null, employee: null });
  }

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser();
    
    if (error || !user) {
      return NextResponse.json({ user: null, employee: null });
    }

    const { data: employee } = await supabaseAdmin
      .from("employees")
      .select("*")
      .eq("id", user.id)
      .single();

    return NextResponse.json({ user, employee });
  } catch (e) {
    return NextResponse.json({ user: null, employee: null });
  }
}
