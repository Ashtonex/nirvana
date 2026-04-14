import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("brain_learning_rules")
      .select("*")
      .eq("is_active", true)
      .order("priority", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ rules: data || [] });
  } catch (e: any) {
    console.error("[Brain Rules GET]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      rule_type,
      match_pattern,
      match_field = "title",
      action,
      action_value,
      category,
      priority = 50,
      notes,
      created_by,
    } = body;

    if (!rule_type || !match_pattern || !action) {
      return NextResponse.json(
        { error: "Missing required fields: rule_type, match_pattern, action" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("brain_learning_rules")
      .insert({
        rule_type,
        match_pattern,
        match_field,
        action,
        action_value,
        category,
        priority,
        notes,
        created_by,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ rule: data });
  } catch (e: any) {
    console.error("[Brain Rules POST]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Rule ID required" }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("brain_learning_rules")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ rule: data });
  } catch (e: any) {
    console.error("[Brain Rules PUT]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Rule ID required" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("brain_learning_rules")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[Brain Rules DELETE]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
