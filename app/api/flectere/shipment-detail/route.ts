import { NextResponse } from "next/server";
import { getShipmentFullData } from "@/lib/flectere/shipments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const shipmentId = url.searchParams.get("shipmentId");
    if (!shipmentId) {
      return NextResponse.json({ error: "shipmentId required" }, { status: 400 });
    }
    const data = await getShipmentFullData(shipmentId);
    if (!data) {
      return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
    }
    return NextResponse.json({ data });
  } catch (err: any) {
    console.error("[Shipment Detail] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}