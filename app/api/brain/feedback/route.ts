import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("brain_feedback")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    return NextResponse.json({ feedback: data || [] });
  } catch (e: any) {
    console.error("[Brain Feedback GET]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      expense_id,
      expense_source,
      original_classification,
      feedback_action,
      new_classification,
      new_category,
      created_rule_id,
      notes,
      created_by,
    } = body;

    if (!expense_id || !expense_source || !feedback_action) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("brain_feedback")
      .insert({
        expense_id,
        expense_source,
        original_classification,
        feedback_action,
        new_classification,
        new_category,
        created_rule_id,
        notes,
        created_by,
      })
      .select()
      .single();

    if (error) throw error;

    if (feedback_action === "approve" || feedback_action === "reject") {
      await supabaseAdmin.rpc("increment_rule_trigger", { rule_id: created_rule_id });
    }

    return NextResponse.json({ feedback: data });
  } catch (e: any) {
    console.error("[Brain Feedback POST]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
