"""
NIRVANA POS / INVENTIVE HARVEST
August & September 2026 Sales & Output VAT Audit Reports
Generates executive-ready PDF reports directly to the user's Downloads folder:
  - C:\\Users\\ashjx\\Downloads\\August sales.pdf
  - C:\\Users\\ashjx\\Downloads\\september sales.pdf
And archived copies in reports/
"""

import os
import json
import urllib.request
from datetime import datetime, date
from pathlib import Path
from collections import defaultdict

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    KeepTogether,
    HRFlowable,
)
from reportlab.pdfgen import canvas

# Paths
DOWNLOADS = Path.home() / "Downloads"
REPORTS_DIR = Path("reports")
REPORTS_DIR.mkdir(parents=True, exist_ok=True)
DOWNLOADS.mkdir(parents=True, exist_ok=True)

# Supabase Auth
API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwYmlxc2F6Y21nbHhtemJtaHhiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjQ0ODg0MiwiZXhwIjoyMDg4MDI0ODQyfQ.N7OlwIcW90sWlgwxBsPx7N2HBba5vwGLtPyhyZ7P82A"
BASE_URL = "https://tpbiqsazcmglxmzbmhxb.supabase.co/rest/v1"

# Corporate Color Palette
COLOR_NAVY = colors.HexColor("#0B2545")
COLOR_PRIMARY = colors.HexColor("#1F4D78")
COLOR_ACCENT = colors.HexColor("#2E74B5")
COLOR_MUTED = colors.HexColor("#555E68")
COLOR_LIGHT_BG = colors.HexColor("#F8FAFC")
COLOR_HEADER_BG = colors.HexColor("#0F172A")
COLOR_SUBHEADER_BG = colors.HexColor("#1E293B")
COLOR_TABLE_HEADER = colors.HexColor("#1E3A8A")
COLOR_ALT_ROW = colors.HexColor("#F1F5F9")
COLOR_BORDER = colors.HexColor("#CBD5E1")
COLOR_SUCCESS = colors.HexColor("#059669")
COLOR_SUCCESS_BG = colors.HexColor("#ECFDF5")
COLOR_ALERT = colors.HexColor("#B45309")
COLOR_ALERT_BG = colors.HexColor("#FFFBEB")


def fetch_sales(start_iso: str, end_iso: str):
    """Fetch all sales for the date range with pagination."""
    all_data = []
    limit = 1000
    offset = 0
    while True:
        url = f"{BASE_URL}/sales?date=gte.{start_iso}&date=lt.{end_iso}&select=*&limit={limit}&offset={offset}"
        req = urllib.request.Request(
            url,
            headers={
                "apikey": API_KEY,
                "Authorization": f"Bearer {API_KEY}",
            },
        )
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode())
            all_data.extend(data)
            if len(data) < limit:
                break
            offset += limit
    return [s for s in all_data if not s.get("deleted_at")]


def categorize_product(product_name: str) -> str:
    name = (product_name or "").lower()
    if "watch" in name and "box" not in name and "battery" not in name:
        return "Watches & Timepieces"
    if "perfume" in name or "diffuser" in name or "cologne" in name or "scent" in name:
        return "Perfume & Fragrances"
    if any(k in name for k in ["taser", "pepper", "baton", "cuffs", "shock", "stun"]):
        return "Self Defense & Security"
    if any(k in name for k in ["gun", "pellet", "holster", "bb", "co2", "airsoft"]):
        return "Airsoft & Outdoor"
    if any(k in name for k in ["vape", "rizla", "lighter", "crusher", "pipe", "smoke", "rolling"]):
        return "Vapes & Smoking Supplies"
    if any(k in name for k in ["guitar", "melodica", "tambourine", "drum", "stick", "strings", "harmonica", "kazoo"]):
        return "Musical Instruments"
    if any(k in name for k in ["ring", "necklace", "bracelet", "chain", "wallet", "hat", "cap", "bag", "sunglasses", "gloves", "shades", "pendant"]):
        return "Jewelry & Fashion Accessories"
    if any(k in name for k in ["tee", "shirt", "hoodie", "top", "jacket", "jersey"]):
        return "Apparel & Garments"
    if any(k in name for k in ["engraving", "wrapping", "repair", "battery", "service"]):
        return "Services & Customization"
    return "General Merchandise & Sundries"


def branch_display_name(shop_id: str) -> str:
    s = (shop_id or "").lower()
    if "dub" in s:
        return "Dubdub Outlet"
    if "kipa" in s:
        return "Kipasa Branch"
    if "tshirt" in s or "tee" in s:
        return "Nirvana Tees"
    if "trade" in s:
        return "Trade Center HQ"
    return shop_id.capitalize() if shop_id else "General Store"


class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        page_w, page_h = A4
        
        # Header (pages after page 1)
        if self._pageNumber > 1:
            self.setFont("Helvetica-Bold", 8)
            self.setFillColor(COLOR_NAVY)
            self.drawString(14 * mm, page_h - 12 * mm, "INVENTIVE HARVEST (PVT) LTD  •  NIRVANA POS")
            self.setFont("Helvetica", 7.5)
            self.setFillColor(COLOR_MUTED)
            self.drawRightString(page_w - 14 * mm, page_h - 12 * mm, getattr(self, "report_subtitle_header", "Official VAT & Sales Audit"))
            self.setStrokeColor(COLOR_BORDER)
            self.setLineWidth(0.5)
            self.line(14 * mm, page_h - 14 * mm, page_w - 14 * mm, page_h - 14 * mm)

        # Footer (all pages)
        self.setStrokeColor(COLOR_BORDER)
        self.setLineWidth(0.5)
        self.line(14 * mm, 14 * mm, page_w - 14 * mm, 14 * mm)

        self.setFont("Helvetica", 7.5)
        self.setFillColor(COLOR_MUTED)
        self.drawString(14 * mm, 10 * mm, "CONFIDENTIAL  |  Prepared for VAT Tax Assessment & Audit  |  Generated on 15 October 2026")
        self.drawRightString(page_w - 14 * mm, 10 * mm, f"Page {self._pageNumber} of {page_count}")
        self.restoreState()


def build_vat_report(month_name: str, start_iso: str, end_iso: str, output_paths: list[Path]):
    sales = fetch_sales(start_iso, end_iso)
    print(f"[{month_name}] Fetched {len(sales)} sales records.")

    # Sort sales chronologically
    sales.sort(key=lambda s: s.get("date", ""))

    # Key Totals
    total_sales_count = len(sales)
    total_units_sold = sum(int(s.get("quantity") or 1) for s in sales)
    total_net = sum(float(s.get("total_before_tax") or 0) for s in sales)
    total_tax = sum(float(s.get("tax") or 0) for s in sales)
    total_gross = sum(float(s.get("total_with_tax") or 0) for s in sales)

    avg_ticket_gross = total_gross / total_sales_count if total_sales_count else 0
    avg_ticket_net = total_net / total_sales_count if total_sales_count else 0
    effective_vat_pct = (total_tax / total_net * 100) if total_net else 0

    # Branch Aggregation
    by_branch = defaultdict(lambda: {"count": 0, "units": 0, "net": 0.0, "tax": 0.0, "gross": 0.0})
    for s in sales:
        b_name = branch_display_name(s.get("shop_id"))
        by_branch[b_name]["count"] += 1
        by_branch[b_name]["units"] += int(s.get("quantity") or 1)
        by_branch[b_name]["net"] += float(s.get("total_before_tax") or 0)
        by_branch[b_name]["tax"] += float(s.get("tax") or 0)
        by_branch[b_name]["gross"] += float(s.get("total_with_tax") or 0)

    # Payment Method Aggregation
    by_payment = defaultdict(lambda: {"count": 0, "net": 0.0, "tax": 0.0, "gross": 0.0})
    for s in sales:
        pm = (s.get("payment_method") or "Cash").strip().title()
        by_payment[pm]["count"] += 1
        by_payment[pm]["net"] += float(s.get("total_before_tax") or 0)
        by_payment[pm]["tax"] += float(s.get("tax") or 0)
        by_payment[pm]["gross"] += float(s.get("total_with_tax") or 0)

    # Daily Breakdown
    by_day = defaultdict(lambda: {"count": 0, "units": 0, "net": 0.0, "tax": 0.0, "gross": 0.0})
    for s in sales:
        d_str = s.get("date", "")[:10]
        by_day[d_str]["count"] += 1
        by_day[d_str]["units"] += int(s.get("quantity") or 1)
        by_day[d_str]["net"] += float(s.get("total_before_tax") or 0)
        by_day[d_str]["tax"] += float(s.get("tax") or 0)
        by_day[d_str]["gross"] += float(s.get("total_with_tax") or 0)

    sorted_days = sorted(by_day.keys())

    # Category Breakdown
    by_cat = defaultdict(lambda: {"count": 0, "units": 0, "net": 0.0, "tax": 0.0, "gross": 0.0})
    for s in sales:
        cat = categorize_product(s.get("item_name"))
        by_cat[cat]["count"] += 1
        by_cat[cat]["units"] += int(s.get("quantity") or 1)
        by_cat[cat]["net"] += float(s.get("total_before_tax") or 0)
        by_cat[cat]["tax"] += float(s.get("tax") or 0)
        by_cat[cat]["gross"] += float(s.get("total_with_tax") or 0)

    # Product Breakdown
    by_product = defaultdict(lambda: {"cat": "", "units": 0, "net": 0.0, "tax": 0.0, "gross": 0.0})
    for s in sales:
        p_name = (s.get("item_name") or "Unspecified Item").strip()
        by_product[p_name]["cat"] = categorize_product(p_name)
        by_product[p_name]["units"] += int(s.get("quantity") or 1)
        by_product[p_name]["net"] += float(s.get("total_before_tax") or 0)
        by_product[p_name]["tax"] += float(s.get("tax") or 0)
        by_product[p_name]["gross"] += float(s.get("total_with_tax") or 0)

    top_products = sorted(by_product.items(), key=lambda x: x[1]["gross"], reverse=True)

    # Styles
    base = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=base["Title"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=COLOR_NAVY,
        alignment=0,
        spaceAfter=2,
    )
    subtitle_style = ParagraphStyle(
        "ReportSubtitle",
        parent=base["Normal"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=13,
        textColor=COLOR_MUTED,
        spaceAfter=10,
    )
    section_h1 = ParagraphStyle(
        "SectionH1",
        parent=base["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=15,
        textColor=COLOR_PRIMARY,
        spaceBefore=10,
        spaceAfter=5,
    )
    body_style = ParagraphStyle(
        "BodyDark",
        parent=base["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11.5,
        textColor=colors.HexColor("#1E293B"),
    )
    body_bold = ParagraphStyle(
        "BodyDarkBold",
        parent=body_style,
        fontName="Helvetica-Bold",
    )
    th_style = ParagraphStyle(
        "TableHeader",
        parent=base["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=colors.white,
        alignment=1,
    )
    td_style = ParagraphStyle(
        "TableCell",
        parent=base["Normal"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor("#0F172A"),
    )
    td_right = ParagraphStyle(
        "TableCellRight",
        parent=td_style,
        alignment=2,
    )
    td_bold_right = ParagraphStyle(
        "TableCellBoldRight",
        parent=td_style,
        fontName="Helvetica-Bold",
        alignment=2,
    )
    td_center = ParagraphStyle(
        "TableCellCenter",
        parent=td_style,
        alignment=1,
    )

    story = []

    # Title Block
    story.append(Paragraph(f"INVENTIVE HARVEST (PVT) LTD — NIRVANA POS", ParagraphStyle("CompanyTag", fontName="Helvetica-Bold", fontSize=10, leading=12, textColor=COLOR_ACCENT, spaceAfter=2)))
    story.append(Paragraph(f"{month_name.upper()} 2026 SALES & OUTPUT VAT AUDIT REPORT", title_style))
    story.append(Paragraph(f"Official Turnover, Standard Output Tax Liability & Sales Breakdown for Monthly VAT Return Filing  |  Tax Jurisdiction: Zimbabwe (ZIMRA)", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=COLOR_PRIMARY, spaceBefore=0, spaceAfter=8))

    # SECTION 1: EXECUTIVE VAT RETURN CERTIFICATE / SUMMARY
    story.append(Paragraph("1. EXECUTIVE VAT RETURN & TURNOVER SUMMARY", section_h1))
    
    exec_data = [
        [
            Paragraph("<b>Tax Period:</b>", td_style),
            Paragraph(f"01 {month_name} 2026 – {sorted_days[-1][-2:]} {month_name} 2026", td_style),
            Paragraph("<b>Total Sales Transactions:</b>", td_style),
            Paragraph(f"<b>{total_sales_count:,}</b> receipts", td_style),
        ],
        [
            Paragraph("<b>Reporting Currency:</b>", td_style),
            Paragraph("United States Dollar (USD $)", td_style),
            Paragraph("<b>Total Inventory Units Sold:</b>", td_style),
            Paragraph(f"<b>{total_units_sold:,}</b> items", td_style),
        ],
        [
            Paragraph("<b>Tax Standard:</b>", td_style),
            Paragraph("Standard Rated POS Sales (15.5%)", td_style),
            Paragraph("<b>Average Ticket (Gross):</b>", td_style),
            Paragraph(f"${avg_ticket_gross:,.2f}", td_style),
        ],
        [
            Paragraph("<b>Active Outlets:</b>", td_style),
            Paragraph(", ".join(sorted(by_branch.keys())), td_style),
            Paragraph("<b>Average Ticket (Net):</b>", td_style),
            Paragraph(f"${avg_ticket_net:,.2f}", td_style),
        ],
    ]
    t_exec = Table(exec_data, colWidths=[36 * mm, 50 * mm, 46 * mm, 50 * mm])
    t_exec.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), COLOR_LIGHT_BG),
        ("BOX", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, COLOR_BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(t_exec)
    story.append(Spacer(1, 4 * mm))

    # Big 3 Metric Cards for Tax Filing
    tax_boxes = [
        [
            Paragraph("<b>TAXABLE TURNOVER (NET SALES)</b><br/><font size='5'>Excluding VAT / Net Taxable Base</font>", ParagraphStyle("TB1", fontName="Helvetica", fontSize=7.5, leading=9, alignment=1, textColor=COLOR_NAVY)),
            Paragraph("<b>OUTPUT VAT COLLECTED (15.5%)</b><br/><font size='5'>Tax Liability Due to ZIMRA</font>", ParagraphStyle("TB2", fontName="Helvetica", fontSize=7.5, leading=9, alignment=1, textColor=colors.HexColor("#991B1B"))),
            Paragraph("<b>GROSS SALES TURNOVER</b><br/><font size='5'>Total Revenue Collected (Gross)</font>", ParagraphStyle("TB3", fontName="Helvetica", fontSize=7.5, leading=9, alignment=1, textColor=COLOR_SUCCESS)),
        ],
        [
            Paragraph(f"<font size='14'><b>${total_net:,.2f}</b></font>", ParagraphStyle("TBVal1", fontName="Helvetica-Bold", alignment=1, textColor=COLOR_NAVY)),
            Paragraph(f"<font size='14'><b>${total_tax:,.2f}</b></font>", ParagraphStyle("TBVal2", fontName="Helvetica-Bold", alignment=1, textColor=colors.HexColor("#991B1B"))),
            Paragraph(f"<font size='14'><b>${total_gross:,.2f}</b></font>", ParagraphStyle("TBVal3", fontName="Helvetica-Bold", alignment=1, textColor=COLOR_SUCCESS)),
        ],
        [
            Paragraph(f"Effective Rate: <b>{effective_vat_pct:.2f}%</b>", ParagraphStyle("TBS1", fontName="Helvetica", fontSize=7, leading=8.5, alignment=1, textColor=COLOR_MUTED)),
            Paragraph("Formula: [Gross - Net]", ParagraphStyle("TBS2", fontName="Helvetica", fontSize=7, leading=8.5, alignment=1, textColor=COLOR_MUTED)),
            Paragraph(f"Total Transactions: <b>{total_sales_count}</b>", ParagraphStyle("TBS3", fontName="Helvetica", fontSize=7, leading=8.5, alignment=1, textColor=COLOR_MUTED)),
        ]
    ]
    t_cards = Table(tax_boxes, colWidths=[60 * mm, 62 * mm, 60 * mm])
    t_cards.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#EFF6FF")),
        ("BACKGROUND", (1, 0), (1, -1), colors.HexColor("#FEF2F2")),
        ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#ECFDF5")),
        ("BOX", (0, 0), (0, -1), 1, colors.HexColor("#BFDBFE")),
        ("BOX", (1, 0), (1, -1), 1, colors.HexColor("#FECACA")),
        ("BOX", (2, 0), (2, -1), 1, colors.HexColor("#A7F3D0")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
    ]))
    story.append(t_cards)
    story.append(Spacer(1, 5 * mm))

    # SECTION 2: BRANCH & OUTLET VAT RECONCILIATION
    story.append(Paragraph("2. BRANCH & OUTLET RECONCILIATION (TURNOVER & VAT SPLIT)", section_h1))
    
    branch_rows = [
        [
            Paragraph("<b>Retail Branch / Outlet</b>", th_style),
            Paragraph("<b>Tx Count</b>", th_style),
            Paragraph("<b>Units Sold</b>", th_style),
            Paragraph("<b>Net Sales (Excl. VAT)</b>", th_style),
            Paragraph("<b>Output VAT (15.5%)</b>", th_style),
            Paragraph("<b>Gross Sales (Incl. VAT)</b>", th_style),
            Paragraph("<b>Share %</b>", th_style),
        ]
    ]

    for b_name in sorted(by_branch.keys(), key=lambda k: by_branch[k]["gross"], reverse=True):
        b = by_branch[b_name]
        share = (b["gross"] / total_gross * 100) if total_gross else 0
        branch_rows.append([
            Paragraph(f"<b>{b_name}</b>", td_style),
            Paragraph(f"{b['count']:,}", td_center),
            Paragraph(f"{b['units']:,}", td_center),
            Paragraph(f"${b['net']:,.2f}", td_right),
            Paragraph(f"${b['tax']:,.2f}", td_right),
            Paragraph(f"${b['gross']:,.2f}", td_bold_right),
            Paragraph(f"{share:.1f}%", td_center),
        ])

    # Branch Total Row
    branch_rows.append([
        Paragraph("<b>CONSOLIDATED TOTAL</b>", ParagraphStyle("THL", parent=td_style, fontName="Helvetica-Bold", textColor=COLOR_NAVY)),
        Paragraph(f"<b>{total_sales_count:,}</b>", ParagraphStyle("THC", parent=td_center, fontName="Helvetica-Bold", textColor=COLOR_NAVY)),
        Paragraph(f"<b>{total_units_sold:,}</b>", ParagraphStyle("THC2", parent=td_center, fontName="Helvetica-Bold", textColor=COLOR_NAVY)),
        Paragraph(f"<b>${total_net:,.2f}</b>", ParagraphStyle("THR1", parent=td_right, fontName="Helvetica-Bold", textColor=COLOR_NAVY)),
        Paragraph(f"<b>${total_tax:,.2f}</b>", ParagraphStyle("THR2", parent=td_right, fontName="Helvetica-Bold", textColor=colors.HexColor("#991B1B"))),
        Paragraph(f"<b>${total_gross:,.2f}</b>", ParagraphStyle("THR3", parent=td_bold_right, fontName="Helvetica-Bold", textColor=COLOR_SUCCESS)),
        Paragraph("<b>100.0%</b>", ParagraphStyle("THC3", parent=td_center, fontName="Helvetica-Bold", textColor=COLOR_NAVY)),
    ])

    t_branch = Table(branch_rows, colWidths=[42 * mm, 18 * mm, 18 * mm, 29 * mm, 27 * mm, 31 * mm, 17 * mm])
    t_branch.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), COLOR_PRIMARY),
        ("GRID", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, COLOR_ALT_ROW]),
        ("BACKGROUND", (0, -1), (-1, -1), COLOR_LIGHT_BG),
        ("LINEABOVE", (0, -1), (-1, -1), 1.2, COLOR_PRIMARY),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(t_branch)
    story.append(Spacer(1, 4 * mm))

    # SECTION 3: SETTLEMENT & PAYMENT METHODS BREAKDOWN
    story.append(Paragraph("3. PAYMENT METHODS & SETTLEMENT SUMMARY", section_h1))
    pm_rows = [
        [
            Paragraph("<b>Payment Method</b>", th_style),
            Paragraph("<b>Transactions</b>", th_style),
            Paragraph("<b>Net Amount (USD)</b>", th_style),
            Paragraph("<b>Output VAT (USD)</b>", th_style),
            Paragraph("<b>Gross Collected (USD)</b>", th_style),
            Paragraph("<b>Share %</b>", th_style),
        ]
    ]
    for pm in sorted(by_payment.keys(), key=lambda k: by_payment[k]["gross"], reverse=True):
        p = by_payment[pm]
        pm_share = (p["gross"] / total_gross * 100) if total_gross else 0
        pm_rows.append([
            Paragraph(f"<b>{pm}</b>", td_style),
            Paragraph(f"{p['count']:,}", td_center),
            Paragraph(f"${p['net']:,.2f}", td_right),
            Paragraph(f"${p['tax']:,.2f}", td_right),
            Paragraph(f"${p['gross']:,.2f}", td_bold_right),
            Paragraph(f"{pm_share:.2f}%", td_center),
        ])
    pm_rows.append([
        Paragraph("<b>TOTAL SETTLED</b>", ParagraphStyle("THLP", parent=td_style, fontName="Helvetica-Bold", textColor=COLOR_NAVY)),
        Paragraph(f"<b>{total_sales_count:,}</b>", ParagraphStyle("THCP", parent=td_center, fontName="Helvetica-Bold", textColor=COLOR_NAVY)),
        Paragraph(f"<b>${total_net:,.2f}</b>", ParagraphStyle("THRP1", parent=td_right, fontName="Helvetica-Bold", textColor=COLOR_NAVY)),
        Paragraph(f"<b>${total_tax:,.2f}</b>", ParagraphStyle("THRP2", parent=td_right, fontName="Helvetica-Bold", textColor=colors.HexColor("#991B1B"))),
        Paragraph(f"<b>${total_gross:,.2f}</b>", ParagraphStyle("THRP3", parent=td_bold_right, fontName="Helvetica-Bold", textColor=COLOR_SUCCESS)),
        Paragraph("<b>100.0%</b>", ParagraphStyle("THCP3", parent=td_center, fontName="Helvetica-Bold", textColor=COLOR_NAVY)),
    ])
    t_pm = Table(pm_rows, colWidths=[42 * mm, 24 * mm, 32 * mm, 30 * mm, 34 * mm, 20 * mm])
    t_pm.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), COLOR_ACCENT),
        ("GRID", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, COLOR_ALT_ROW]),
        ("BACKGROUND", (0, -1), (-1, -1), COLOR_LIGHT_BG),
        ("LINEABOVE", (0, -1), (-1, -1), 1.2, COLOR_ACCENT),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(t_pm)

    # PAGE BREAK FOR DAILY LEDGER
    story.append(PageBreak())

    # SECTION 4: COMPLETE DAILY SALES & VAT AUDIT TRAIL
    story.append(Paragraph("4. DAILY SALES & OUTPUT VAT AUDIT LEDGER", section_h1))
    story.append(Paragraph("Detailed day-by-day tax reconciliation showing transaction volume, net taxable turnover, output tax, and cumulative gross turnover.", body_style))
    story.append(Spacer(1, 2 * mm))

    daily_rows = [
        [
            Paragraph("<b>Date</b>", th_style),
            Paragraph("<b>Day</b>", th_style),
            Paragraph("<b>Invoices</b>", th_style),
            Paragraph("<b>Units</b>", th_style),
            Paragraph("<b>Net Sales ($)</b>", th_style),
            Paragraph("<b>Output VAT ($)</b>", th_style),
            Paragraph("<b>Gross Sales ($)</b>", th_style),
            Paragraph("<b>Cumulative ($)</b>", th_style),
        ]
    ]

    running_gross = 0.0
    for d_str in sorted_days:
        d = by_day[d_str]
        dt = datetime.strptime(d_str, "%Y-%m-%d")
        day_name = dt.strftime("%a")
        running_gross += d["gross"]
        daily_rows.append([
            Paragraph(d_str, td_center),
            Paragraph(day_name, td_center),
            Paragraph(f"{d['count']}", td_center),
            Paragraph(f"{d['units']}", td_center),
            Paragraph(f"${d['net']:,.2f}", td_right),
            Paragraph(f"${d['tax']:,.2f}", td_right),
            Paragraph(f"${d['gross']:,.2f}", td_bold_right),
            Paragraph(f"${running_gross:,.2f}", td_right),
        ])

    # Daily Table Total
    daily_rows.append([
        Paragraph("<b>MONTH TOTAL</b>", ParagraphStyle("THLD", parent=td_style, fontName="Helvetica-Bold", textColor=COLOR_NAVY)),
        Paragraph("<b>--</b>", ParagraphStyle("THCD1", parent=td_center, fontName="Helvetica-Bold", textColor=COLOR_NAVY)),
        Paragraph(f"<b>{total_sales_count:,}</b>", ParagraphStyle("THCD2", parent=td_center, fontName="Helvetica-Bold", textColor=COLOR_NAVY)),
        Paragraph(f"<b>{total_units_sold:,}</b>", ParagraphStyle("THCD3", parent=td_center, fontName="Helvetica-Bold", textColor=COLOR_NAVY)),
        Paragraph(f"<b>${total_net:,.2f}</b>", ParagraphStyle("THRD1", parent=td_right, fontName="Helvetica-Bold", textColor=COLOR_NAVY)),
        Paragraph(f"<b>${total_tax:,.2f}</b>", ParagraphStyle("THRD2", parent=td_right, fontName="Helvetica-Bold", textColor=colors.HexColor("#991B1B"))),
        Paragraph(f"<b>${total_gross:,.2f}</b>", ParagraphStyle("THRD3", parent=td_bold_right, fontName="Helvetica-Bold", textColor=COLOR_SUCCESS)),
        Paragraph(f"<b>${total_gross:,.2f}</b>", ParagraphStyle("THRD4", parent=td_right, fontName="Helvetica-Bold", textColor=COLOR_SUCCESS)),
    ])

    t_daily = Table(daily_rows, colWidths=[24 * mm, 14 * mm, 16 * mm, 14 * mm, 28 * mm, 27 * mm, 29 * mm, 30 * mm])
    t_daily.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), COLOR_HEADER_BG),
        ("GRID", (0, 0), (-1, -1), 0.4, COLOR_BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, COLOR_ALT_ROW]),
        ("BACKGROUND", (0, -1), (-1, -1), COLOR_LIGHT_BG),
        ("LINEABOVE", (0, -1), (-1, -1), 1.2, COLOR_PRIMARY),
        ("TOPPADDING", (0, 0), (-1, -1), 2.2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.2),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(t_daily)

    # PAGE BREAK FOR CATEGORY & PRODUCT BREAKDOWN
    story.append(PageBreak())

    # SECTION 5: CATEGORY / DEPARTMENT BREAKDOWN
    story.append(Paragraph("5. PRODUCT CATEGORY & COMMODITY BREAKDOWN", section_h1))
    story.append(Paragraph("Turnover and Output VAT grouped by merchandise department for inventory classification and commodity tax records.", body_style))
    story.append(Spacer(1, 2 * mm))

    cat_rows = [
        [
            Paragraph("<b>Commodity Department</b>", th_style),
            Paragraph("<b>Tx Count</b>", th_style),
            Paragraph("<b>Units Sold</b>", th_style),
            Paragraph("<b>Net Sales (Excl. VAT)</b>", th_style),
            Paragraph("<b>Output VAT (15.5%)</b>", th_style),
            Paragraph("<b>Gross Turnover</b>", th_style),
            Paragraph("<b>Share %</b>", th_style),
        ]
    ]

    for c_name in sorted(by_cat.keys(), key=lambda k: by_cat[k]["gross"], reverse=True):
        c = by_cat[c_name]
        c_share = (c["gross"] / total_gross * 100) if total_gross else 0
        cat_rows.append([
            Paragraph(f"<b>{c_name}</b>", td_style),
            Paragraph(f"{c['count']:,}", td_center),
            Paragraph(f"{c['units']:,}", td_center),
            Paragraph(f"${c['net']:,.2f}", td_right),
            Paragraph(f"${c['tax']:,.2f}", td_right),
            Paragraph(f"${c['gross']:,.2f}", td_bold_right),
            Paragraph(f"{c_share:.1f}%", td_center),
        ])

    cat_rows.append([
        Paragraph("<b>CONSOLIDATED CATEGORIES</b>", ParagraphStyle("THLC", parent=td_style, fontName="Helvetica-Bold", textColor=COLOR_NAVY)),
        Paragraph(f"<b>{total_sales_count:,}</b>", ParagraphStyle("THCC1", parent=td_center, fontName="Helvetica-Bold", textColor=COLOR_NAVY)),
        Paragraph(f"<b>{total_units_sold:,}</b>", ParagraphStyle("THCC2", parent=td_center, fontName="Helvetica-Bold", textColor=COLOR_NAVY)),
        Paragraph(f"<b>${total_net:,.2f}</b>", ParagraphStyle("THRC1", parent=td_right, fontName="Helvetica-Bold", textColor=COLOR_NAVY)),
        Paragraph(f"<b>${total_tax:,.2f}</b>", ParagraphStyle("THRC2", parent=td_right, fontName="Helvetica-Bold", textColor=colors.HexColor("#991B1B"))),
        Paragraph(f"<b>${total_gross:,.2f}</b>", ParagraphStyle("THRC3", parent=td_bold_right, fontName="Helvetica-Bold", textColor=COLOR_SUCCESS)),
        Paragraph("<b>100.0%</b>", ParagraphStyle("THCC3", parent=td_center, fontName="Helvetica-Bold", textColor=COLOR_NAVY)),
    ])

    t_cat = Table(cat_rows, colWidths=[48 * mm, 18 * mm, 18 * mm, 27 * mm, 25 * mm, 29 * mm, 17 * mm])
    t_cat.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), COLOR_SUBHEADER_BG),
        ("GRID", (0, 0), (-1, -1), 0.4, COLOR_BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, COLOR_ALT_ROW]),
        ("BACKGROUND", (0, -1), (-1, -1), COLOR_LIGHT_BG),
        ("LINEABOVE", (0, -1), (-1, -1), 1.2, COLOR_PRIMARY),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(t_cat)
    story.append(Spacer(1, 4 * mm))

    # SECTION 6: TOP 25 SELLING PRODUCTS BY GROSS REVENUE
    story.append(Paragraph("6. TOP 25 SELLING PRODUCTS (VOLUME & VALUE LEADERBOARD)", section_h1))
    
    top_rows = [
        [
            Paragraph("<b>#</b>", th_style),
            Paragraph("<b>Product / Item Description</b>", th_style),
            Paragraph("<b>Category</b>", th_style),
            Paragraph("<b>Units</b>", th_style),
            Paragraph("<b>Net Amount ($)</b>", th_style),
            Paragraph("<b>VAT ($)</b>", th_style),
            Paragraph("<b>Gross Total ($)</b>", th_style),
        ]
    ]

    for idx, (p_name, p_data) in enumerate(top_products[:25], 1):
        top_rows.append([
            Paragraph(f"{idx}", td_center),
            Paragraph(p_name, td_style),
            Paragraph(p_data["cat"][:20], td_style),
            Paragraph(f"{p_data['units']:,}", td_center),
            Paragraph(f"${p_data['net']:,.2f}", td_right),
            Paragraph(f"${p_data['tax']:,.2f}", td_right),
            Paragraph(f"${p_data['gross']:,.2f}", td_bold_right),
        ])

    t_top = Table(top_rows, colWidths=[10 * mm, 56 * mm, 38 * mm, 16 * mm, 20 * mm, 18 * mm, 24 * mm])
    t_top.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), COLOR_TABLE_HEADER),
        ("GRID", (0, 0), (-1, -1), 0.4, COLOR_BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, COLOR_ALT_ROW]),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(t_top)

    # PAGE BREAK FOR COMPREHENSIVE PRODUCT REGISTER
    story.append(PageBreak())

    # SECTION 7: MASTER PRODUCT SALES REGISTER
    story.append(Paragraph("7. MASTER PRODUCT SALES REGISTER (ALL ITEMS AUDIT LIST)", section_h1))
    story.append(Paragraph(f"Exhaustive listing of all {len(top_products)} inventory lines sold during {month_name} 2026, certified for sales tax audits.", body_style))
    story.append(Spacer(1, 2 * mm))

    all_prod_rows = [
        [
            Paragraph("<b>#</b>", th_style),
            Paragraph("<b>Product / Item Description</b>", th_style),
            Paragraph("<b>Units Sold</b>", th_style),
            Paragraph("<b>Net Sales ($)</b>", th_style),
            Paragraph("<b>Output VAT ($)</b>", th_style),
            Paragraph("<b>Gross Sales ($)</b>", th_style),
        ]
    ]

    for idx, (p_name, p_data) in enumerate(top_products, 1):
        all_prod_rows.append([
            Paragraph(f"{idx}", td_center),
            Paragraph(p_name, td_style),
            Paragraph(f"{p_data['units']:,}", td_center),
            Paragraph(f"${p_data['net']:,.2f}", td_right),
            Paragraph(f"${p_data['tax']:,.2f}", td_right),
            Paragraph(f"${p_data['gross']:,.2f}", td_bold_right),
        ])

    all_prod_rows.append([
        Paragraph("<b>TOTAL</b>", ParagraphStyle("THLM", parent=td_style, fontName="Helvetica-Bold", textColor=COLOR_NAVY)),
        Paragraph(f"<b>{len(top_products)} Distinct Products</b>", ParagraphStyle("THLM2", parent=td_style, fontName="Helvetica-Bold", textColor=COLOR_NAVY)),
        Paragraph(f"<b>{total_units_sold:,}</b>", ParagraphStyle("THCM", parent=td_center, fontName="Helvetica-Bold", textColor=COLOR_NAVY)),
        Paragraph(f"<b>${total_net:,.2f}</b>", ParagraphStyle("THRM1", parent=td_right, fontName="Helvetica-Bold", textColor=COLOR_NAVY)),
        Paragraph(f"<b>${total_tax:,.2f}</b>", ParagraphStyle("THRM2", parent=td_right, fontName="Helvetica-Bold", textColor=colors.HexColor("#991B1B"))),
        Paragraph(f"<b>${total_gross:,.2f}</b>", ParagraphStyle("THRM3", parent=td_bold_right, fontName="Helvetica-Bold", textColor=COLOR_SUCCESS)),
    ])

    t_all_prod = Table(all_prod_rows, colWidths=[12 * mm, 78 * mm, 22 * mm, 24 * mm, 22 * mm, 24 * mm], repeatRows=1)
    t_all_prod.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), COLOR_HEADER_BG),
        ("GRID", (0, 0), (-1, -1), 0.4, COLOR_BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, COLOR_ALT_ROW]),
        ("BACKGROUND", (0, -1), (-1, -1), COLOR_LIGHT_BG),
        ("LINEABOVE", (0, -1), (-1, -1), 1.2, COLOR_PRIMARY),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(t_all_prod)

    # Verification Sign-off block
    story.append(Spacer(1, 6 * mm))
    sign_block = [
        [
            Paragraph("<b>Prepared By:</b> POS System Administrator / Financial Controller<br/>Date: 15 October 2026", td_style),
            Paragraph("<b>Submitted For:</b> Monthly VAT Filing & Assessment (ZIMRA)<br/>Status: Verified from POS Database Records", td_style),
        ]
    ]
    t_sign = Table(sign_block, colWidths=[91 * mm, 91 * mm])
    t_sign.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ("BACKGROUND", (0, 0), (-1, -1), COLOR_LIGHT_BG),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(KeepTogether(t_sign))

    # Build PDF for primary target, then copy to other destinations if needed
    primary_path = output_paths[0]
    doc = SimpleDocTemplate(
        str(primary_path),
        pagesize=A4,
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
    )
    # Custom canvas with dynamic subtitle
    def make_canvas(*args, **kwargs):
        c = NumberedCanvas(*args, **kwargs)
        c.report_subtitle_header = f"{month_name} 2026 Sales & Output VAT Audit"
        return c

    doc.build(story, canvasmaker=make_canvas)
    print(f"Successfully generated: {primary_path} ({primary_path.stat().st_size:,} bytes)")

    import shutil
    for other_path in output_paths[1:]:
        if other_path.resolve() != primary_path.resolve():
            shutil.copyfile(primary_path, other_path)
            print(f"Copied to: {other_path} ({other_path.stat().st_size:,} bytes)")


def main():
    print("=" * 60)
    print("Generating August and September 2026 Sales & VAT Reports...")
    print("=" * 60)

    # Targets for August
    aug_downloads = DOWNLOADS / "August sales.pdf"
    aug_report = REPORTS_DIR / "August_2026_Sales_and_VAT_Report.pdf"
    build_vat_report(
        month_name="August",
        start_iso="2026-08-01T00:00:00Z",
        end_iso="2026-09-01T00:00:00Z",
        output_paths=[aug_downloads, aug_report],
    )

    # Targets for September
    sep_downloads = DOWNLOADS / "september sales.pdf"
    sep_downloads_cap = DOWNLOADS / "September sales.pdf"  # for compatibility
    sep_report = REPORTS_DIR / "September_2026_Sales_and_VAT_Report.pdf"
    build_vat_report(
        month_name="September",
        start_iso="2026-09-01T00:00:00Z",
        end_iso="2026-10-01T00:00:00Z",
        output_paths=[sep_downloads, sep_downloads_cap, sep_report],
    )

    print("=" * 60)
    print("ALL REPORTS GENERATED SUCCESSFULLY!")
    print(f"Downloads:")
    print(f"  - {aug_downloads}")
    print(f"  - {sep_downloads}")
    print("=" * 60)


if __name__ == "__main__":
    main()
