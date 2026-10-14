import os
import sys
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer, PageBreak
)
from reportlab.pdfgen import canvas

class DeluxeNumberedCanvas(canvas.Canvas):
    """
    Two-pass canvas drawing high-end branding, geometric header accents,
    corner framing ornaments, security borders, and professional footers.
    """
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
            self.draw_deluxe_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_deluxe_decorations(self, page_count):
        self.saveState()

        # Page Dimensions: A4 = 210mm x 297mm
        w = 210 * mm
        h = 297 * mm
        m = 8 * mm # Outer margin

        # Outer framing border (Executive Security Frame)
        self.setStrokeColor(colors.HexColor("#CBD5E1")) # slate-300
        self.setLineWidth(0.5)
        self.rect(m, m, w - 2*m, h - 2*m, fill=0)

        # Thin inner border for premium double-frame look
        self.setStrokeColor(colors.HexColor("#E2E8F0")) # slate-200
        self.setLineWidth(0.35)
        self.rect(m + 1.2*mm, m + 1.2*mm, w - 2*(m + 1.2*mm), h - 2*(m + 1.2*mm), fill=0)

        # Top Luxury Banner Accent Lines (Navy & Brushed Gold)
        self.setFillColor(colors.HexColor("#090E17")) # Obsidian Navy
        self.rect(m, h - m - 4.5*mm, w - 2*m, 4.5*mm, fill=1, stroke=0)

        # Brushed Gold Divider Line
        self.setStrokeColor(colors.HexColor("#D4AF37")) # Metallic Gold
        self.setLineWidth(1.2)
        self.line(m, h - m - 4.5*mm, w - m, h - m - 4.5*mm)

        # Corner marks in gold
        c_len = 5 * mm
        self.setStrokeColor(colors.HexColor("#D4AF37"))
        self.setLineWidth(1.0)
        # Top-left corner mark
        self.line(m + 3*mm, h - m - 1*mm, m + 3*mm + c_len, h - m - 1*mm)
        self.line(m + 3*mm, h - m - 1*mm, m + 3*mm, h - m - 1*mm - c_len)
        # Top-right corner mark
        self.line(w - m - 3*mm, h - m - 1*mm, w - m - 3*mm - c_len, h - m - 1*mm)
        self.line(w - m - 3*mm, h - m - 1*mm, w - m - 3*mm, h - m - 1*mm - c_len)

        # Top Header Micro-banner Text inside Obsidian Bar (Cleanly separated)
        self.setFont("Helvetica-Bold", 6.5)
        self.setFillColor(colors.HexColor("#D4AF37"))
        self.drawString(m + 4*mm, h - m - 3.2*mm, "NIRVANA RETAIL ENTERPRISE")
        self.setFont("Helvetica", 6)
        self.setFillColor(colors.HexColor("#CBD5E1"))
        self.drawString(m + 46*mm, h - m - 3.2*mm, "•   FINANCIAL CONTROLS, CASH MANAGEMENT & VAULT AUDIT SYSTEM")
        
        # Security doc stamp on top right
        self.setFont("Helvetica-Bold", 6)
        self.setFillColor(colors.HexColor("#F8FAFC"))
        self.drawRightString(w - m - 4*mm, h - m - 3.2*mm, "CONFIDENTIAL TILL AUDIT   |   FORM 104-REV.B")

        # Bottom Footer Accent Line
        self.setStrokeColor(colors.HexColor("#D4AF37"))
        self.setLineWidth(0.75)
        self.line(m + 2*mm, m + 6.5*mm, w - m - 2*mm, m + 6.5*mm)

        # Bottom Footer Typography (Cleanly separated, no overlap)
        self.setFont("Helvetica-Bold", 6.8)
        self.setFillColor(colors.HexColor("#090E17"))
        self.drawString(m + 4*mm, m + 3*mm, "NIRVANA AUDIT & LOSS PREVENTION")

        self.setFont("Helvetica", 6.2)
        self.setFillColor(colors.HexColor("#64748B"))
        self.drawString(m + 52*mm, m + 3*mm, "•   RETAIL CASH MANAGEMENT & AUDIT REGISTER")

        page_tag = f"PAGE {self._pageNumber} OF {page_count}   •   {'[ FRONT: CASH CONTROL & EXPENSES ]' if self._pageNumber == 1 else '[ BACK: DEPOSITS & RECONCILIATION ]'}"
        self.setFont("Helvetica-Bold", 6.5)
        self.setFillColor(colors.HexColor("#0F172A"))
        self.drawRightString(w - m - 4*mm, m + 3*mm, page_tag)

        self.restoreState()


def build_deluxe_pdf(filename="Cash_Control_Register_Deluxe.pdf"):
    # Page setup: A4 = 210mm x 297mm. Printable width = 210 - 24 = 186mm (with 12mm margins)
    doc = SimpleDocTemplate(
        filename,
        pagesize=A4,
        leftMargin=12 * mm,
        rightMargin=12 * mm,
        topMargin=16 * mm,
        bottomMargin=15 * mm
    )

    story = []

    # Palette: Luxury Executive Retail (Obsidian, Brushed Gold, Deep Navy, Emerald, Crimson, Crisp Slate)
    C_OBSIDIAN = colors.HexColor("#090E17")    # Deepest Obsidian Slate
    C_NAVY = colors.HexColor("#0F2042")        # Royal Navy
    C_GOLD = colors.HexColor("#B8860B")        # Dark Goldenrod / Brushed Gold
    C_GOLD_LIGHT = colors.HexColor("#FEF9C3")  # Soft Gold Tint
    C_GOLD_BORDER = colors.HexColor("#EAB308") # Vibrant Gold Accent
    C_SLATE_DARK = colors.HexColor("#1E293B")  # Slate 800
    C_SLATE_MUTED = colors.HexColor("#64748B") # Slate 500
    C_SLATE_BG = colors.HexColor("#F8FAFC")    # Slate 50
    C_ALT_ROW = colors.HexColor("#F1F5F9")     # Slate 100
    C_BORDER = colors.HexColor("#CBD5E1")      # Slate 300
    C_GREEN = colors.HexColor("#166534")       # Emerald 800
    C_GREEN_BG = colors.HexColor("#DCFCE7")    # Emerald 100
    C_RED = colors.HexColor("#991B1B")         # Crimson 800
    C_RED_BG = colors.HexColor("#FEE2E2")      # Crimson 100
    C_PURPLE = colors.HexColor("#3730A3")      # Indigo 800
    C_TEAL = colors.HexColor("#115E59")        # Teal 800

    styles = getSampleStyleSheet()

    # Typography styles
    brand_logo_style = ParagraphStyle(
        'BrandLogo',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=15.5,
        leading=17,
        letterSpacing=1.2,
        textColor=C_OBSIDIAN
    )

    folio_box_style = ParagraphStyle(
        'FolioBox',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7,
        leading=9.2,
        alignment=2, # Right
        textColor=C_SLATE_DARK
    )

    sec_title_style = ParagraphStyle(
        'SecTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.2,
        leading=9,
        textColor=colors.white
    )

    th_style = ParagraphStyle(
        'TableHead',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=6.5,
        leading=8,
        alignment=1, # Center
        textColor=colors.white
    )

    tb_style = ParagraphStyle(
        'TableText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=6.5,
        leading=8.2,
        textColor=C_SLATE_DARK
    )

    tb_center = ParagraphStyle(
        'TableCenter',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=6.5,
        leading=8.2,
        alignment=1,
        textColor=C_SLATE_DARK
    )

    tb_bold = ParagraphStyle(
        'TableBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=6.8,
        leading=8.4,
        textColor=C_SLATE_DARK
    )

    tb_bold_right = ParagraphStyle(
        'TableBoldRight',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=6.8,
        leading=8.4,
        alignment=2,
        textColor=C_SLATE_DARK
    )

    # =============================================================
    # PAGE 1: FRONT — DAILY CASH CONTROL & PETTY DISBURSEMENTS
    # =============================================================
    
    # 1. Executive Brand Header
    h_data = [
        [
            Paragraph("<b>NIRVANA</b> <font size=8.5 color='#B8860B'>◆</font> <font size=7.5 color='#475569'><b>RETAIL OPERATIONS</b></font><br/><font size=12.5 color='#090E17'><b>DAILY CASH CONTROL &amp; DISBURSEMENT REGISTER</b></font>", brand_logo_style),
            Paragraph("<b>REGISTER FOLIO #:</b> ___________________<br/><b>SYSTEM ID:</b> NVR-OPS-2026-V4<br/><b>MANDATORY AUDIT COMPLIANCE</b>", folio_box_style)
        ]
    ]
    t_h = Table(h_data, colWidths=[126 * mm, 60 * mm])
    t_h.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(t_h)
    story.append(Spacer(1, 2.5 * mm))

    # 2. Location & Shift Command Card
    meta_cells = [
        [
            Paragraph("<b>STORE BOUTIQUE:</b> &nbsp; [ &nbsp; ] <b>KIPASA</b> &nbsp;&nbsp;&nbsp; [ &nbsp; ] <b>DUBDUB</b> &nbsp;&nbsp;&nbsp; [ &nbsp; ] <b>TRADECENTER</b> &nbsp;&nbsp;&nbsp; [ &nbsp; ] OTHER: ____________________", tb_style),
            Paragraph("<b>DATE:</b> _____ / _____ / 202___", tb_style),
            Paragraph("<b>TILL / POS ID:</b> ___________", tb_style)
        ],
        [
            Paragraph("<b>OPERATIONAL SHIFT:</b> &nbsp; [ &nbsp; ] Morning (Opening) &nbsp;&nbsp;&nbsp; [ &nbsp; ] Evening (Closing) &nbsp;&nbsp;&nbsp; [ &nbsp; ] Full Day", tb_style),
            Paragraph("<b>SHIFT SUPERVISOR:</b> ___________________________", tb_style),
            Paragraph("<b>PRIMARY CASHIER:</b> ___________________________", tb_style)
        ]
    ]
    t_meta = Table(meta_cells, colWidths=[88 * mm, 50 * mm, 48 * mm])
    t_meta.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), C_SLATE_BG),
        ('BOX', (0,0), (-1,-1), 0.8, C_OBSIDIAN),
        ('INNERGRID', (0,0), (-1,-1), 0.5, C_BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 2.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2.5),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t_meta)
    story.append(Spacer(1, 2.5 * mm))

    # 3. Section 1: Staff Sign-In & Sign-Out / Register Custody
    s1_banner = Table([[Paragraph("<b>SECTION 01 // REGISTER ATTENDANCE &amp; CUSTODY HANDOVER</b>", sec_title_style)]], colWidths=[186 * mm])
    s1_banner.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), C_OBSIDIAN),
        ('TOPPADDING', (0,0), (-1,-1), 2.2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2.2),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(s1_banner)

    s1_head = [
        Paragraph("Staff Member Name", th_style),
        Paragraph("Designation / Role", th_style),
        Paragraph("Sign-In<br/>Time", th_style),
        Paragraph("Sign-In Signature", th_style),
        Paragraph("Sign-Out<br/>Time", th_style),
        Paragraph("Sign-Out Signature", th_style),
        Paragraph("Drawer Seal / Custody Notes", th_style)
    ]
    s1_rows = [["", "", "", "", "", "", ""] for _ in range(4)]
    t_s1 = Table([s1_head] + s1_rows, colWidths=[35*mm, 25*mm, 16*mm, 28*mm, 16*mm, 28*mm, 38*mm], rowHeights=[5.2*mm] + [5.5*mm]*4)
    t_s1.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), C_NAVY),
        ('ALIGN', (0,0), (-1,0), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOX', (0,0), (-1,-1), 0.75, C_BORDER),
        ('INNERGRID', (0,0), (-1,-1), 0.5, C_BORDER),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, C_SLATE_BG]),
    ]))
    story.append(t_s1)
    story.append(Spacer(1, 2.5 * mm))

    # 4. Opening Float Vault Verification Bar
    float_cells = [
        [
            Paragraph("<b>OPENING FLOAT AUDIT:</b>", tb_bold),
            Paragraph("<b>Notes:</b> R _________________", tb_style),
            Paragraph("<b>Coins:</b> R _________________", tb_style),
            Paragraph("<b>TOTAL OPENING FLOAT:</b> R ___________________", tb_bold),
            Paragraph("<b>Counted By:</b> _________________", tb_style),
            Paragraph("<b>Sup Verified:</b> _________________", tb_style),
        ]
    ]
    t_float = Table(float_cells, colWidths=[33*mm, 28*mm, 28*mm, 43*mm, 27*mm, 27*mm], rowHeights=[6.8*mm])
    t_float.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#EFF6FF")),
        ('BOX', (0,0), (-1,-1), 0.8, colors.HexColor("#3B82F6")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#BFDBFE")),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
        ('LEFTPADDING', (0,0), (-1,-1), 3),
        ('RIGHTPADDING', (0,0), (-1,-1), 3),
    ]))
    story.append(t_float)
    story.append(Spacer(1, 2.5 * mm))

    # 5. Section 2: Daily Cash Expenses / Petty Cash Out Register
    s2_banner = Table([[Paragraph("<b>SECTION 02 // DAILY CASH EXPENSES &amp; PETTY DISBURSEMENTS</b> &nbsp;<font size=6.2 color='#CBD5E1'>(Mandatory physical vouchers &amp; till tax slips attached)</font>", sec_title_style)]], colWidths=[186 * mm])
    s2_banner.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), C_OBSIDIAN),
        ('TOPPADDING', (0,0), (-1,-1), 2.2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2.2),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(s2_banner)

    s2_head = [
        Paragraph("#", th_style),
        Paragraph("Time", th_style),
        Paragraph("Voucher #", th_style),
        Paragraph("Category (Stock / Clean / Meal / Transport / Ops)", th_style),
        Paragraph("Business Purpose / Itemized Narrative", th_style),
        Paragraph("Payee / Vendor", th_style),
        Paragraph("Amount (R)", th_style),
        Paragraph("Auth", th_style),
        Paragraph("Recv Sign", th_style)
    ]
    s2_rows = []
    for i in range(1, 13): # 12 rows
        s2_rows.append([
            Paragraph(f"<b>{i:02d}</b>", tb_center),
            "", "", "", "", "", "", "", ""
        ])
    
    s2_footer = [
        [
            Paragraph("<b>TOTAL DAILY CASH EXPENSES (PETTY CASH OUT):</b> &nbsp; <font size=6 color='#B91C1C'>[ CARRY FORWARD TO BACK RECON — BOX B1 ]</font>", tb_bold_right),
            "", "", "", "", "",
            Paragraph("<b>R</b>", ParagraphStyle('ExpTotalRed', parent=tb_bold, textColor=C_RED, fontSize=7.5)),
            "", ""
        ]
    ]

    t_s2 = Table(
        [s2_head] + s2_rows + s2_footer,
        colWidths=[7*mm, 12*mm, 18*mm, 33*mm, 45*mm, 26*mm, 21*mm, 12*mm, 12*mm],
        rowHeights=[4.8*mm] + [5.4*mm]*12 + [6.5*mm]
    )
    t_s2.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), C_NAVY),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOX', (0,0), (-1,-1), 0.75, C_BORDER),
        ('INNERGRID', (0,0), (-1,-1), 0.5, C_BORDER),
        ('ROWBACKGROUNDS', (0,1), (-1,-2), [colors.white, C_SLATE_BG]),
        ('SPAN', (0,-1), (5,-1)),
        ('BACKGROUND', (0,-1), (-1,-1), C_RED_BG),
        ('LINEABOVE', (0,-1), (-1,-1), 1.0, C_RED),
        ('LEFTPADDING', (0,-1), (-1,-1), 4),
        ('RIGHTPADDING', (0,-1), (-1,-1), 4),
    ]))
    story.append(t_s2)
    story.append(Spacer(1, 2.5 * mm))

    # 6. Section 3: Mid-Shift Cash Drops to Safe (Drawer Skims)
    s3_banner = Table([[Paragraph("<b>SECTION 03 // MID-SHIFT CASH DROPS TO SAFE (SECURITY VAULT SKIMS)</b>", sec_title_style)]], colWidths=[186 * mm])
    s3_banner.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), C_OBSIDIAN),
        ('TOPPADDING', (0,0), (-1,-1), 2.2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2.2),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(s3_banner)

    s3_head = [
        Paragraph("Drop Ref #", th_style),
        Paragraph("Time", th_style),
        Paragraph("Tamper-Evident Bag Seal #", th_style),
        Paragraph("Drop Amount (R)", th_style),
        Paragraph("Cashier Signature", th_style),
        Paragraph("Supervisor Witness", th_style),
        Paragraph("Vault Safe Verification", th_style)
    ]
    s3_rows = [
        [Paragraph("Skim Drop 1", tb_center), "", "", "", "", "", Paragraph("[ &nbsp; ] Verified &amp; Vaulted", tb_center)],
        [Paragraph("Skim Drop 2", tb_center), "", "", "", "", "", Paragraph("[ &nbsp; ] Verified &amp; Vaulted", tb_center)],
        [Paragraph("Skim Drop 3", tb_center), "", "", "", "", "", Paragraph("[ &nbsp; ] Verified &amp; Vaulted", tb_center)],
    ]
    s3_footer = [
        [
            Paragraph("<b>TOTAL SAFE SKIMS &amp; VAULT DROPS:</b> &nbsp; <font size=6 color='#0F2042'>[ CARRY FORWARD TO BACK RECON — BOX B2 ]</font>", tb_bold_right),
            "", "",
            Paragraph("<b>R</b>", tb_bold),
            "", "", ""
        ]
    ]
    t_s3 = Table(
        [s3_head] + s3_rows + s3_footer,
        colWidths=[18*mm, 15*mm, 42*mm, 26*mm, 28*mm, 29*mm, 28*mm],
        rowHeights=[4.8*mm] + [5.4*mm]*3 + [6.0*mm]
    )
    t_s3.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), C_NAVY),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOX', (0,0), (-1,-1), 0.75, C_BORDER),
        ('INNERGRID', (0,0), (-1,-1), 0.5, C_BORDER),
        ('ROWBACKGROUNDS', (0,1), (-1,-2), [colors.white, C_SLATE_BG]),
        ('SPAN', (0,-1), (2,-1)),
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor("#F8FAFC")),
        ('LINEABOVE', (0,-1), (-1,-1), 0.75, C_OBSIDIAN),
        ('LEFTPADDING', (0,-1), (-1,-1), 4),
        ('RIGHTPADDING', (0,-1), (-1,-1), 4),
    ]))
    story.append(t_s3)
    story.append(Spacer(1, 2.5 * mm))

    # 7. Front Page Custody Certification & Transfer Box
    f_cert_cells = [
        [
            Paragraph("<b>FRONT PAGE CASHIER DECLARATION:</b><br/>I hereby certify that all petty disbursements and safe vault skims listed above were verified, approved according to company policy, and are fully supported by genuine attached vouchers.", ParagraphStyle('FCert', parent=styles['Normal'], fontName='Helvetica-Oblique', fontSize=6.2, leading=8.5, textColor=C_SLATE_MUTED)),
            Paragraph("<b>Primary Cashier Signature:</b><br/>________________________________ &nbsp;&nbsp; <b>Time:</b> ___:___", tb_style),
            Paragraph("<b>Supervisor Verification:</b><br/>________________________________ &nbsp;&nbsp; <b>Time:</b> ___:___", tb_style),
        ]
    ]
    t_f_cert = Table(f_cert_cells, colWidths=[88*mm, 49*mm, 49*mm], rowHeights=[12.5*mm])
    t_f_cert.setStyle(TableStyle([
        ('BOX', (0,0), (-1,-1), 0.8, C_OBSIDIAN),
        ('BACKGROUND', (0,0), (-1,-1), C_SLATE_BG),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t_f_cert)

    # =============================================================
    # PAGE BREAK —> PAGE 2 (BACK)
    # =============================================================
    story.append(PageBreak())

    # =============================================================
    # PAGE 2: BACK — SPECIALIZED DEPOSITS & MASTER RECONCILIATION
    # =============================================================
    
    # 1. Back Executive Brand Header
    back_h_data = [
        [
            Paragraph("<b>NIRVANA</b> <font size=8.5 color='#B8860B'>◆</font> <font size=7.5 color='#475569'><b>FINANCIAL AUDIT &amp; BALANCING</b></font><br/><font size=12.5 color='#090E17'><b>DEPOSITS REGISTER &amp; MASTER RECONCILIATION</b></font>", brand_logo_style),
            Paragraph("<b>DATE:</b> _____ / _____ / 202___ &nbsp;&nbsp; <b>TILL #:</b> ________<br/><b>BRANCH:</b> [ ] Kipasa &nbsp; [ ] Dubdub &nbsp; [ ] TC<br/><b>CASHIER:</b> ______________________________", folio_box_style)
        ]
    ]
    t_back_h = Table(back_h_data, colWidths=[122 * mm, 64 * mm])
    t_back_h.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(t_back_h)
    story.append(Spacer(1, 2.5 * mm))

    # 2. Section 1: Perfumes Deposits & Layaways
    b_s1_banner = Table([[Paragraph("<b>SECTION 01 // PERFUMES &amp; FRAGRANCES DEPOSITS / LAYAWAY REGISTER</b>", sec_title_style)]], colWidths=[186 * mm])
    b_s1_banner.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), C_PURPLE),
        ('TOPPADDING', (0,0), (-1,-1), 2.2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2.2),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(b_s1_banner)

    perf_head = [
        Paragraph("#", th_style),
        Paragraph("Time", th_style),
        Paragraph("Customer Name", th_style),
        Paragraph("Contact Phone #", th_style),
        Paragraph("Perfume Description / Flacon Size", th_style),
        Paragraph("Total Price", th_style),
        Paragraph("Deposit Paid", th_style),
        Paragraph("Tender Method", th_style),
        Paragraph("Balance Due", th_style),
        Paragraph("Order Ref", th_style)
    ]
    perf_rows = []
    for i in range(1, 7): # 6 rows
        perf_rows.append([
            Paragraph(f"<b>{i:02d}</b>", tb_center),
            "", "", "", "", "", "",
            Paragraph("[ &nbsp; ]Cash &nbsp; [ &nbsp; ]Card", tb_center),
            "", ""
        ])
    perf_totals = [
        [
            Paragraph("<b>TOTAL PERFUME DEPOSITS RECEIVED:</b>", tb_bold_right),
            "", "", "", "", "",
            Paragraph("<b>R</b>", tb_bold),
            Paragraph("<b>Cash (➔ A3):</b> R ________<br/><b>Card:</b> R ________", tb_style),
            "", ""
        ]
    ]
    t_perf = Table(
        [perf_head] + perf_rows + perf_totals,
        colWidths=[7*mm, 11*mm, 26*mm, 18*mm, 36*mm, 16*mm, 17*mm, 26*mm, 16*mm, 13*mm],
        rowHeights=[4.8*mm] + [5.4*mm]*6 + [8.2*mm]
    )
    t_perf.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#312E81")),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOX', (0,0), (-1,-1), 0.75, C_BORDER),
        ('INNERGRID', (0,0), (-1,-1), 0.5, C_BORDER),
        ('ROWBACKGROUNDS', (0,1), (-1,-2), [colors.white, C_SLATE_BG]),
        ('SPAN', (0,-1), (5,-1)),
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor("#EEF2FF")),
        ('LINEABOVE', (0,-1), (-1,-1), 0.75, C_PURPLE),
        ('LEFTPADDING', (0,-1), (-1,-1), 4),
        ('RIGHTPADDING', (0,-1), (-1,-1), 4),
    ]))
    story.append(t_perf)
    story.append(Spacer(1, 2.5 * mm))

    # 3. Section 2: Rental Deposits & Security Bonds
    b_s2_banner = Table([[Paragraph("<b>SECTION 02 // RENTAL DEPOSITS &amp; SECURITY BOND REGISTER (GEAR / INSTRUMENTS / ATTIRE)</b>", sec_title_style)]], colWidths=[186 * mm])
    b_s2_banner.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), C_TEAL),
        ('TOPPADDING', (0,0), (-1,-1), 2.2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2.2),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(b_s2_banner)

    rent_head = [
        Paragraph("#", th_style),
        Paragraph("Customer / Renter", th_style),
        Paragraph("Contact #", th_style),
        Paragraph("Item Rented / Asset Tag #", th_style),
        Paragraph("Rental Fee", th_style),
        Paragraph("Security Bond", th_style),
        Paragraph("Pay Method", th_style),
        Paragraph("Return Due", th_style),
        Paragraph("Deposit Status", th_style),
        Paragraph("Staff Sign", th_style)
    ]
    rent_rows = []
    for i in range(1, 8): # 7 rows
        rent_rows.append([
            Paragraph(f"<b>{i:02d}</b>", tb_center),
            "", "", "", "", "",
            Paragraph("[ ]Cash [ ]Card", tb_center),
            "",
            Paragraph("[ ]Held &nbsp; [ ]Ret", tb_center),
            ""
        ])
    rent_totals = [
        [
            Paragraph("<b>TOTAL RENTAL DEPOSITS RECEIVED:</b>", tb_bold_right),
            "", "", "", "",
            Paragraph("<b>R</b>", tb_bold),
            Paragraph("<b>Cash (➔ A4):</b> R ________<br/><b>Card:</b> R ________", tb_style),
            "", "", ""
        ]
    ]
    t_rent = Table(
        [rent_head] + rent_rows + rent_totals,
        colWidths=[7*mm, 26*mm, 18*mm, 34*mm, 15*mm, 16*mm, 23*mm, 15*mm, 20*mm, 12*mm],
        rowHeights=[4.8*mm] + [5.2*mm]*7 + [8.0*mm]
    )
    t_rent.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#134E4A")),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOX', (0,0), (-1,-1), 0.75, C_BORDER),
        ('INNERGRID', (0,0), (-1,-1), 0.5, C_BORDER),
        ('ROWBACKGROUNDS', (0,1), (-1,-2), [colors.white, C_SLATE_BG]),
        ('SPAN', (0,-1), (4,-1)),
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor("#F0FDFA")),
        ('LINEABOVE', (0,-1), (-1,-1), 0.75, C_TEAL),
        ('LEFTPADDING', (0,-1), (-1,-1), 4),
        ('RIGHTPADDING', (0,-1), (-1,-1), 4),
    ]))
    story.append(t_rent)
    story.append(Spacer(1, 2.5 * mm))

    # 4. Section 3: MASTER RECONCILIATION AREA FOR ALL (The Crown Jewel)
    b_s3_banner = Table([[Paragraph("<b>SECTION 03 // MASTER RECONCILIATION AREA FOR ALL (DAILY CASH, DEPOSITS &amp; BALANCING)</b>", sec_title_style)]], colWidths=[186 * mm])
    b_s3_banner.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), C_OBSIDIAN),
        ('TOPPADDING', (0,0), (-1,-1), 2.2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2.2),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(b_s3_banner)

    recon_matrix = [
        # Subheaders
        [
            Paragraph("<b>PILLAR 1: CASH INFLOWS (+)</b>", tb_bold),
            Paragraph("<b>PILLAR 2: CASH OUTFLOWS (-)</b>", tb_bold),
            Paragraph("<b>PILLAR 3: PHYSICAL COUNT &amp; AUDIT</b>", tb_bold)
        ],
        # Row 1
        [
            Paragraph("<b>A1. Opening Cash Float:</b><br/>(from front page float) &nbsp; R ________________", tb_style),
            Paragraph("<b>B1. Daily Cash Expenses:</b><br/>(from front Sec 2 total) &nbsp; R ________________", tb_style),
            Paragraph("<b>Denomination Audit Breakdown:</b><br/>R200 x ______ = R __________________", tb_style)
        ],
        # Row 2
        [
            Paragraph("<b>A2. General POS Cash Sales:</b><br/>(from Till Z-Report) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; R ________________", tb_style),
            Paragraph("<b>B2. Mid-Shift Safe Skims:</b><br/>(from front Sec 3 total) &nbsp; R ________________", tb_style),
            Paragraph("R100 x ______ = R __________________<br/>R50 &nbsp; x ______ = R __________________", tb_style)
        ],
        # Row 3
        [
            Paragraph("<b>A3. Perfume Deposits (Cash):</b><br/>(from Sec 1 cash above) &nbsp; R ________________", tb_style),
            Paragraph("<b>B3. Rental Bonds Refunded:</b><br/>(Cash returned to client) &nbsp; R ________________", tb_style),
            Paragraph("R20 &nbsp; x ______ = R __________________<br/>R10 &nbsp; x ______ = R __________________", tb_style)
        ],
        # Row 4
        [
            Paragraph("<b>A4. Rental Deposits (Cash):</b><br/>(from Sec 2 cash above) &nbsp; R ________________", tb_style),
            Paragraph("<b>B4. Other Authorized Payouts:</b><br/>(Specify: ______________) &nbsp; R ________________", tb_style),
            Paragraph("Coins &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;= R __________________<br/><b>TOTAL PHYSICAL CASH = R ______________</b>", tb_bold)
        ],
        # Row 5
        [
            Paragraph("<b>A5. Other Cash Inflows:</b><br/>(Specify: ______________) &nbsp; R ________________", tb_style),
            Paragraph("<b>B5. Closing Float Retained:</b><br/>(Kept in till for next shift) R ________________", tb_style),
            Paragraph("<b>BALANCING EQUATION:</b><br/>Expected Cash = [A Total] - [B Total]<br/><b>Expected = R ______________________</b>", tb_style)
        ],
        # Subtotals & Variance Check
        [
            Paragraph("<b>[A] TOTAL CASH COLLECTED:</b><br/><font size=8.5 color='#166534'><b>R ___________________________</b></font>", tb_style),
            Paragraph("<b>[B] TOTAL CASH OUTFLOWS:</b><br/><font size=8.5 color='#991B1B'><b>R ___________________________</b></font>", tb_style),
            Paragraph("<b>VARIANCE [Actual Count - Expected]:</b><br/>[ &nbsp; ] <b>BALANCED (R0.00)</b> &nbsp;&nbsp; [ &nbsp; ] <b>OVER (+)</b><br/>[ &nbsp; ] <b>SHORT (-)</b> &nbsp;&nbsp; <b>Amount: R ______________</b>", tb_bold)
        ]
    ]

    t_recon = Table(
        recon_matrix,
        colWidths=[61*mm, 61*mm, 64*mm],
        rowHeights=[4.8*mm, 9.4*mm, 9.4*mm, 9.4*mm, 9.4*mm, 9.4*mm, 12.0*mm]
    )
    t_recon.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), C_ALT_ROW),
        ('BOX', (0,0), (-1,-1), 0.8, C_OBSIDIAN),
        ('INNERGRID', (0,0), (-1,-1), 0.5, C_BORDER),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
        ('BACKGROUND', (2,-1), (2,-1), C_GOLD_LIGHT),
        ('BACKGROUND', (0,-1), (0,-1), C_GREEN_BG),
        ('BACKGROUND', (1,-1), (1,-1), C_RED_BG),
        ('LINEBELOW', (0,-1), (0,-1), 1.2, C_GREEN),
        ('LINEBELOW', (1,-1), (1,-1), 1.2, C_RED),
        ('LINEBELOW', (2,-1), (2,-1), 1.2, C_GOLD_BORDER),
    ]))
    story.append(t_recon)
    story.append(Spacer(1, 2.5 * mm))

    # 5. Electronic & Consolidated Store Revenue Bar
    card_cells = [
        [
            Paragraph("<b>ELECTRONIC TAKINGS:</b>", tb_bold),
            Paragraph("<b>Speedpoint POS Terminals:</b> R ____________", tb_style),
            Paragraph("<b>EFT / Direct Bank:</b> R ____________", tb_style),
            Paragraph("<b>GRAND TOTAL DAILY STORE TURNOVER:</b> R __________________", tb_bold)
        ]
    ]
    t_card = Table(card_cells, colWidths=[38*mm, 46*mm, 39*mm, 63*mm], rowHeights=[6.5*mm])
    t_card.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), C_SLATE_BG),
        ('BOX', (0,0), (-1,-1), 0.5, C_BORDER),
        ('INNERGRID', (0,0), (-1,-1), 0.5, C_BORDER),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
        ('LEFTPADDING', (0,0), (-1,-1), 3),
        ('RIGHTPADDING', (0,0), (-1,-1), 3),
    ]))
    story.append(t_card)
    story.append(Spacer(1, 2.5 * mm))

    # 6. Loss Prevention, Variance Protocol & Official Sign-Off
    b_sign_cells = [
        [
            Paragraph("<b>DISCREPANCY / VARIANCE EXPLANATION (MANDATORY IF TILL IS OVER OR SHORT):</b><br/>____________________________________________________________________________________________________________________________________", tb_style),
            Paragraph("<b>OFFICIAL STORE STAMP &amp;<br/>LOSS PREVENTION SEAL</b><br/><br/>", ParagraphStyle('Seal', parent=tb_style, alignment=1, fontSize=6, leading=7.5, textColor=C_SLATE_MUTED))
        ],
        [
            Paragraph("<b>PRIMARY CASHIER / TILL CUSTODIAN:</b><br/>Name: ______________________ &nbsp; Sign: ______________________<br/>Date: ____/____/202___ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Time: ___:___", tb_style),
            Paragraph("<b>STORE MANAGER / AUDITOR APPROVAL:</b><br/>Name: ______________________ &nbsp; Sign: ______________________<br/>Date: ____/____/202___ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Time: ___:___", tb_style)
        ]
    ]
    t_b_sign = Table(b_sign_cells, colWidths=[140*mm, 46*mm], rowHeights=[10.5*mm, 15.5*mm])
    t_b_sign.setStyle(TableStyle([
        ('BOX', (0,0), (-1,-1), 0.8, C_OBSIDIAN),
        ('INNERGRID', (0,0), (-1,-1), 0.5, C_BORDER),
        ('SPAN', (1,0), (1,0)),
        ('BACKGROUND', (1,0), (1,0), C_SLATE_BG),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 2.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2.5),
        ('LEFTPADDING', (0,0), (-1,-1), 3.5),
        ('RIGHTPADDING', (0,0), (-1,-1), 3.5),
    ]))
    story.append(t_b_sign)

    # Build PDF with Deluxe Numbered Canvas
    doc.build(story, canvasmaker=DeluxeNumberedCanvas)
    print(f"Successfully generated deluxe edition: {filename}")

if __name__ == "__main__":
    out_pdf = "Cash_Control_Register_Deluxe.pdf"
    if len(sys.argv) > 1:
        out_pdf = sys.argv[1]
    build_deluxe_pdf(out_pdf)
