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

    if (error) {
      if (error.message.includes("does not exist")) {
        return NextResponse.json({
          rules: [],
          warning: "Brain learning database not initialized. Rules cannot be loaded until migration is applied."
        });
      }
      throw error;
    }

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

    // First check if table exists by trying to select from it
    const { error: checkError } = await supabaseAdmin
      .from("brain_learning_rules")
      .select("id")
      .limit(1);

    if (checkError && checkError.message.includes("does not exist")) {
      return NextResponse.json({
        error: "Brain learning database not initialized. Please run the migration SQL in your Supabase Dashboard.",
        migration_required: true,
        sql: `
-- Run this in your Supabase SQL Editor:
CREATE TABLE IF NOT EXISTS brain_learning_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type TEXT NOT NULL CHECK (rule_type IN ('expense_filter', 'expense_tag', 'threshold', 'category_map', 'personal_marker')),
  match_pattern TEXT NOT NULL,
  match_field TEXT NOT NULL DEFAULT 'title',
  action TEXT NOT NULL,
  action_value TEXT,
  category TEXT,
  priority INTEGER DEFAULT 50,
  is_active BOOLEAN DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  times_triggered INTEGER DEFAULT 0,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_brain_rules_type ON brain_learning_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_brain_rules_active ON brain_learning_rules(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_brain_rules_pattern ON brain_learning_rules(match_pattern);
        `
      }, { status: 500 });
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
