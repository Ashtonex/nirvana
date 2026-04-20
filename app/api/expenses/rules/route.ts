import { NextResponse } from "next/server";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePrivilegedActor();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("brain_learning_rules")
      .select("*")
      .eq("is_active", true)
      .order("priority", { ascending: false });

    if (error) {
      console.error("Rules fetch error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (e: any) {
    console.error("Rules error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requirePrivilegedActor();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { match_pattern, match_field, action, category, priority } = body;

    if (!match_pattern?.trim()) {
      return NextResponse.json({ error: "Pattern is required" }, { status: 400 });
    }

    const ruleData = {
      id: Math.random().toString(36).substring(2, 9),
      rule_type: "expense_classification",
      match_pattern: match_pattern.trim(),
      match_field: match_field || "title",
      action: action || "overhead",
      category: category || null,
      priority: priority || 10,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin
      .from("brain_learning_rules")
      .insert([ruleData])
      .select();

    if (error) {
      console.error("Rule save error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data?.[0] || ruleData);
  } catch (e: any) {
    console.error("Rule save error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await requirePrivilegedActor();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const ruleId = url.pathname.split('/').pop();

    if (!ruleId) {
      return NextResponse.json({ error: "Rule ID required" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("brain_learning_rules")
      .delete()
      .eq("id", ruleId);

    if (error) {
      console.error("Rule delete error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Rule delete error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}