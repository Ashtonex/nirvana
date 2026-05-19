import { supabaseAdmin } from "../lib/supabase";

async function verifyBranding() {
    console.log("Checking service_branding in database...");
    const { data: item, error: itemErr } = await supabaseAdmin
        .from("inventory_items")
        .select("*")
        .eq("id", "service_branding")
        .maybeSingle();

    if (itemErr) {
        console.error("Error fetching inventory_item:", itemErr);
    } else {
        console.log("Inventory Item service_branding:", item);
    }

    const { data: alloc, error: allocErr } = await supabaseAdmin
        .from("inventory_allocations")
        .select("*")
        .eq("item_id", "service_branding");

    if (allocErr) {
        console.error("Error fetching allocations:", allocErr);
    } else {
        console.log("Allocations for service_branding:", alloc);
    }
}

verifyBranding();
