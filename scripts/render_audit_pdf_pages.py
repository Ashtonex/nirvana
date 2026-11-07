import fitz
from pathlib import Path

pdf_path = "reports/Stock_and_Sales_Reconciliation_Report_Oct25_to_Nov07_2026.pdf"
doc = fitz.open(pdf_path)

reports_dir = Path("reports")
artifact_dir = Path(r"C:\Users\ashjx\.gemini\antigravity\brain\07c394ec-c5a6-4249-8a88-2e3b47ac2b17")

for i, page in enumerate(doc):
    pix = page.get_pixmap(dpi=200)
    # Save to reports
    out_rep = reports_dir / f"audit_page_{i+1}.png"
    pix.save(str(out_rep))
    # Save to artifact dir
    out_art = artifact_dir / f"audit_page_{i+1}.png"
    pix.save(str(out_art))
    print(f"Rendered Page {i+1} -> {out_rep} and {out_art}")
