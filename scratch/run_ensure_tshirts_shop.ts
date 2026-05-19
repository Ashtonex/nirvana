import { supabaseAdmin } from "../lib/supabase";
import { TSHIRTS_SHOP_ID, TSHIRTS_SHOP_NAME } from "../lib/tshirts";

async function testEnsureTshirtsShop() {
    console.log("Running testEnsureTshirtsShop with shipment insert...");

    // Ensure dummy shipment exists to satisfy foreign key constraint
    const { data: shipment, error: shipmentSelectErr } = await supabaseAdmin
        .from("shipments")
        .select("id")
        .eq("id", "SERVICES-AUTO")
        .maybeSingle();

    console.log("Shipment select result:", { data: shipment, error: shipmentSelectErr });

    if (!shipment?.id) {
        console.log("SERVICES-AUTO shipment does not exist. Inserting...");
        const { error: shipmentInsertErr } = await supabaseAdmin.from("shipments").insert({
            id: "SERVICES-AUTO",
            date: new Date().toISOString(),
            supplier: "Auto Services",
            shipment_number: "SERVICES-AUTO",
            purchase_price: 0,
            shipping_cost: 0,
            duty_cost: 0,
            misc_cost: 0,
            manifest_pieces: 0,
            total_quantity: 0
        });
        console.log("Shipment insert result:", { error: shipmentInsertErr });
    }
    
    // Check shop
    const { data: shopData } = await supabaseAdmin
        .from("shops")
        .select("id")
        .eq("id", TSHIRTS_SHOP_ID)
        .maybeSingle();
    
    if (!shopData?.id) {
        console.log("Shop does not exist, inserting...");
        await supabaseAdmin.from("shops").insert({
            id: TSHIRTS_SHOP_ID,
            name: TSHIRTS_SHOP_NAME,
            expenses: { rent: 0, salaries: 0, utilities: 0, misc: 0 },
        });
    }

    // Check inventory item
    const { data: serviceItem } = await supabaseAdmin
        .from("inventory_items")
        .select("id")
        .eq("id", "service_branding")
        .maybeSingle();

    if (!serviceItem?.id) {
        console.log("Service branding item does not exist, inserting...");
        const insertRes = await supabaseAdmin.from("inventory_items").insert({
            id: "service_branding",
            shipment_id: "SERVICES-AUTO",
            name: "Branding Service",
            category: "Services",
            quantity: 999999,
            acquisition_price: 0,
            landed_cost: 0,
            date_added: new Date().toISOString()
        });
        
        console.log("Service item insert result:", { error: insertRes.error, status: insertRes.status });
        
        if (!insertRes.error) {
            console.log("Service item inserted! Inserting allocation...");
            const allocRes = await supabaseAdmin.from("inventory_allocations").insert({
                item_id: "service_branding",
                shop_id: TSHIRTS_SHOP_ID,
                quantity: 999999
            });
            console.log("Allocation insert result:", { error: allocRes.error, status: allocRes.status });
        }
    } else {
        console.log("Service branding item already exists in database!");
    }
}

testEnsureTshirtsShop();
