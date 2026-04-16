import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    console.log("Starting deep diagnostic for Oracle RPC...");
    
    // Test basic connection
    const { data: shops, error: shopsError } = await supabaseAdmin.from('shops').select('id, name').limit(1);
    
    // Probe column names
    const { data: saleRow } = await supabaseAdmin.from('sales').select('*').limit(1);
    const { data: invRow } = await supabaseAdmin.from('inventory_items').select('*').limit(1);
    const { data: depRow } = await supabaseAdmin.from('invest_deposits').select('*').limit(1);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      schemaProbe: {
        salesColumns: saleRow && saleRow[0] ? Object.keys(saleRow[0]) : "EMPTY",
        inventoryColumns: invRow && invRow[0] ? Object.keys(invRow[0]) : "EMPTY",
        depositColumns: depRow && depRow[0] ? Object.keys(depRow[0]) : "EMPTY"
      },
      rpcStatus: rpcError ? "ERROR" : "SUCCESS",
      rpcError: rpcError || null,
      environment: {
        hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY
      }
    });

  } catch (e: any) {
    return NextResponse.json({ 
      error: "Unexpected Diagnostic Failure", 
      message: e.message,
      stack: e.stack 
    }, { status: 500 });
  }
}
