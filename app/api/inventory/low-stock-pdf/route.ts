import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PREMIUM_MULTIPLIER = 1.65;
const TAX_BUFFER = 1.155; // 15.5%

function winAnsiSafe(text: any) {
    // pdf-lib StandardFonts are WinAnsi encoded; strip unsupported unicode (emoji, private-use, etc.)
    return String(text ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[^\x20-\xFF]/g, "");
}

export async function GET() {
    try {
        // Fetch low stock items across all shops
        // Logic: Total quantity across master inventory is less than 5
        const { data: items, error } = await supabaseAdmin
            .from("inventory_items")
            .select("*")
            .lte("quantity", 5)
            .order("quantity", { ascending: true });

        if (error) throw error;

        // 3. GENERATE PDF
        const pdf = await PDFDocument.create();
        const pageSize: [number, number] = [595.28, 841.89]; // A4
        let page = pdf.addPage(pageSize);
        const { width, height } = page.getSize();
        const font = await pdf.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

        const margin = 50;
        let y = height - margin;

        const drawText = (text: string, size = 10, bold = false, color = rgb(0.1, 0.1, 0.1)) => {
            page.drawText(winAnsiSafe(text), { x: margin, y, size, font: bold ? fontBold : font, color });
            y -= size + 6;
        };

        const ensureSpace = (minY = 60) => {
            if (y >= minY) return;
            page = pdf.addPage(pageSize);
            y = height - margin;
        };

        // Header
        drawText("NIRVANA LOW STOCK REPORT", 18, true, rgb(0.5, 0.2, 0.8));
        drawText(`Generated on: ${new Date().toLocaleString()}`, 10, false, rgb(0.4, 0.4, 0.4));
        y -= 20;

        // Table Header
        const col1 = margin;
        const col2 = width - 180;
        const col3 = width - margin - 80;

        page.drawRectangle({
            x: margin - 5,
            y: y - 5,
            width: width - margin * 2 + 10,
            height: 20,
            color: rgb(0.9, 0.9, 0.95),
        });

        page.drawText(winAnsiSafe("PRODUCT"), { x: col1, y, size: 10, font: fontBold });
        page.drawText(winAnsiSafe("QTY"), { x: col2, y, size: 10, font: fontBold });
        page.drawText(winAnsiSafe("PREMIUM PRICE"), { x: col3, y, size: 10, font: fontBold });
        y -= 25;

        // Table Rows
        if (!items || items.length === 0) {
            drawText("No low stock items detected.", 10, false, rgb(0.5, 0.5, 0.5));
        } else {
            items.forEach((item: any) => {
                ensureSpace(40);
                
                const landedCost = Number(item.landed_cost || 0);
                const premiumPrice = landedCost * PREMIUM_MULTIPLIER * TAX_BUFFER;
                
                page.drawText(winAnsiSafe(String(item.name || "Unknown")), { x: col1, y, size: 9, font });
                page.drawText(winAnsiSafe(String(item.quantity || 0)), { x: col2, y, size: 9, font });
                page.drawText(winAnsiSafe(`$${premiumPrice.toFixed(2)}`), { x: col3, y, size: 9, font, color: rgb(0.1, 0.5, 0.2) });
                
                y -= 15;
                
                // Row separator
                page.drawLine({
                    start: { x: margin, y: y + 5 },
                    end: { x: width - margin, y: y + 5 },
                    thickness: 0.5,
                    color: rgb(0.8, 0.8, 0.8),
                });
            });
        }

        const bytes = await pdf.save();
        const filename = `Low_Stock_Report_${new Date().toISOString().slice(0, 10)}.pdf`;

        return new NextResponse(Buffer.from(bytes), {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename=${filename}`,
                "Cache-Control": "no-store",
            },
        });

    } catch (err) {
        console.error('Low Stock PDF generation failed:', err);
        return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
    }
}
