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
    const { data: settings } = await supabaseAdmin.from('oracle_settings').select('zombie_days').single();
    const { data: inventory } = await supabaseAdmin.from('inventory_items').select('*');
    
    if (!inventory) return NextResponse.json([]);

    const zombies = inventory.filter((i: any) => {
        const days = Math.floor((new Date().getTime() - new Date(i.date_added).getTime()) / (1000 * 3600 * 24));
        return days > (settings?.zombie_days || 60);
    }).map((i: any) => ({ 
        ...i, 
        daysInStock: Math.floor((new Date().getTime() - new Date(i.date_added).getTime()) / (1000 * 3600 * 24)), 
        deadCapital: Number(i.landed_cost) * i.quantity,
        totalBleed: 0
    }));

    return NextResponse.json(zombies);
  } catch (e: any) {
    console.error("Oracle zombies error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
