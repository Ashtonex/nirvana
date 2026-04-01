import { NextResponse } from "next/server";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { headers } from "next/headers";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams, origin } = new URL(req.url);
    const shopId = searchParams.get("shopId");
    const month = searchParams.get("month") || new Date().toISOString().substring(0, 7);
    const date = searchParams.get("date") || new Date().toISOString().split('T')[0];

    if (!shopId) return NextResponse.json({ error: "Missing shopId" }, { status: 400 });

    const headerList = await headers();
    const cookie = headerList.get("cookie") || "";

    // URLs for segments
    const segments = [
      { name: "End of Day Report", url: `${origin}/api/eod/pdf?shopId=${shopId}&date=${date}&test=true` },
      { name: "Monthly Business Report", url: `${origin}/api/reports/monthly/pdf?shopId=${shopId}&month=${month}` },
      { name: "Quarterly Strategic Report", url: `${origin}/api/reports/quarterly/pdf?shopId=${shopId}&month=${month}` },
      { name: "CEO Strategic Review", url: `${origin}/api/reports/quarterly/ceo/pdf?shopId=${shopId}&month=${month}` },
    ];

    const masterPdf = await PDFDocument.create();
    const fontBold = await masterPdf.embedFont(StandardFonts.HelveticaBold);
    const font = await masterPdf.embedFont(StandardFonts.Helvetica);

    for (const segment of segments) {
      try {
        const res = await fetch(segment.url, {
          headers: { cookie },
        });

        if (res.ok) {
          const pdfBytes = await res.arrayBuffer();
          const doc = await PDFDocument.load(pdfBytes);
          
          // Add a Section Header Page
          const headerPage = masterPdf.addPage([595.28, 841.89]);
          const { width, height } = headerPage.getSize();
          
          headerPage.drawRectangle({
            x: 0,
            y: height / 2 - 50,
            width: width,
            height: 100,
            color: rgb(0.1, 0.1, 0.3),
          });

          headerPage.drawText(segment.name.toUpperCase(), {
            x: 50,
            y: height / 2 - 10,
            size: 24,
            font: fontBold,
            color: rgb(1, 1, 1),
          });
          
          headerPage.drawText(`NIRVANA MASTER INTELLIGENCE | ${shopId.toUpperCase()}`, {
            x: 50,
            y: height / 2 - 35,
            size: 10,
            font: font,
            color: rgb(0.8, 0.8, 0.8),
          });

          const copiedPages = await masterPdf.copyPages(doc, doc.getPageIndices());
          copiedPages.forEach((page) => masterPdf.addPage(page));
        } else {
          console.warn(`Failed to fetch segment ${segment.name}: ${res.status}`);
        }
      } catch (e) {
        console.error(`Error processing segment ${segment.name}:`, e);
      }
    }

    const finalPdfBytes = await masterPdf.save();

    return new Response(finalPdfBytes as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="NIRVANA_MASTER_REPORT_${shopId}_${month}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error("Combined PDF Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
