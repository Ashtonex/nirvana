import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const id = searchParams.get("id");

    if (id) {
      const { data, error } = await supabaseAdmin
        .from("expansion_analysis")
        .select("*, expansion_routes(*)")
        .eq("id", id)
        .single();

      if (error) throw error;
      return NextResponse.json({ expansion: data });
    }

    let query = supabaseAdmin
      .from("expansion_analysis")
      .select("*, expansion_routes(*)")
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({ expansions: data || [] });
  } catch (e: any) {
    console.error("[Expansion GET]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      node_name,
      location,
      location_type = "new_location",
      rent_budget,
      employees_planned,
      avg_salary,
      initial_investment,
      projected_revenue,
      notes,
    } = body;

    if (!node_name) {
      return NextResponse.json({ error: "Node name required" }, { status: 400 });
    }

    const monthlyOverhead =
      (rent_budget || 0) +
      (employees_planned || 0) * (avg_salary || 0);

    const breakEvenMonths =
      initial_investment && monthlyOverhead > 0 && projected_revenue
        ? Math.ceil(
            initial_investment / Math.max(1, projected_revenue - monthlyOverhead)
          )
        : null;

    const feasibilityScore = calculateFeasibilityScore(
      rent_budget || 0,
      employees_planned || 0,
      avg_salary || 0,
      initial_investment || 0,
      projected_revenue || 0
    );

    const { data, error } = await supabaseAdmin
      .from("expansion_analysis")
      .insert({
        node_name,
        location,
        location_type,
        rent_budget: rent_budget || 0,
        employees_planned: employees_planned || 0,
        avg_salary: avg_salary || 0,
        initial_investment: initial_investment || 0,
        projected_revenue: projected_revenue || 0,
        monthly_overhead: monthlyOverhead,
        break_even_months: breakEvenMonths,
        feasibility_score: feasibilityScore,
        risk_level: feasibilityScore >= 70 ? "low" : feasibilityScore >= 50 ? "medium" : feasibilityScore >= 30 ? "high" : "very_high",
        notes,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ expansion: data });
  } catch (e: any) {
    console.error("[Expansion POST]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const {
      id,
      node_name,
      location,
      location_type,
      rent_budget,
      employees_planned,
      avg_salary,
      initial_investment,
      projected_revenue,
      status,
      notes,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "Expansion ID required" }, { status: 400 });
    }

    const monthlyOverhead =
      (rent_budget || 0) +
      (employees_planned || 0) * (avg_salary || 0);

    const breakEvenMonths =
      initial_investment && monthlyOverhead > 0 && projected_revenue
        ? Math.ceil(
            initial_investment / Math.max(1, projected_revenue - monthlyOverhead)
          )
        : null;

    const feasibilityScore = calculateFeasibilityScore(
      rent_budget || 0,
      employees_planned || 0,
      avg_salary || 0,
      initial_investment || 0,
      projected_revenue || 0
    );

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
      rent_budget: rent_budget || 0,
      employees_planned: employees_planned || 0,
      avg_salary: avg_salary || 0,
      initial_investment: initial_investment || 0,
      projected_revenue: projected_revenue || 0,
      monthly_overhead: monthlyOverhead,
      break_even_months: breakEvenMonths,
      feasibility_score: feasibilityScore,
      risk_level: feasibilityScore >= 70 ? "low" : feasibilityScore >= 50 ? "medium" : feasibilityScore >= 30 ? "high" : "very_high",
    };

    if (node_name) updates.node_name = node_name;
    if (location) updates.location = location;
    if (location_type) updates.location_type = location_type;
    if (status) {
      updates.status = status;
      if (status === "approved") updates.approved_at = new Date().toISOString();
      if (status === "rejected") updates.rejected_at = new Date().toISOString();
    }
    if (notes !== undefined) updates.notes = notes;

    const { data, error } = await supabaseAdmin
      .from("expansion_analysis")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ expansion: data });
  } catch (e: any) {
    console.error("[Expansion PUT]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Expansion ID required" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("expansion_analysis")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[Expansion DELETE]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function calculateFeasibilityScore(
  rent: number,
  employees: number,
  avgSalary: number,
  initialInvestment: number,
  projectedRevenue: number
): number {
  let score = 50;

  if (rent > 0 && projectedRevenue > 0) {
    const rentRatio = rent / projectedRevenue;
    if (rentRatio < 0.2) score += 20;
    else if (rentRatio < 0.35) score += 10;
    else if (rentRatio > 0.5) score -= 20;
  }

  if (employees > 0 && projectedRevenue > 0) {
    const laborCost = employees * avgSalary;
    const laborRatio = laborCost / projectedRevenue;
    if (laborRatio < 0.25) score += 15;
    else if (laborRatio < 0.4) score += 5;
    else if (laborRatio > 0.5) score -= 15;
  }

  if (initialInvestment > 0 && projectedRevenue > 0) {
    const monthlyProfit = projectedRevenue - rent - employees * avgSalary;
    const roiMonths = initialInvestment / Math.max(1, monthlyProfit);
    if (roiMonths <= 6) score += 20;
    else if (roiMonths <= 12) score += 10;
    else if (roiMonths > 24) score -= 15;
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}
