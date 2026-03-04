import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function wrapText(text: string, maxChars: number) {
  const out: string[] = [];
  const lines = String(text || "").split("\n");
  for (const ln of lines) {
    const words = ln.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let cur = "";
    for (const w of words) {
      if (!cur) {
        cur = w;
        continue;
      }
      if ((cur + " " + w).length > maxChars) {
        out.push(cur);
        cur = w;
      } else {
        cur = cur + " " + w;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

export async function GET() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const page1 = pdf.addPage([595.28, 841.89]); // A4
  const page2 = pdf.addPage([595.28, 841.89]);

  const margin = 48;
  const colorText = rgb(0.1, 0.14, 0.22);
  const colorMuted = rgb(0.38, 0.45, 0.55);

  const draw = (
    page: any,
    state: { y: number },
    text: string,
    opts?: { size?: number; isBold?: boolean; muted?: boolean; gap?: number; wrap?: number }
  ) => {
    const size = opts?.size ?? 11;
    const isBold = opts?.isBold ?? false;
    const muted = opts?.muted ?? false;
    const gap = opts?.gap ?? 6;
    const wrap = opts?.wrap ?? 92;
    const lines = wrapText(text, wrap);
    for (const ln of lines) {
      page.drawText(ln, {
        x: margin,
        y: state.y,
        size,
        font: isBold ? bold : font,
        color: muted ? colorMuted : colorText,
      });
      state.y -= size + gap;
    }
  };

  const s1 = { y: 841.89 - margin };
  draw(page1, s1, "NIRVANA", { size: 18, isBold: true, gap: 4 });
  draw(page1, s1, "Tax System Guide (Option 1 and Option 2)", { size: 14, isBold: true });
  draw(page1, s1, `Generated: ${new Date().toLocaleString()}`, { size: 10, muted: true, gap: 10 });

  draw(page1, s1, "Where to configure", { size: 12, isBold: true });
  draw(
    page1,
    s1,
    "Go to Admin Settings -> ZIMRA Fiscal Strategy. You will see: Global Tax Rate (%), Tax Threshold ($), and Tax Applicability Mode.",
    { wrap: 96, gap: 10 }
  );

  draw(page1, s1, "Option 1: Flat (All transactions taxed)", { size: 12, isBold: true });
  draw(
    page1,
    s1,
    "What it does: Every sale line is taxed using the Global Tax Rate. This is the simplest mode and easiest to reconcile.",
    { wrap: 96 }
  );
  draw(
    page1,
    s1,
    "How to use it:\n1) Set Tax Applicability Mode = Flat/All\n2) Set Global Tax Rate (e.g. 15.5%)\n3) Run normal sales in POS\n4) Use Tax Ledger to see itemized VAT per transaction",
    { wrap: 96 }
  );
  draw(
    page1,
    s1,
    "Example: If a line has Total Before Tax = $100 and tax rate is 15.5%, tax recorded is $15.50 and total with tax is $115.50.",
    { wrap: 96, gap: 10 }
  );

  draw(page1, s1, "Option 2: Above-threshold mode (Selective VAT)", { size: 12, isBold: true });
  draw(
    page1,
    s1,
    "What it does: VAT is only applied when the unit price meets/exceeds the threshold. In code, the check is based on (totalBeforeTax / quantity) compared to Tax Threshold.",
    { wrap: 96 }
  );
  draw(
    page1,
    s1,
    "How to use it:\n1) Set Tax Applicability Mode = Above Threshold\n2) Set Tax Threshold ($)\n3) Set Global Tax Rate\n4) Sell normally. Lines below threshold record tax as $0.",
    { wrap: 96, gap: 10 }
  );

  const s2 = { y: 841.89 - margin };
  draw(page2, s2, "NIRVANA", { size: 18, isBold: true, gap: 4 });
  draw(page2, s2, "Practical notes and best practices", { size: 14, isBold: true, gap: 10 });

  draw(page2, s2, "How the Tax Ledger should be read", { size: 12, isBold: true });
  draw(
    page2,
    s2,
    "The Tax Ledger page totals tax from recorded sales. If you use returns/credit notes, those are recorded as negative tax and will reduce net VAT payable.",
    { wrap: 96, gap: 10 }
  );

  draw(page2, s2, "Returns/Credit notes (recommended for accuracy)", { size: 12, isBold: true });
  draw(
    page2,
    s2,
    "If a sale is reversed, issue a credit note (Return). This creates a negative entry that reduces totals and VAT. This is standard compliance and prevents VAT overpayment.",
    { wrap: 96 }
  );
  draw(
    page2,
    s2,
    "POS -> Return button:\n- Enter Sale ID\n- Enter Quantity to reverse\n- Choose reason + restock yes/no\n- Submit. The Tax Ledger will mark it as CREDIT.",
    { wrap: 96, gap: 10 }
  );

  draw(page2, s2, "Choosing between Option 1 and Option 2", { size: 12, isBold: true });
  draw(
    page2,
    s2,
    "Option 1 (Flat) is best when you want predictable behavior and straightforward reporting.\nOption 2 (Above Threshold) is best when your compliance policy requires selective VAT based on price thresholds.",
    { wrap: 96, gap: 10 }
  );

  draw(page2, s2, "Common mistakes to avoid", { size: 12, isBold: true });
  draw(
    page2,
    s2,
    "- Changing tax settings mid-day without noting it (use audit log / document changes).\n- Issuing refunds without credit notes (causes VAT overpayment).\n- Using inconsistent pricing (inclusive vs exclusive) across shops.",
    { wrap: 96, gap: 10 }
  );

  draw(page2, s2, "Support", { size: 12, isBold: true });
  draw(
    page2,
    s2,
    "If you want, we can tailor this guide to your exact ZIMRA interpretation (invoice requirements, receipt numbering, export format) and generate a signed SOP for staff.",
    { wrap: 96 }
  );

  const bytes = await pdf.save();
  const filename = `Nirvana_Tax_Guide_${new Date().toISOString().slice(0, 10)}.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=${filename}`,
      "Cache-Control": "no-store",
    },
  });
}
