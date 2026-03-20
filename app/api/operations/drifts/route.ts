import { NextResponse } from "next/server";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePrivilegedActor();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("operations_drifts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ drifts: [], error: error.message });
    }

    return NextResponse.json({ drifts: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requirePrivilegedActor();
    const body = await req.json().catch(() => ({}));
    
    const amount = Number(body?.amount);
    const reason = String(body?.reason || "");
    const resolveKind = String(body?.resolveKind || "overhead_payment");
    const resolveShop = String(body?.resolveShop || "");
    
    if (!Number.isFinite(amount) || amount === 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ error: "Reason required" }, { status: 400 });
    }

    const timestamp = new Date().toISOString();
    const id = Math.random().toString(36).substring(2, 9);

    const driftRecord = {
      id,
      amount,
      reason,
      resolved_kind: resolveKind,
      resolved_shop: resolveShop,
      created_at: timestamp,
    };

    const { data: drift, error: driftError } = await supabaseAdmin
      .from("operations_drifts")
      .insert(driftRecord)
      .select("*")
      .maybeSingle();

    if (driftError) {
      console.log("Drifts table not ready, recording as ledger entry instead");
    }

    const ledgerKind = resolveKind === "explained" ? "drift_explained" : resolveKind;
    
    const overheadKeywords = ["rent", "utilities", "electric", "water", "internet", "salaries", "misc"];
    let overheadCategory = null;
    
    if (ledgerKind === "overhead_payment") {
      const reasonLower = reason.toLowerCase();
      for (const kw of overheadKeywords) {
        if (reasonLower.includes(kw)) {
          overheadCategory = kw;
          break;
        }
      }
      if (!overheadCategory && resolveShop) {
        overheadCategory = resolveShop.includes("kipasa") ? "rent" 
          : resolveShop.includes("tradecenter") ? "rent"
          : resolveShop.includes("dub") ? "rent"
          : "misc";
      }
    }

    const ledgerEntry = {
      amount: Math.abs(amount),
      kind: ledgerKind,
      shop_id: resolveShop || null,
      overhead_category: overheadCategory,
      title: `Drift Resolution: ${reason}`,
      notes: reason,
      effective_date: timestamp.split("T")[0],
      metadata: {
        type: "drift_resolution",
        original_amount: amount,
        reason,
        resolved_kind: resolveKind,
        resolved_shop: resolveShop,
      },
    };

    await supabaseAdmin.from("operations_ledger").insert(ledgerEntry);

    return NextResponse.json({ success: true, drift: drift || driftRecord });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
