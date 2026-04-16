import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    console.log("Starting deep diagnostic for Oracle RPC...");
    
    // Test basic connection
    const { data: shops, error: shopsError } = await supabaseAdmin.from('shops').select('id, name').limit(1);
    
    // Call the RPC with raw output
    const { data: metrics, error: rpcError } = await supabaseAdmin.rpc('get_oracle_pulse_metrics', { 
        days_limit_int: 60 
    });

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      connectionTest: shopsError ? "FAILED" : "OK",
      shopsError: shopsError || null,
      rpcStatus: rpcError ? "ERROR" : "SUCCESS",
      rpcError: rpcError || null,
      rawMetrics: metrics || null,
      environment: {
        nodeVersion: process.version,
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
