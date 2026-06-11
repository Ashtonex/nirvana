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

export async function generatePdf(
  title: string,
  sections: { heading: string; body: string; table?: { headers: string[]; rows: string[][] } }[]
) {
  const { default: jsPDF } = await import("jspdf");
  await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const pageW = doc.internal.pageSize.getWidth();
  let y = 20;

  const addTitle = (text: string, size = 18) => {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.setFontSize(size);
    doc.text(text, pageW / 2, y, { align: "center" });
    y += 8;
  };

  const addSubtitle = (text: string) => {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(text, pageW / 2, y, { align: "center" });
    y += 6;
    doc.setTextColor(0);
  };

  addTitle(title);
  addSubtitle(`Nirvana Intelligence · Generated ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`);

  for (const section of sections) {
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(section.heading, 14, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(section.body, pageW - 28);
    doc.text(lines, 14, y);
    y += lines.length * 5 + 4;

    if (section.table && section.table.headers.length > 0) {
      if (y > 250) { doc.addPage(); y = 20; }
      (doc as any).autoTable({
        startY: y,
        head: [section.table.headers],
        body: section.table.rows,
        theme: "striped",
        headStyles: { fillColor: [79, 70, 229] },
        styles: { fontSize: 8, cellPadding: 2 },
        margin: { left: 14, right: 14 },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }
  }

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
