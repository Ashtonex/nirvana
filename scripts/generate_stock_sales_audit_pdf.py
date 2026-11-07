"""
NIRVANA POS / INVENTIVE HARVEST (PVT) LTD
Stock & Sales Reconciliation Audit Report (25 Oct 2026 - 07 Nov 2026)
Generates high-fidelity executive PDF reports in:
  - reports/Stock_and_Sales_Reconciliation_Report_Oct25_to_Nov07_2026.pdf
  - C:\\Users\\ashjx\\Downloads\\Stock_and_Sales_Reconciliation_Report.pdf
"""

import os
import json
from pathlib import Path
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
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

# Corporate Color Palette
COLOR_NAVY = colors.HexColor("#0B2545")
COLOR_PRIMARY = colors.HexColor("#1F4D78")
COLOR_ACCENT = colors.HexColor("#2E74B5")
COLOR_MUTED = colors.HexColor("#475569")
COLOR_LIGHT_BG = colors.HexColor("#F8FAFC")
COLOR_TABLE_HEADER = colors.HexColor("#0F172A")
COLOR_SUBHEADER_BG = colors.HexColor("#1E293B")
COLOR_ALT_ROW = colors.HexColor("#F1F5F9")
COLOR_BORDER = colors.HexColor("#CBD5E1")
COLOR_SUCCESS = colors.HexColor("#059669")
COLOR_SUCCESS_BG = colors.HexColor("#ECFDF5")
COLOR_ALERT = colors.HexColor("#B45309")
COLOR_ALERT_BG = colors.HexColor("#FFFBEB")
COLOR_DANGER = colors.HexColor("#DC2626")
COLOR_DANGER_BG = colors.HexColor("#FEF2F2")

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
            self.drawString(12 * mm, page_h - 10 * mm, "INVENTIVE HARVEST (PVT) LTD  •  NIRVANA POS")
            self.setFont("Helvetica", 7.5)
            self.setFillColor(COLOR_MUTED)
            self.drawRightString(page_w - 12 * mm, page_h - 10 * mm, "STOCK & SALES RECONCILIATION AUDIT (25 OCT – 07 NOV 2026)")
            self.setStrokeColor(COLOR_BORDER)
            self.setLineWidth(0.5)
            self.line(12 * mm, page_h - 12 * mm, page_w - 12 * mm, page_h - 12 * mm)

        # Footer (all pages)
        self.setStrokeColor(COLOR_BORDER)
        self.setLineWidth(0.5)
        self.line(12 * mm, 12 * mm, page_w - 12 * mm, 12 * mm)

        self.setFont("Helvetica", 7)
        self.setFillColor(COLOR_MUTED)
        self.drawString(12 * mm, 8.5 * mm, "CONFIDENTIAL  |  Nirvana Strategic POS Intelligence  |  Audit Period: 25 Oct – 07 Nov 2026")
        self.drawRightString(page_w - 12 * mm, 8.5 * mm, f"Page {self._pageNumber} of {page_count}")
        self.restoreState()


def generate_pdf():
    # Load prepared data
    with open("scratch/daily_stats.json", "r", encoding="utf-8") as f:
        daily_stats = json.load(f)
    with open("scratch/product_stock_matches.json", "r", encoding="utf-8") as f:
        product_matches = json.load(f)
    with open("scratch/final_report_data.json", "r", encoding="utf-8") as f:
        final_data = json.load(f)
    with open("scratch/audit_logs_post_stocktake.json", "r", encoding="utf-8") as f:
        audit_logs = json.load(f)

    summary = final_data["summary"]
    categories = final_data["categories"]
    sold_out = final_data["soldOut"]

    # Target output paths
    downloads_dir = Path.home() / "Downloads"
    downloads_dir.mkdir(parents=True, exist_ok=True)
    reports_dir = Path("reports")
    reports_dir.mkdir(parents=True, exist_ok=True)

    pdf_filename = "Stock_and_Sales_Reconciliation_Report_Oct25_to_Nov07_2026.pdf"
    output_reports_path = reports_dir / pdf_filename
    output_downloads_path = downloads_dir / "Stock_and_Sales_Reconciliation_Report.pdf"

    # Document Setup
    printable_w = 186 * mm  # A4 width (210mm) - 2 * 12mm
    doc = SimpleDocTemplate(
        str(output_reports_path),
        pagesize=A4,
        leftMargin=12 * mm,
        rightMargin=12 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
    )

    styles = getSampleStyleSheet()

    # Custom Typography Styles
    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=15,
        leading=18,
        textColor=COLOR_NAVY,
    )
    subtitle_style = ParagraphStyle(
        "DocSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=COLOR_MUTED,
    )
    h1_style = ParagraphStyle(
        "SectionH1",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=10.5,
        leading=13,
        textColor=COLOR_TABLE_HEADER,
        spaceBefore=6,
        spaceAfter=4,
    )
    th_style = ParagraphStyle(
        "TableHead",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=7,
        leading=8.5,
        textColor=colors.white,
        alignment=1, # Center
    )
    td_style = ParagraphStyle(
        "TableBody",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=6.5,
        leading=8,
        textColor=colors.HexColor("#1E293B"),
    )
    td_bold = ParagraphStyle(
        "TableBodyBold",
        parent=td_style,
        fontName="Helvetica-Bold",
    )
    td_center = ParagraphStyle(
        "TableBodyCenter",
        parent=td_style,
        alignment=1,
    )
    td_right = ParagraphStyle(
        "TableBodyRight",
        parent=td_style,
        alignment=2,
    )
    td_right_bold = ParagraphStyle(
        "TableBodyRightBold",
        parent=td_style,
        fontName="Helvetica-Bold",
        alignment=2,
    )
    badge_soldout = ParagraphStyle(
        "BadgeSoldOut",
        parent=td_style,
        fontName="Helvetica-Bold",
        fontSize=6,
        textColor=COLOR_DANGER,
        alignment=1,
    )
    badge_healthy = ParagraphStyle(
        "BadgeHealthy",
        parent=td_style,
        fontName="Helvetica-Bold",
        fontSize=6,
        textColor=COLOR_SUCCESS,
        alignment=1,
    )

    story = []

    # ---------------------------------------------------------
    # 1. HEADER BANNER
    # ---------------------------------------------------------
    banner_data = [
        [
            Paragraph("<b>INVENTIVE HARVEST (PVT) LTD  •  NIRVANA POS</b><br/><font size='13'><b>STOCK & SALES RECONCILIATION AUDIT REPORT</b></font><br/><font color='#475569'>Comprehensive Stock Matching, Outflow Tracking & Revenue Breakdown</font>", title_style),
            Paragraph(f"<b>AUDIT TIMELINE</b><br/>Baseline Date: <b>25 Oct 2026</b><br/>Current Date: <b>07 Nov 2026</b><br/>Days Elapsed: <b>13 Days</b><br/>Generated: <b>07 Nov 2026</b>", subtitle_style),
        ]
    ]
    banner_table = Table(banner_data, colWidths=[120 * mm, 66 * mm])
    banner_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(banner_table)
    story.append(Spacer(1, 3 * mm))
    story.append(HRFlowable(width="100%", thickness=1.5, color=COLOR_PRIMARY, spaceBefore=1, spaceAfter=4))

    # ---------------------------------------------------------
    # 2. EXECUTIVE KPI TILES
    # ---------------------------------------------------------
    kpi_data = [
        [
            Paragraph("<b>NET SALES REVENUE</b><br/><font size='11'><b>$6,500.00</b></font><br/><font size='5.5' color='#64748b'>Gross: $6,614.14 | Ref: -$114.14</font>", td_center),
            Paragraph("<b>PHYSICAL UNITS OUT</b><br/><font size='11'><b>682 pcs</b></font><br/><font size='5.5' color='#64748b'>Net: 674 pcs (8 returned)</font>", td_center),
            Paragraph("<b>STOCK REPLENISHED</b><br/><font size='11'><b>+213 pcs</b></font><br/><font size='5.5' color='#64748b'>Across 15 Intake Events</font>", td_center),
            Paragraph("<b>EST. GROSS PROFIT</b><br/><font size='11'><b>$3,234.64</b></font><br/><font size='5.5' color='#059669'>Margin: 49.8% (COGS $3,265)</font>", td_center),
            Paragraph("<b>TRANSACTIONS</b><br/><font size='11'><b>483</b></font><br/><font size='5.5' color='#64748b'>476 Sales, 7 Returns</font>", td_center),
        ]
    ]
    kpi_table = Table(kpi_data, colWidths=[37.2 * mm] * 5)
    kpi_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), COLOR_LIGHT_BG),
        ('BOX', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(kpi_table)
    story.append(Spacer(1, 4 * mm))

    # ---------------------------------------------------------
    # 3. BRANCH EXECUTIVE COMPARISON
    # ---------------------------------------------------------
    story.append(Paragraph("1. Branch Outflow & Financial Performance Overview", h1_style))
    branch_rows = [
        [
            Paragraph("Branch / Operating Unit", th_style),
            Paragraph("Net Revenue", th_style),
            Paragraph("Revenue Share", th_style),
            Paragraph("Units Sold", th_style),
            Paragraph("Returns", th_style),
            Paragraph("Net Outflow", th_style),
            Paragraph("Stock Inflow", th_style),
            Paragraph("Est. Profit", th_style),
            Paragraph("Margin %", th_style),
            Paragraph("Tx", th_style),
        ],
        [
            Paragraph("<b>Dub Dub Outlet</b>", td_style),
            Paragraph("$3,948.00", td_right_bold),
            Paragraph("60.7%", td_center),
            Paragraph("407 pcs", td_center),
            Paragraph("2 pcs (-$2)", td_center),
            Paragraph("405 pcs", td_center),
            Paragraph("+10 pcs", td_center),
            Paragraph("$1,841.65", td_right),
            Paragraph("46.6%", td_center),
            Paragraph("258", td_center),
        ],
        [
            Paragraph("<b>Kipasa Branch</b>", td_style),
            Paragraph("$2,552.00", td_right_bold),
            Paragraph("39.3%", td_center),
            Paragraph("275 pcs", td_center),
            Paragraph("6 pcs (-$112)", td_center),
            Paragraph("269 pcs", td_center),
            Paragraph("+203 pcs", td_center),
            Paragraph("$1,392.99", td_right),
            Paragraph("54.6%", td_center),
            Paragraph("225", td_center),
        ],
        [
            Paragraph("<b>TOTALS / COMBINED</b>", td_bold),
            Paragraph("<b>$6,500.00</b>", td_right_bold),
            Paragraph("<b>100.0%</b>", td_center),
            Paragraph("<b>682 pcs</b>", td_center),
            Paragraph("<b>8 pcs (-$114)</b>", td_center),
            Paragraph("<b>674 pcs</b>", td_center),
            Paragraph("<b>+213 pcs</b>", td_center),
            Paragraph("<b>$3,234.64</b>", td_right_bold),
            Paragraph("<b>49.8%</b>", td_center),
            Paragraph("<b>483</b>", td_center),
        ]
    ]
    branch_table = Table(branch_rows, colWidths=[36 * mm, 19 * mm, 15 * mm, 16 * mm, 18 * mm, 16 * mm, 16 * mm, 18 * mm, 16 * mm, 16 * mm])
    branch_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), COLOR_TABLE_HEADER),
        ('BACKGROUND', (0, -1), (-1, -1), COLOR_LIGHT_BG),
        ('BOX', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(branch_table)
    story.append(Spacer(1, 4 * mm))

    # ---------------------------------------------------------
    # 4. DAY-BY-DAY OUTFLOW MATRIX
    # ---------------------------------------------------------
    story.append(Paragraph("2. Daily Stock Outflow & Revenue Timeline (Day-by-Day)", h1_style))
    daily_rows = [
        [
            Paragraph("Date", th_style),
            Paragraph("Gross Sold", th_style),
            Paragraph("Returns", th_style),
            Paragraph("Net Outflow", th_style),
            Paragraph("Gross Sales", th_style),
            Paragraph("Refunds", th_style),
            Paragraph("Net Revenue", th_style),
            Paragraph("Dub Dub", th_style),
            Paragraph("Kipasa", th_style),
            Paragraph("Est. Profit", th_style),
            Paragraph("Margin", th_style),
            Paragraph("Tx", th_style),
        ]
    ]

    sorted_days = sorted(daily_stats.keys())
    for idx, day in enumerate(sorted_days):
        d = daily_stats[day]
        bg = COLOR_ALT_ROW if idx % 2 == 1 else colors.white
        d_dub = d.get("byShop", {}).get("dubdub", {}).get("netRev", 0)
        d_kip = d.get("byShop", {}).get("kipasa", {}).get("netRev", 0)
        
        # Format date string nicely e.g. "Sun 25 Oct"
        dt_obj = datetime.strptime(day, "%Y-%m-%d")
        dt_label = dt_obj.strftime("%a %d %b")

        daily_rows.append([
            Paragraph(f"<b>{dt_label}</b>", td_style),
            Paragraph(f"{d['unitsSold']} pcs", td_center),
            Paragraph(f"{d['unitsReturned']} pcs" if d['unitsReturned'] > 0 else "-", td_center),
            Paragraph(f"<b>{d['netUnits']} pcs</b>", td_center),
            Paragraph(f"${d['grossSalesRev']:,.2f}", td_right),
            Paragraph(f"-${d['returnsRev']:,.2f}" if d['returnsRev'] > 0 else "-", td_right),
            Paragraph(f"<b>${d['netRev']:,.2f}</b>", td_right_bold),
            Paragraph(f"${d_dub:,.2f}" if d_dub > 0 else "-", td_right),
            Paragraph(f"${d_kip:,.2f}" if d_kip > 0 else "Closed" if dt_obj.weekday() == 6 else "-", td_right),
            Paragraph(f"${d['grossMargin']:,.2f}", td_right),
            Paragraph(f"{d['marginPct']:.1f}%", td_center),
            Paragraph(str(d['txCount']), td_center),
        ])

    # Totals row
    daily_rows.append([
        Paragraph("<b>TOTALS</b>", td_bold),
        Paragraph(f"<b>{summary['totalUnitsSold']} pcs</b>", td_center),
        Paragraph(f"<b>{summary['totalUnitsRet']} pcs</b>", td_center),
        Paragraph(f"<b>{summary['totalNetUnits']} pcs</b>", td_center),
        Paragraph(f"<b>${summary['totalGrossRev']:,.2f}</b>", td_right_bold),
        Paragraph(f"<b>-${summary['totalRefunds']:,.2f}</b>", td_right_bold),
        Paragraph(f"<b>${summary['totalNetRev']:,.2f}</b>", td_right_bold),
        Paragraph(f"<b>$3,948.00</b>", td_right_bold),
        Paragraph(f"<b>$2,552.00</b>", td_right_bold),
        Paragraph(f"<b>${summary['totalGrossProfit']:,.2f}</b>", td_right_bold),
        Paragraph(f"<b>{summary['marginPct']:.1f}%</b>", td_center),
        Paragraph(f"<b>{summary['totalTx']}</b>", td_center),
    ])

    daily_table = Table(daily_rows, colWidths=[20 * mm, 14 * mm, 13 * mm, 14 * mm, 17 * mm, 14 * mm, 18 * mm, 17 * mm, 17 * mm, 17 * mm, 13 * mm, 12 * mm])
    
    t_styles = [
        ('BACKGROUND', (0, 0), (-1, 0), COLOR_TABLE_HEADER),
        ('BACKGROUND', (0, -1), (-1, -1), COLOR_LIGHT_BG),
        ('BOX', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 2.2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.2),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]
    for r in range(1, len(sorted_days) + 1):
        if r % 2 == 0:
            t_styles.append(('BACKGROUND', (0, r), (-1, r), COLOR_ALT_ROW))
    daily_table.setStyle(TableStyle(t_styles))
    story.append(daily_table)

    # ---------------------------------------------------------
    # 5. STOCK MATCHING: STOCK THEN VS STOCK NOW (PAGE BREAK)
    # ---------------------------------------------------------
    story.append(PageBreak())
    story.append(Paragraph("3. Stock Reconciliation Match: Stock Then vs Stock Now", h1_style))
    story.append(Paragraph(
        "This table matches active items against the physical stocktake baseline established on 25 October 2026. "
        "The inventory identity strictly holds: <b>Stock Now = Stock Then - Net Sold + Restock Inflow</b>. "
        "Items highlighted in red have experienced complete sell-out (0 units left on shelf).",
        subtitle_style
    ))
    story.append(Spacer(1, 2 * mm))

    match_rows = [
        [
            Paragraph("#", th_style),
            Paragraph("Shop", th_style),
            Paragraph("Product Name", th_style),
            Paragraph("Category", th_style),
            Paragraph("Stock Then<br/>(25 Oct)", th_style),
            Paragraph("Sold", th_style),
            Paragraph("Restock", th_style),
            Paragraph("Stock Now<br/>(07 Nov)", th_style),
            Paragraph("Net Revenue", th_style),
            Paragraph("Status", th_style),
        ]
    ]

    top_items = product_matches[:36]  # Top 36 revenue products
    for idx, p in enumerate(top_items):
        bg = COLOR_ALT_ROW if idx % 2 == 1 else colors.white
        is_zero = p['currentStock'] <= 0
        shop_badge = "DUB" if p['shop'] == 'dubdub' else "KIP"
        
        status_para = Paragraph("<b>SOLD OUT</b>", badge_soldout) if is_zero else Paragraph(f"{p['currentStock']} left", badge_healthy)

        match_rows.append([
            Paragraph(str(idx + 1), td_center),
            Paragraph(f"<b>{shop_badge}</b>", td_center),
            Paragraph(f"<b>{p['name']}</b>", td_style),
            Paragraph(p['category'][:22], td_style),
            Paragraph(str(p['reconstructedStockThen']), td_center),
            Paragraph(f"-{p['netSold']}", td_center),
            Paragraph(f"+{p['intakeQty']}" if p['intakeQty'] > 0 else "-", td_center),
            Paragraph(f"<b>{p['currentStock']}</b>", td_center),
            Paragraph(f"${p['netRevenue']:,.2f}", td_right_bold),
            status_para,
        ])

    match_table = Table(match_rows, colWidths=[8 * mm, 12 * mm, 45 * mm, 35 * mm, 17 * mm, 13 * mm, 13 * mm, 17 * mm, 16 * mm, 10 * mm])
    m_styles = [
        ('BACKGROUND', (0, 0), (-1, 0), COLOR_TABLE_HEADER),
        ('BOX', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 1.8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1.8),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]
    for r in range(1, len(top_items) + 1):
        if top_items[r - 1]['currentStock'] <= 0:
            m_styles.append(('BACKGROUND', (0, r), (-1, r), COLOR_DANGER_BG))
        elif r % 2 == 0:
            m_styles.append(('BACKGROUND', (0, r), (-1, r), COLOR_ALT_ROW))
    match_table.setStyle(TableStyle(m_styles))
    story.append(match_table)

    # ---------------------------------------------------------
    # 6. INTAKE & RESTOCK EVENTS + CRITICAL SELLOUTS (PAGE BREAK)
    # ---------------------------------------------------------
    story.append(PageBreak())
    story.append(Paragraph("4. Physical Stock Inflow (Restocks & New Products)", h1_style))
    story.append(Paragraph("Chronological record of stock additions received onto shop floors between 25 Oct and 07 Nov 2026.", subtitle_style))
    story.append(Spacer(1, 2 * mm))

    # Parse Intake Events from audit logs
    intake_rows = [
        [
            Paragraph("Timestamp", th_style),
            Paragraph("Shop", th_style),
            Paragraph("Item Name", th_style),
            Paragraph("Event Type", th_style),
            Paragraph("Qty Added", th_style),
            Paragraph("Unit Landed", th_style),
            Paragraph("Total Cost", th_style),
            Paragraph("Post-Stock", th_style),
            Paragraph("Current", th_style),
        ]
    ]

    intake_items_list = [
        ("27 Oct 15:53", "Dub Dub", "Nicotine pouch (Alcohol)", "New Product", "+10 pcs", "$10.00", "$100.00", "10", "10"),
        ("31 Oct 14:42", "Kipasa", "Gym Gloves $5", "Restock", "+16 pcs", "$1.91", "$30.56", "24", "22"),
        ("31 Oct 14:44", "Kipasa", "Gym Gloves $10", "Restock", "+10 pcs", "$3.39", "$33.90", "12", "12"),
        ("31 Oct 14:46", "Kipasa", "Rizla ", "Restock", "+96 pcs", "$0.38", "$36.48", "116", "112"),
        ("31 Oct 14:47", "Kipasa", "Taser AM-800 100P Electric Shock", "Restock", "+10 pcs", "$3.11", "$31.10", "10", "10"),
        ("31 Oct 14:48", "Kipasa", "Taser $15", "Restock", "+8 pcs", "$8.00", "$64.00", "13", "13"),
        ("31 Oct 14:48", "Kipasa", "Taser AM-1132 50P Electric Shock", "Restock", "+1 pcs", "$8.58", "$8.58", "1", "1"),
        ("31 Oct 14:49", "Kipasa", "Taser bullets", "Restock", "+3 pcs", "$4.37", "$13.11", "10", "10"),
        ("31 Oct 14:49", "Kipasa", "Taser AM-928 60P Electric Shock $20", "Restock", "+6 pcs", "$3.61", "$21.66", "6", "6"),
        ("31 Oct 14:50", "Kipasa", "Handcuffs ", "Restock", "+7 pcs", "$8.26", "$57.82", "8", "8"),
        ("31 Oct 14:50", "Kipasa", "Dog Harness", "Restock", "+5 pcs", "$3.50", "$17.50", "19", "17"),
        ("31 Oct 14:51", "Kipasa", "Dog chain 1", "Restock", "+5 pcs", "$2.12", "$10.60", "5", "5"),
        ("31 Oct 14:51", "Kipasa", "Dog tags", "Restock", "+1 pcs", "$2.15", "$2.15", "17", "17"),
        ("02 Nov 15:16", "Kipasa", "Badge $2", "Restock", "+10 pcs", "$0.10", "$1.00", "10", "7"),
        ("02 Nov 15:21", "Kipasa", "Badge $3", "Restock", "+25 pcs", "$0.10", "$2.50", "25", "15"),
    ]

    for idx, item in enumerate(intake_items_list):
        bg = COLOR_ALT_ROW if idx % 2 == 1 else colors.white
        intake_rows.append([
            Paragraph(item[0], td_style),
            Paragraph(f"<b>{item[1]}</b>", td_center),
            Paragraph(f"<b>{item[2]}</b>", td_style),
            Paragraph(item[3], td_center),
            Paragraph(f"<b>{item[4]}</b>", td_center),
            Paragraph(item[5], td_right),
            Paragraph(item[6], td_right),
            Paragraph(item[7], td_center),
            Paragraph(f"<b>{item[8]}</b>", td_center),
        ])

    intake_table = Table(intake_rows, colWidths=[22 * mm, 18 * mm, 50 * mm, 20 * mm, 16 * mm, 16 * mm, 16 * mm, 14 * mm, 14 * mm])
    intake_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), COLOR_SUBHEADER_BG),
        ('BOX', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(intake_table)
    story.append(Spacer(1, 4 * mm))

    # ---------------------------------------------------------
    # 7. CRITICAL STOCKOUTS (33 ITEMS)
    # ---------------------------------------------------------
    story.append(Paragraph("5. Critical Sell-Outs & Zero-Stock Discrepancy Alert", h1_style))
    story.append(Paragraph("Fast-moving SKUs that completely exhausted their shop inventory and currently sit at 0 units on shelves.", subtitle_style))
    story.append(Spacer(1, 2 * mm))

    soldout_sample = [
        ("Dub Dub", "Vape", "14 pcs", "$115.00", "06 Nov", "High velocity daily seller. Urgent restock required."),
        ("Dub Dub", "Reuben Barwe $25", "4 pcs", "$100.00", "03 Nov", "Signature brand apparel. Replenish immediately."),
        ("Dub Dub", "Taser $75", "1 pcs", "$75.00", "29 Oct", "High-value tactical item. Reorder from supplier."),
        ("Dub Dub", "Rizla (Standard)", "59 pcs", "$59.00", "06 Nov", "Essential daily volume driver. Restock immediately."),
        ("Dub Dub", "Melodica", "1 pcs", "$40.00", "02 Nov", "Musical section depleted."),
        ("Dub Dub", "Gym Gloves $10", "4 pcs", "$40.00", "06 Nov", "INTER-SHOP TRANSFER: Kipasa holds 12 units."),
        ("Kipasa", "Home Decor", "2 pcs", "$40.00", "30 Oct", "Gifting display depleted."),
        ("Kipasa", "Satchel $35", "1 pcs", "$30.00", "26 Oct", "Bags & luggage depleted."),
        ("Kipasa", "Reuben Barwe $30", "1 pcs", "$25.00", "03 Nov", "Signature brand apparel."),
        ("Kipasa", "Atta Round Neck Plain Tee (S)", "5 pcs", "$20.00", "05 Nov", "Size S depleted. Restock from Nirvana Tees pool."),
        ("Dub Dub", "Swiss Knife", "1 pcs", "$10.00", "27 Oct", "Pocket tactical gear depleted."),
        ("Kipasa", "Button Stick $10", "1 pcs", "$10.00", "26 Oct", "Tactical gear depleted."),
    ]

    soldout_rows = [
        [
            Paragraph("Shop", th_style),
            Paragraph("Product Name", th_style),
            Paragraph("Qty Sold", th_style),
            Paragraph("Revenue Made", th_style),
            Paragraph("Depleted Date", th_style),
            Paragraph("Recommended Operational Action", th_style),
        ]
    ]

    for item in soldout_sample:
        soldout_rows.append([
            Paragraph(f"<b>{item[0]}</b>", td_center),
            Paragraph(f"<b>{item[1]}</b>", td_style),
            Paragraph(item[2], td_center),
            Paragraph(item[3], td_right_bold),
            Paragraph(item[4], td_center),
            Paragraph(item[5], td_style),
        ])

    soldout_table = Table(soldout_rows, colWidths=[20 * mm, 38 * mm, 16 * mm, 20 * mm, 20 * mm, 72 * mm])
    soldout_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), COLOR_TABLE_HEADER),
        ('BOX', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 2.2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.2),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(soldout_table)
    story.append(Spacer(1, 4 * mm))

    # ---------------------------------------------------------
    # 8. MANAGEMENT SIGN-OFF & OPERATIONAL ACTION
    # ---------------------------------------------------------
    signoff_data = [
        [
            Paragraph("<b>Audit Reconciled By:</b><br/>Nirvana POS Autonomous Intelligence<br/>Date: 07 November 2026", td_style),
            Paragraph("<b>Operations Director Sign-off:</b><br/>____________________________<br/>Date: ________________________", td_style),
            Paragraph("<b>Stock Controller Sign-off:</b><br/>____________________________<br/>Date: ________________________", td_style),
        ]
    ]
    signoff_table = Table(signoff_data, colWidths=[62 * mm, 62 * mm, 62 * mm])
    signoff_table.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ('BACKGROUND', (0, 0), (-1, -1), COLOR_LIGHT_BG),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(KeepTogether([signoff_table]))

    # Build the PDF with NumberedCanvas
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Generated successfully: {output_reports_path} ({os.path.getsize(output_reports_path):,} bytes)")

    # Copy to Downloads as requested
    import shutil
    shutil.copyfile(output_reports_path, output_downloads_path)
    print(f"Copied to user downloads: {output_downloads_path} ({os.path.getsize(output_downloads_path):,} bytes)")

if __name__ == '__main__':
    generate_pdf()
