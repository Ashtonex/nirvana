export function exportCsv(headers: string[], rows: string[][], filename: string) {
  const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

let _jsPDF: any = null;
let _autoTableReady = false;

export async function ensurePdfModules() {
  if (!_jsPDF) {
    const [jsPdfMod, autoTableMod] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    _jsPDF = jsPdfMod.default;
    // jspdf-autotable v5 only attaches via window.jsPDF; manually apply
    if (autoTableMod.applyPlugin) {
      autoTableMod.applyPlugin(_jsPDF);
    }
    _autoTableReady = true;
  }
}

export function generatePdf(
  title: string,
  sections: { heading: string; body: string; table?: { headers: string[]; rows: string[][] }; payload?: any }[],
  chartImages?: { img: string; heading: string }[]
) {
  if (!_jsPDF) throw new Error("jsPDF not loaded yet. Call ensurePdfModules() first.");
  const doc = new _jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const pageW = doc.internal.pageSize.getWidth();
  let y = 20;

  const addTitle = (text: string, size = 18) => {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.setFontSize(size);
    doc.text(text, pageW / 2, y, { align: "center" });
    y += 8;
  };

  const addText = (text: string, size = 9, color?: number[]) => {
    if (y > 275) { doc.addPage(); y = 20; }
    doc.setFontSize(size);
    if (color) doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(text, pageW - 28);
    doc.text(lines, 14, y);
    y += lines.length * 4.5 + 3;
    doc.setTextColor(0);
  };

  addTitle(title);
  addText(`Nirvana Intelligence · Generated ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`, 9, [100, 100, 100]);

  for (const section of sections) {
    if (y > 260) { doc.addPage(); y = 20; }

    // Section heading
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(section.heading, 14, y);
    y += 6;
    doc.setFont("helvetica", "normal");

    // Body text
    if (section.body) {
      doc.setFontSize(9);
      const lines = doc.splitTextToSize(section.body, pageW - 28);
      doc.text(lines, 14, y);
      y += lines.length * 4.5 + 3;
    }

    // Payload (ML results) — render as key-value pairs
    if (section.payload && typeof section.payload === "object") {
      doc.setFontSize(8);
      const entries = Object.entries(section.payload).slice(0, 30);
      for (const [key, val] of entries) {
        if (y > 270) { doc.addPage(); y = 20; }
        const display = typeof val === "object" ? JSON.stringify(val).slice(0, 80) : String(val);
        doc.text(`  ${key.replace(/_/g, " ")}: ${display}`, 14, y);
        y += 4;
      }
      y += 3;
    }

    // Table
    if (section.table && section.table.headers.length > 0) {
      if (y > 250) { doc.addPage(); y = 20; }
      (doc as any).autoTable({
        startY: y,
        head: [section.table.headers],
        body: section.table.rows,
        theme: "striped",
        headStyles: { fillColor: [79, 70, 229], fontSize: 8 },
        styles: { fontSize: 7, cellPadding: 1.5 },
        margin: { left: 14, right: 14 },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }
  }

  // Chart images
  if (chartImages) {
    for (const chart of chartImages) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(chart.heading, 14, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      try {
        const imgW = pageW - 28;
        const imgH = (imgW * 9) / 16;
        doc.addImage(chart.img, "PNG", 14, y, imgW, imgH);
        y += imgH + 6;
      } catch { /* skip broken image */ }
    }
  }

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text(`Nirvana Flectere BI · Page ${(doc as any).internal?.getNumberOfPages?.() || 1}`, pageW / 2, 288, { align: "center" });

  doc.save(`${title.replace(/\s+/g, "_").toLowerCase()}.pdf`);
}

export async function sendEmailReport(
  to: string,
  subject: string,
  htmlBody: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch("/api/flectere/email-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, html: htmlBody }),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error || "Failed to send" };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}