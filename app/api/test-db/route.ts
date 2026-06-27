import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
    try {
        const today = new Date().toISOString().split("T")[0];
        const { data, error } = await supabaseAdmin
            .from("operations_ledger")
            .select("*")
            .eq("shop_id", "kipasa")
            .gte("created_at", `${today}T00:00:00.000Z`)
            .order("created_at", { ascending: false })
            .limit(10);
            
        return NextResponse.json({ data, error });
    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
