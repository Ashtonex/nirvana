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

class NumberedCanvas(canvas.Canvas):
    """Canvas that enables two-pass page numbering and professional header/footer rules."""
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
        # Top banner accent line
        self.setStrokeColor(colors.HexColor("#1E3A8A"))
        self.setLineWidth(1.5)
        self.line(10 * mm, 287 * mm, 200 * mm, 287 * mm)

        # Bottom footer accent line
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.75)
        self.line(10 * mm, 11 * mm, 200 * mm, 11 * mm)

        # Footer text (cleanly separated, no overlap)
        self.setFont("Helvetica-Bold", 7)
        self.setFillColor(colors.HexColor("#1E3A8A"))
        self.drawString(10 * mm, 7.5 * mm, "NIRVANA RETAIL OPERATIONS")
        self.setFont("Helvetica", 7)
        self.setFillColor(colors.HexColor("#64748B"))
        self.drawString(52 * mm, 7.5 * mm, "•   DAILY CASH AUDIT & REGISTER")
        
        page_label = f"Page {self._pageNumber} of {page_count}   •   {'[ FRONT: DAILY CASH & EXPENSES ]' if self._pageNumber == 1 else '[ BACK: DEPOSITS & RECONCILIATION ]'}"
        self.drawRightString(200 * mm, 7.5 * mm, page_label)
        self.restoreState()


def create_cash_control_pdf(filename="Cash_Control_Register.pdf"):
    # Page setup: A4 = 210mm x 297mm. Printable width = 210 - 20 = 190mm
    # Printable height = 297 - 24 = 273mm
    doc = SimpleDocTemplate(
        filename,
        pagesize=A4,
        leftMargin=10 * mm,
        rightMargin=10 * mm,
        topMargin=12 * mm,
        bottomMargin=13 * mm
    )

    story = []

    # Palette
    C_PRIMARY = colors.HexColor("#0F172A")     # Slate 900
    C_SECONDARY = colors.HexColor("#1E3A8A")   # Blue 900
    C_ACCENT = colors.HexColor("#2563EB")      # Blue 600
    C_TEXT = colors.HexColor("#1E293B")        # Slate 800
    C_MUTED = colors.HexColor("#64748B")       # Slate 500
    C_LIGHT_BG = colors.HexColor("#F8FAFC")    # Slate 50
    C_ALT_ROW = colors.HexColor("#F1F5F9")     # Slate 100
    C_BORDER = colors.HexColor("#CBD5E1")      # Slate 300
    C_BORDER_DARK = colors.HexColor("#94A3B8") # Slate 400
    C_GREEN = colors.HexColor("#15803D")       # Green 700
    C_RED = colors.HexColor("#B91C1C")         # Red 700

    styles = getSampleStyleSheet()

    # Custom typography styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=15,
        textColor=C_PRIMARY
    )

    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.2,
        leading=9.2,
        textColor=C_MUTED
    )

    th_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=6.8,
        leading=8.2,
        alignment=1, # Center
        textColor=colors.white
    )

    tb_style = ParagraphStyle(
        'TableBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=6.5,
        leading=8.2,
        textColor=C_TEXT
    )

    tb_center = ParagraphStyle(
        'TableBodyCenter',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=6.5,
        leading=8.2,
        alignment=1,
        textColor=C_TEXT
    )

    tb_bold = ParagraphStyle(
        'TableBodyBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=6.8,
        leading=8.4,
        textColor=C_TEXT
    )

    tb_bold_right = ParagraphStyle(
        'TableBodyBoldRight',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=6.8,
        leading=8.4,
        alignment=2,
        textColor=C_TEXT
    )

    # -------------------------------------------------------------
    # PAGE 1: FRONT - DAILY CASH CONTROL & OPERATIONAL EXPENSES
    # -------------------------------------------------------------
    
    # 1. Header Table
    header_data = [
        [
            Paragraph("<b>NIRVANA</b> <font size=7.5 color='#2563EB'>| RETAIL FINANCIAL MANAGEMENT</font><br/><font size=12 color='#0F172A'><b>DAILY CASH CONTROL &amp; EXPENSE REGISTER</b></font>", title_style),
            Paragraph("<b>DOC REF:</b> NIR-CCR-2026<br/><b>STATUS:</b> OFFICIAL INTERNAL AUDIT LOG<br/><b>FILING:</b> DAILY SAFE COMPLIANCE", subtitle_style)
        ]
    ]
    t_header = Table(header_data, colWidths=[130 * mm, 60 * mm])
    t_header.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(t_header)
    story.append(Spacer(1, 2 * mm))

    # 2. Metadata / Shift Info Bar
    meta_data = [
        [
            Paragraph("<b>BRANCH / SHOP:</b> [ &nbsp; ] Kipasa &nbsp;&nbsp; [ &nbsp; ] Dubdub &nbsp;&nbsp; [ &nbsp; ] Tradecenter &nbsp;&nbsp; [ &nbsp; ] Other: _____________", tb_style),
            Paragraph("<b>DATE:</b> _____ / _____ / 202___", tb_style),
            Paragraph("<b>REGISTER / TILL #:</b> ________", tb_style)
        ],
        [
            Paragraph("<b>SHIFT:</b> [ &nbsp; ] Morning (Open) &nbsp;&nbsp; [ &nbsp; ] Afternoon / Evening &nbsp;&nbsp; [ &nbsp; ] Full Day", tb_style),
            Paragraph("<b>SUPERVISOR ON DUTY:</b> ___________________________", tb_style),
            Paragraph("<b>PRIMARY CASHIER:</b> ___________________________", tb_style)
        ]
    ]
    t_meta = Table(meta_data, colWidths=[84 * mm, 53 * mm, 53 * mm])
    t_meta.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), C_LIGHT_BG),
        ('BOX', (0,0), (-1,-1), 0.75, C_BORDER_DARK),
        ('INNERGRID', (0,0), (-1,-1), 0.5, C_BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 2.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2.5),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t_meta)
    story.append(Spacer(1, 2.5 * mm))

    # 3. Section 1: Staff Sign-In & Sign-Out (Till Custody & Attendance)
    sec1_title = Table([[Paragraph("<b>1. STAFF SIGN-IN &amp; SIGN-OUT  /  REGISTER CUSTODY LOG</b>", th_style)]], colWidths=[190 * mm])
    sec1_title.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), C_SECONDARY),
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
    ]))
    story.append(sec1_title)

    sec1_head = [
        Paragraph("Staff Name", th_style),
        Paragraph("Role / Designation", th_style),
        Paragraph("Sign-In<br/>Time", th_style),
        Paragraph("Sign-In Signature", th_style),
        Paragraph("Sign-Out<br/>Time", th_style),
        Paragraph("Sign-Out Signature", th_style),
        Paragraph("Handover / Till Condition", th_style)
    ]
    sec1_rows = []
    for i in range(4):
        sec1_rows.append(["", "", "", "", "", "", ""])
    
    t_sec1 = Table([sec1_head] + sec1_rows, colWidths=[36*mm, 26*mm, 16*mm, 28*mm, 16*mm, 28*mm, 40*mm], rowHeights=[5.5*mm] + [5.6*mm]*4)
    t_sec1.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), C_PRIMARY),
        ('ALIGN', (0,0), (-1,0), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOX', (0,0), (-1,-1), 0.75, C_BORDER_DARK),
        ('INNERGRID', (0,0), (-1,-1), 0.5, C_BORDER),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, C_LIGHT_BG]),
    ]))
    story.append(t_sec1)
    story.append(Spacer(1, 2.5 * mm))

    # 4. Section 2: Opening Float Verification Bar
    float_data = [
        [
            Paragraph("<b>OPENING CASH FLOAT:</b>", tb_bold),
            Paragraph("<b>Coins:</b> R ________________", tb_style),
            Paragraph("<b>Notes:</b> R ________________", tb_style),
            Paragraph("<b>TOTAL FLOAT:</b> R ________________", tb_bold),
            Paragraph("<b>Counted:</b> _________________", tb_style),
            Paragraph("<b>Verified (Sup):</b> _________________", tb_style),
        ]
    ]
    t_float = Table(float_data, colWidths=[35*mm, 28*mm, 28*mm, 41*mm, 29*mm, 29*mm], rowHeights=[6.5*mm])
    t_float.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#EFF6FF")),
        ('BOX', (0,0), (-1,-1), 0.75, colors.HexColor("#93C5FD")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#BFDBFE")),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
        ('LEFTPADDING', (0,0), (-1,-1), 3),
        ('RIGHTPADDING', (0,0), (-1,-1), 3),
    ]))
    story.append(t_float)
    story.append(Spacer(1, 2.5 * mm))

    # 5. Section 3: Daily Cash Expenses / Petty Cash Log
    sec3_title = Table([[Paragraph("<b>2. DAILY CASH EXPENSES / PETTY CASH OUT REGISTER</b>  (Attach physical invoices / till receipts)", th_style)]], colWidths=[190 * mm])
    sec3_title.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), C_SECONDARY),
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
    ]))
    story.append(sec3_title)

    sec3_head = [
        Paragraph("#", th_style),
        Paragraph("Time", th_style),
        Paragraph("Voucher / Slip #", th_style),
        Paragraph("Expense Category", th_style),
        Paragraph("Description / Business Purpose", th_style),
        Paragraph("Paid To (Vendor/Person)", th_style),
        Paragraph("Amount (R)", th_style),
        Paragraph("Auth By", th_style),
        Paragraph("Recv Sign", th_style)
    ]
    sec3_rows = []
    for i in range(1, 13): # 12 rows
        sec3_rows.append([
            Paragraph(str(i), tb_center),
            "", "", "", "", "", "", "", ""
        ])
    
    sec3_footer = [
        [
            Paragraph("<b>TOTAL DAILY CASH EXPENSES (Carry to Back Recon - Box B1):</b>", tb_bold_right),
            "", "", "", "", "",
            Paragraph("<b>R</b>", ParagraphStyle('ExpTotal', parent=tb_bold, textColor=C_RED, fontSize=7.5)),
            "", ""
        ]
    ]

    t_sec3 = Table(
        [sec3_head] + sec3_rows + sec3_footer,
        colWidths=[8*mm, 12*mm, 18*mm, 31*mm, 46*mm, 28*mm, 21*mm, 13*mm, 13*mm],
        rowHeights=[4.8*mm] + [5.4*mm]*12 + [6.5*mm]
    )
    t_sec3.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), C_PRIMARY),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOX', (0,0), (-1,-1), 0.75, C_BORDER_DARK),
        ('INNERGRID', (0,0), (-1,-1), 0.5, C_BORDER),
        ('ROWBACKGROUNDS', (0,1), (-1,-2), [colors.white, C_LIGHT_BG]),
        ('SPAN', (0,-1), (5,-1)),
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor("#FEF2F2")),
        ('LINEABOVE', (0,-1), (-1,-1), 1.0, C_SECONDARY),
        ('LEFTPADDING', (0,-1), (-1,-1), 4),
        ('RIGHTPADDING', (0,-1), (-1,-1), 4),
    ]))
    story.append(t_sec3)
    story.append(Spacer(1, 2.5 * mm))

    # 6. Section 4: Mid-Day Cash Skims / Drops to Safe
    sec4_title = Table([[Paragraph("<b>3. MID-SHIFT CASH DROPS TO SAFE (DRAWER SKIMS FOR SECURITY)</b>", th_style)]], colWidths=[190 * mm])
    sec4_title.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), C_SECONDARY),
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
    ]))
    story.append(sec4_title)

    sec4_head = [
        Paragraph("Drop #", th_style),
        Paragraph("Time", th_style),
        Paragraph("Drop Receipt / Seal Bag #", th_style),
        Paragraph("Drop Amount (R)", th_style),
        Paragraph("Cashier Signature", th_style),
        Paragraph("Supervisor Witness", th_style),
        Paragraph("Safe Verification Status", th_style)
    ]
    sec4_rows = [
        [Paragraph("Drop 1", tb_center), "", "", "", "", "", Paragraph("[ &nbsp; ] Verified &amp; In Safe", tb_center)],
        [Paragraph("Drop 2", tb_center), "", "", "", "", "", Paragraph("[ &nbsp; ] Verified &amp; In Safe", tb_center)],
        [Paragraph("Drop 3", tb_center), "", "", "", "", "", Paragraph("[ &nbsp; ] Verified &amp; In Safe", tb_center)],
    ]
    sec4_total = [
        [
            Paragraph("<b>TOTAL SAFE DROPS (Carry to Back Recon - Box B2):</b>", tb_bold_right),
            "", "",
            Paragraph("<b>R</b>", tb_bold),
            "", "", ""
        ]
    ]
    t_sec4 = Table(
        [sec4_head] + sec4_rows + sec4_total,
        colWidths=[16*mm, 15*mm, 44*mm, 26*mm, 29*mm, 31*mm, 29*mm],
        rowHeights=[4.8*mm] + [5.3*mm]*3 + [6.0*mm]
    )
    t_sec4.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), C_PRIMARY),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOX', (0,0), (-1,-1), 0.75, C_BORDER_DARK),
        ('INNERGRID', (0,0), (-1,-1), 0.5, C_BORDER),
        ('ROWBACKGROUNDS', (0,1), (-1,-2), [colors.white, C_LIGHT_BG]),
        ('SPAN', (0,-1), (2,-1)),
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor("#F8FAFC")),
        ('LINEABOVE', (0,-1), (-1,-1), 0.75, C_SECONDARY),
        ('LEFTPADDING', (0,-1), (-1,-1), 4),
        ('RIGHTPADDING', (0,-1), (-1,-1), 4),
    ]))
    story.append(t_sec4)
    story.append(Spacer(1, 2.5 * mm))

    # 7. Front Page Sign-off & Handover Note
    front_footer_data = [
        [
            Paragraph("<b>FRONT PAGE CUSTODY DECLARATION:</b><br/>I confirm all expense disbursements and mid-day safe drops recorded above are verified, accurate, and supported by attached vouchers.", ParagraphStyle('FNote', parent=styles['Normal'], fontName='Helvetica-Oblique', fontSize=6.2, leading=8, textColor=C_MUTED)),
            Paragraph("<b>Cashier Sign:</b> _____________________<br/><b>Date &amp; Time:</b> ____/____/202___ &nbsp; ___:___", tb_style),
            Paragraph("<b>Supervisor Sign:</b> ___________________<br/><b>Date &amp; Time:</b> ____/____/202___ &nbsp; ___:___", tb_style),
        ]
    ]
    t_front_footer = Table(front_footer_data, colWidths=[92*mm, 49*mm, 49*mm], rowHeights=[10.5*mm])
    t_front_footer.setStyle(TableStyle([
        ('BOX', (0,0), (-1,-1), 0.75, C_BORDER_DARK),
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F1F5F9")),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t_front_footer)

    # -------------------------------------------------------------
    # PAGE BREAK -> BACK (PAGE 2)
    # -------------------------------------------------------------
    story.append(PageBreak())

    # -------------------------------------------------------------
    # PAGE 2: BACK - PERFUMES DEPOSITS, RENTAL DEPOSITS & RECON
    # -------------------------------------------------------------
    
    # 1. Back Header
    back_header_data = [
        [
            Paragraph("<b>NIRVANA</b> <font size=7.5 color='#2563EB'>| FINANCIAL AUDIT &amp; BALANCING</font><br/><font size=12 color='#0F172A'><b>DEPOSITS REGISTER &amp; MASTER RECONCILIATION</b></font>", title_style),
            Paragraph("<b>DATE:</b> _____ / _____ / 202___ &nbsp;&nbsp; <b>REG #:</b> ________<br/><b>BRANCH:</b> [ &nbsp; ] Kipasa &nbsp; [ &nbsp; ] Dubdub &nbsp; [ &nbsp; ] TC<br/><b>CASHIER:</b> ______________________________", subtitle_style)
        ]
    ]
    t_back_header = Table(back_header_data, colWidths=[125 * mm, 65 * mm])
    t_back_header.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(t_back_header)
    story.append(Spacer(1, 2 * mm))

    # 2. Section 1: Perfumes Deposits Register
    sec_perf_title = Table([[Paragraph("<b>1. PERFUMES DEPOSITS / LAYAWAYS / SPECIAL ORDERS REGISTER</b>", th_style)]], colWidths=[190 * mm])
    sec_perf_title.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#4338CA")), # Indigo 700
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
    ]))
    story.append(sec_perf_title)

    perf_head = [
        Paragraph("#", th_style),
        Paragraph("Time", th_style),
        Paragraph("Customer Name", th_style),
        Paragraph("Contact #", th_style),
        Paragraph("Perfume / Fragrance Description", th_style),
        Paragraph("Total Price", th_style),
        Paragraph("Deposit Paid", th_style),
        Paragraph("Pay Method", th_style),
        Paragraph("Balance Due", th_style),
        Paragraph("Slip / Staff", th_style)
    ]
    perf_rows = []
    for i in range(1, 7): # 6 rows
        perf_rows.append([
            Paragraph(str(i), tb_center),
            "", "", "", "", "", "",
            Paragraph("[ &nbsp; ]Cash &nbsp; [ &nbsp; ]Card", tb_center),
            "", ""
        ])
    perf_totals = [
        [
            Paragraph("<b>TOTAL PERFUME DEPOSITS:</b>", tb_bold_right),
            "", "", "", "", "",
            Paragraph("<b>R</b>", tb_bold),
            Paragraph("<b>Cash:</b> R ________<br/><b>Card:</b> R ________", tb_style),
            "", ""
        ]
    ]
    t_perf = Table(
        [perf_head] + perf_rows + perf_totals,
        colWidths=[7*mm, 11*mm, 28*mm, 19*mm, 39*mm, 17*mm, 18*mm, 24*mm, 14*mm, 13*mm],
        rowHeights=[4.8*mm] + [5.3*mm]*6 + [8.0*mm]
    )
    t_perf.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#312E81")), # Indigo 900
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOX', (0,0), (-1,-1), 0.75, C_BORDER_DARK),
        ('INNERGRID', (0,0), (-1,-1), 0.5, C_BORDER),
        ('ROWBACKGROUNDS', (0,1), (-1,-2), [colors.white, C_LIGHT_BG]),
        ('SPAN', (0,-1), (5,-1)),
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor("#EEF2FF")),
        ('LINEABOVE', (0,-1), (-1,-1), 0.75, colors.HexColor("#4338CA")),
        ('LEFTPADDING', (0,-1), (-1,-1), 4),
        ('RIGHTPADDING', (0,-1), (-1,-1), 4),
    ]))
    story.append(t_perf)
    story.append(Spacer(1, 2.5 * mm))

    # 3. Section 2: Rental Deposits Register
    sec_rent_title = Table([[Paragraph("<b>2. RENTAL DEPOSITS &amp; SECURITY BOND REGISTER</b> (Costumes, Instruments, Gear, Props)", th_style)]], colWidths=[190 * mm])
    sec_rent_title.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#0D9488")), # Teal 600
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
    ]))
    story.append(sec_rent_title)

    rent_head = [
        Paragraph("#", th_style),
        Paragraph("Customer / Renter", th_style),
        Paragraph("Contact #", th_style),
        Paragraph("Item Rented / Serial #", th_style),
        Paragraph("Rental Fee", th_style),
        Paragraph("Security Deposit", th_style),
        Paragraph("Pay Method", th_style),
        Paragraph("Return Due", th_style),
        Paragraph("Deposit Status", th_style),
        Paragraph("Staff Sign", th_style)
    ]
    rent_rows = []
    for i in range(1, 6): # 5 rows
        rent_rows.append([
            Paragraph(str(i), tb_center),
            "", "", "", "", "",
            Paragraph("[ ]Cash [ ]Card", tb_center),
            "",
            Paragraph("[ ]Held [ ]Ret", tb_center),
            ""
        ])
    rent_totals = [
        [
            Paragraph("<b>TOTAL RENTAL DEPOSITS:</b>", tb_bold_right),
            "", "", "", "",
            Paragraph("<b>R</b>", tb_bold),
            Paragraph("<b>Cash:</b> R ________<br/><b>Card:</b> R ________", tb_style),
            "", "", ""
        ]
    ]
    t_rent = Table(
        [rent_head] + rent_rows + rent_totals,
        colWidths=[7*mm, 27*mm, 19*mm, 36*mm, 16*mm, 17*mm, 23*mm, 15*mm, 18*mm, 12*mm],
        rowHeights=[4.8*mm] + [5.3*mm]*5 + [8.0*mm]
    )
    t_rent.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#134E4A")), # Teal 900
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOX', (0,0), (-1,-1), 0.75, C_BORDER_DARK),
        ('INNERGRID', (0,0), (-1,-1), 0.5, C_BORDER),
        ('ROWBACKGROUNDS', (0,1), (-1,-2), [colors.white, C_LIGHT_BG]),
        ('SPAN', (0,-1), (4,-1)),
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor("#F0FDFA")),
        ('LINEABOVE', (0,-1), (-1,-1), 0.75, colors.HexColor("#0D9488")),
        ('LEFTPADDING', (0,-1), (-1,-1), 4),
        ('RIGHTPADDING', (0,-1), (-1,-1), 4),
    ]))
    story.append(t_rent)
    story.append(Spacer(1, 2.5 * mm))

    # 4. Section 3: MASTER CASH & FINANCIAL RECONCILIATION ("RECON AREA FOR ALL")
    recon_title = Table([[Paragraph("<b>3. MASTER RECONCILIATION AREA FOR ALL (DAILY CASH, DEPOSITS &amp; DRAWER BALANCING)</b>", th_style)]], colWidths=[190 * mm])
    recon_title.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), C_PRIMARY),
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
    ]))
    story.append(recon_title)

    recon_body_data = [
        # Subheaders
        [
            Paragraph("<b>SECTION A: CASH INFLOW (+)</b>", tb_bold),
            Paragraph("<b>SECTION B: CASH OUTFLOW (-)</b>", tb_bold),
            Paragraph("<b>SECTION C: PHYSICAL CASH COUNT</b>", tb_bold)
        ],
        # Row 1
        [
            Paragraph("<b>A1. Opening Cash Float:</b><br/>(from front float) &nbsp; R ________________", tb_style),
            Paragraph("<b>B1. Daily Cash Expenses:</b><br/>(from front Sec 2) &nbsp; R ________________", tb_style),
            Paragraph("<b>Denomination Breakdown:</b><br/>R200 x _____ = R __________________", tb_style)
        ],
        # Row 2
        [
            Paragraph("<b>A2. General Store Cash Sales:</b><br/>(from POS Register) &nbsp; R ________________", tb_style),
            Paragraph("<b>B2. Cash Drops to Safe:</b><br/>(from front Sec 3) &nbsp; R ________________", tb_style),
            Paragraph("R100 x _____ = R __________________<br/>R50 &nbsp; x _____ = R __________________", tb_style)
        ],
        # Row 3
        [
            Paragraph("<b>A3. Perfume Deposits (Cash):</b><br/>(from Sec 1 cash) &nbsp; R ________________", tb_style),
            Paragraph("<b>B3. Rental Deposits Refunded:</b><br/>(Cash returned) &nbsp; &nbsp; R ________________", tb_style),
            Paragraph("R20 &nbsp; x _____ = R __________________<br/>R10 &nbsp; x _____ = R __________________", tb_style)
        ],
        # Row 4
        [
            Paragraph("<b>A4. Rental Deposits (Cash):</b><br/>(from Sec 2 cash) &nbsp; R ________________", tb_style),
            Paragraph("<b>B4. Other Cash Paid Out:</b><br/>(Specify: _______) &nbsp; R ________________", tb_style),
            Paragraph("Coins &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;= R __________________<br/><b>TOTAL COUNT &nbsp; = R __________________</b>", tb_bold)
        ],
        # Row 5
        [
            Paragraph("<b>A5. Other Cash In:</b><br/>(Specify: _______) &nbsp; R ________________", tb_style),
            Paragraph("<b>B5. Closing Float Retained:</b><br/>(Kept for next till) &nbsp; R ________________", tb_style),
            Paragraph("<b>Expected Cash:</b> [A Total] - [B Total]<br/><b>Expected = R ______________________</b>", tb_style)
        ],
        # Subtotals & Variance
        [
            Paragraph("<b>[A] TOTAL CASH INFLOW:</b><br/><font size=8 color='#15803D'><b>R ___________________________</b></font>", tb_style),
            Paragraph("<b>[B] TOTAL CASH OUTFLOW:</b><br/><font size=8 color='#B91C1C'><b>R ___________________________</b></font>", tb_style),
            Paragraph("<b>VARIANCE [Actual Count - Expected]:</b><br/>[ &nbsp; ] BALANCED (R0.00) &nbsp;&nbsp; [ &nbsp; ] OVER (+)<br/>[ &nbsp; ] SHORT (-) &nbsp;&nbsp; <b>Amt: R ______________</b>", tb_bold)
        ]
    ]

    t_recon = Table(
        recon_body_data,
        colWidths=[62*mm, 62*mm, 66*mm],
        rowHeights=[4.8*mm, 9.2*mm, 9.2*mm, 9.2*mm, 9.2*mm, 9.2*mm, 12.0*mm]
    )
    t_recon.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), C_ALT_ROW),
        ('BOX', (0,0), (-1,-1), 0.75, C_BORDER_DARK),
        ('INNERGRID', (0,0), (-1,-1), 0.5, C_BORDER),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
        ('BACKGROUND', (2,-1), (2,-1), colors.HexColor("#FEF3C7")),
        ('BACKGROUND', (0,-1), (0,-1), colors.HexColor("#F0FDF4")),
        ('BACKGROUND', (1,-1), (1,-1), colors.HexColor("#FEF2F2")),
    ]))
    story.append(t_recon)
    story.append(Spacer(1, 2.5 * mm))

    # 5. Electronic & Non-Cash Balancing Bar
    card_data = [
        [
            Paragraph("<b>NON-CASH / CARD REVENUE:</b>", tb_bold),
            Paragraph("<b>Speedpoint / POS Terminal:</b> R ____________", tb_style),
            Paragraph("<b>EFT / Direct Bank:</b> R ____________", tb_style),
            Paragraph("<b>GRAND TOTAL STORE TAKINGS:</b> R __________________", tb_bold)
        ]
    ]
    t_card = Table(card_data, colWidths=[42*mm, 45*mm, 39*mm, 64*mm], rowHeights=[6.5*mm])
    t_card.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F8FAFC")),
        ('BOX', (0,0), (-1,-1), 0.5, C_BORDER_DARK),
        ('INNERGRID', (0,0), (-1,-1), 0.5, C_BORDER),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
        ('LEFTPADDING', (0,0), (-1,-1), 3),
        ('RIGHTPADDING', (0,0), (-1,-1), 3),
    ]))
    story.append(t_card)
    story.append(Spacer(1, 2.5 * mm))

    # 6. Variance Note & Formal Audit Sign-Off Section
    sign_data = [
        [
            Paragraph("<b>DISCREPANCY / VARIANCE EXPLANATION (MANDATORY IF OVER OR SHORT):</b><br/>____________________________________________________________________________________________________________________________________", tb_style),
            Paragraph("<b>OFFICIAL STORE STAMP</b><br/><br/><br/>", ParagraphStyle('Stamp', parent=tb_style, alignment=1))
        ],
        [
            Paragraph("<b>PRIMARY CASHIER SIGN-OFF:</b><br/>Name: ___________________________ Signature: ______________________ Date: ___/___/202___ Time: ___:___", tb_style),
            Paragraph("<b>SUPERVISOR / AUDITOR VERIFICATION:</b><br/>Name: ___________________________ Signature: ______________________ Date: ___/___/202___ Time: ___:___", tb_style)
        ]
    ]
    t_sign = Table(sign_data, colWidths=[142*mm, 48*mm], rowHeights=[10.5*mm, 14.5*mm])
    t_sign.setStyle(TableStyle([
        ('BOX', (0,0), (-1,-1), 0.75, C_BORDER_DARK),
        ('INNERGRID', (0,0), (-1,-1), 0.5, C_BORDER),
        ('SPAN', (1,0), (1,0)),
        ('BACKGROUND', (1,0), (1,0), colors.HexColor("#F8FAFC")),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 2.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2.5),
        ('LEFTPADDING', (0,0), (-1,-1), 3.5),
        ('RIGHTPADDING', (0,0), (-1,-1), 3.5),
    ]))
    story.append(t_sign)

    # Build PDF with custom NumberedCanvas
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Successfully generated {filename}")

if __name__ == "__main__":
    out_pdf = "Cash_Control_Register.pdf"
    if len(sys.argv) > 1:
        out_pdf = sys.argv[1]
    create_cash_control_pdf(out_pdf)
