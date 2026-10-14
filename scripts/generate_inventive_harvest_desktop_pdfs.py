"""
Generates high-quality, professional PDF versions of:
1. INVENTIVE_HARVEST_EMPLOYMENT_CONTRACT.pdf
2. INVENTIVE_HARVEST_WORKPLACE_POLICIES.pdf

Outputs directly to the user's Desktop:
  C:\\Users\\ashjx\\Desktop\\INVENTIVE_HARVEST_EMPLOYMENT_CONTRACT.pdf
  C:\\Users\\ashjx\\Desktop\\INVENTIVE_HARVEST_WORKPLACE_POLICIES.pdf
And backups to:
  docs/
"""

from pathlib import Path
from datetime import date

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
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

DESKTOP = Path.home() / "Desktop"
DOCS_DIR = Path("docs")
TODAY = date.today().strftime("%d %B %Y")

COLOR_NAVY = colors.HexColor("#0B2545")
COLOR_PRIMARY = colors.HexColor("#1F4D78")
COLOR_ACCENT = colors.HexColor("#2E74B5")
COLOR_MUTED = colors.HexColor("#555E68")
COLOR_LIGHT_BG = colors.HexColor("#F4F6F9")
COLOR_HEADER_BG = colors.HexColor("#E8EEF5")
COLOR_BORDER = colors.HexColor("#C0C8D0")
COLOR_ALERT_BG = colors.HexColor("#FFF8E7")
COLOR_ALERT_BORDER = colors.HexColor("#E0A800")


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
        self.setFont("Helvetica-Bold", 7.5)
        self.setFillColor(COLOR_PRIMARY)
        self.drawString(0.65 * inch, 10.45 * inch, "INVENTIVE HARVEST")
        self.setFont("Helvetica", 7.5)
        self.setFillColor(COLOR_MUTED)
        self.drawRightString(7.85 * inch, 10.45 * inch, "Retail Operations: Dub Dub • Kipasa • Trade Center • Head Office")
        
        self.setStrokeColor(COLOR_BORDER)
        self.setLineWidth(0.5)
        self.line(0.65 * inch, 10.35 * inch, 7.85 * inch, 10.35 * inch)
        
        self.line(0.65 * inch, 0.55 * inch, 7.85 * inch, 0.55 * inch)
        self.setFont("Helvetica", 7.5)
        self.drawString(0.65 * inch, 0.40 * inch, f"Inventive Harvest Confidential  |  Official Document  |  Drafted {TODAY}")
        self.drawRightString(7.85 * inch, 0.40 * inch, f"Page {self._pageNumber} of {page_count}")
        self.restoreState()


def get_styles():
    base = getSampleStyleSheet()

    styles = {
        "DocTitle": ParagraphStyle(
            name="DocTitle",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=16,
            leading=20,
            textColor=COLOR_NAVY,
            alignment=1,
            spaceAfter=4,
        ),
        "DocSubtitle": ParagraphStyle(
            name="DocSubtitle",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=13,
            textColor=COLOR_PRIMARY,
            alignment=1,
            spaceAfter=4,
        ),
        "DocMeta": ParagraphStyle(
            name="DocMeta",
            parent=base["Normal"],
            fontName="Helvetica-Oblique",
            fontSize=8,
            leading=11,
            textColor=COLOR_MUTED,
            alignment=1,
            spaceAfter=8,
        ),
        "Section": ParagraphStyle(
            name="Section",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=14,
            textColor=COLOR_PRIMARY,
            spaceBefore=8,
            spaceAfter=4,
            keepWithNext=True,
        ),
        "SubSection": ParagraphStyle(
            name="SubSection",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=9.5,
            leading=12,
            textColor=COLOR_ACCENT,
            spaceBefore=6,
            spaceAfter=3,
            keepWithNext=True,
        ),
        "Body": ParagraphStyle(
            name="Body",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11.5,
            textColor=colors.black,
            spaceAfter=4,
        ),
        "BodyBold": ParagraphStyle(
            name="BodyBold",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8.5,
            leading=11.5,
            textColor=COLOR_NAVY,
            spaceAfter=3,
        ),
        "Bullet": ParagraphStyle(
            name="Bullet",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8.3,
            leading=11,
            leftIndent=12,
            firstLineIndent=-8,
            spaceAfter=2.5,
        ),
        "Callout": ParagraphStyle(
            name="Callout",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8,
            leading=10.5,
            textColor=COLOR_NAVY,
        ),
        "TableHead": ParagraphStyle(
            name="TableHead",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=COLOR_NAVY,
        ),
        "TableCell": ParagraphStyle(
            name="TableCell",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=7.8,
            leading=10,
            textColor=colors.black,
        ),
        "TableCellBold": ParagraphStyle(
            name="TableCellBold",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=7.8,
            leading=10,
            textColor=COLOR_NAVY,
        ),
    }
    return styles


STYLES = get_styles()


def make_callout(text, is_alert=False):
    bg = COLOR_ALERT_BG if is_alert else COLOR_LIGHT_BG
    b_color = COLOR_ALERT_BORDER if is_alert else COLOR_ACCENT
    p = Paragraph(text, STYLES["Callout"])
    t = Table([[p]], colWidths=[7.2 * inch])
    t.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), bg),
            ("BOX", (0, 0), (-1, -1), 0.75, b_color),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ])
    )
    return t


def build_contract_pdf():
    story = []
    
    # Title
    story.append(Paragraph("INVENTIVE HARVEST", STYLES["DocTitle"]))
    story.append(Paragraph("CONTRACT OF EMPLOYMENT", STYLES["DocSubtitle"]))
    story.append(Paragraph(f"Commercial Retail Operations  •  Dub Dub | Kipasa | Trade Center | Head Office  •  Date: {TODAY}", STYLES["DocMeta"]))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_ACCENT, spaceAfter=8, spaceBefore=0))

    story.append(make_callout(
        "<b>CONFIDENTIAL & LEGALLY BINDING:</b> This Agreement sets forth the definitive terms, conditions, rights, "
        "and duties governing employment at Inventive Harvest. Both the Employee and the Authorised Company Signatory "
        "must complete all fields, initial each page, and sign in duplicate before duties commence."
    ))
    story.append(Spacer(1, 6))

    # Particulars Table
    story.append(Paragraph("EMPLOYMENT PARTICULARS & COMMENCEMENT", STYLES["Section"]))
    particulars_data = [
        [Paragraph("Employer Name", STYLES["TableCellBold"]), Paragraph("INVENTIVE HARVEST (Operating: Dub Dub, Kipasa, Trade Center & Outlets)", STYLES["TableCell"])],
        [Paragraph("Employee Full Name", STYLES["TableCellBold"]), Paragraph("[Insert Employee Full Legal Name]", STYLES["TableCell"])],
        [Paragraph("National ID / NRC / Passport", STYLES["TableCellBold"]), Paragraph("[Insert National Registration / ID / Passport Number]", STYLES["TableCell"])],
        [Paragraph("Residential Address", STYLES["TableCellBold"]), Paragraph("[Insert Current Physical Residential Address]", STYLES["TableCell"])],
        [Paragraph("Contact Telephone(s)", STYLES["TableCellBold"]), Paragraph("[Insert Primary Mobile Number] / [Insert Alternate]", STYLES["TableCell"])],
        [Paragraph("Emergency Contact", STYLES["TableCellBold"]), Paragraph("[Insert Contact Name, Relationship, and Phone Number]", STYLES["TableCell"])],
        [Paragraph("Designation / Role", STYLES["TableCellBold"]), Paragraph("[Insert: Cashier / Shop Assistant / Branch Supervisor / Store Manager]", STYLES["TableCell"])],
        [Paragraph("Assigned Primary Branch", STYLES["TableCellBold"]), Paragraph("[Insert: Dub Dub / Kipasa / Trade Center / Head Office]", STYLES["TableCell"])],
        [Paragraph("Reporting Line", STYLES["TableCellBold"]), Paragraph("Branch Supervisor / Store Manager / Managing Director", STYLES["TableCell"])],
        [Paragraph("Commencement Date", STYLES["TableCellBold"]), Paragraph("[Insert Start Date, e.g., 01 October 2026]", STYLES["TableCell"])],
        [Paragraph("Employment Basis", STYLES["TableCellBold"]), Paragraph("Permanent Full-Time, subject to successful completion of Probation", STYLES["TableCell"])],
        [Paragraph("Probationary Period", STYLES["TableCellBold"]), Paragraph("Three (3) calendar months from Commencement Date (extendable by up to 3 months)", STYLES["TableCell"])],
        [Paragraph("Gross Basic Remuneration", STYLES["TableCellBold"]), Paragraph("[Insert Currency & Amount, e.g., USD / ZMW __________] per month", STYLES["TableCell"])],
        [Paragraph("Payment Date & Method", STYLES["TableCellBold"]), Paragraph("Paid monthly in arrears on or before the 28th via Bank / Mobile Money / Pay Slip", STYLES["TableCell"])],
        [Paragraph("Normal Working Hours", STYLES["TableCellBold"]), Paragraph("44 to 48 hours per week on rostered shifts (minimum 1 statutory rest day per 7-day cycle)", STYLES["TableCell"])],
    ]
    t_part = Table(particulars_data, colWidths=[2.2 * inch, 5.0 * inch])
    t_part.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), COLOR_LIGHT_BG),
        ("GRID", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(t_part)
    story.append(Spacer(1, 6))

    # Core Sections
    sections = [
        ("1. APPOINTMENT, SCOPE OF DUTIES & MOBILITY", [
            "<b>1.1 Appointment:</b> The Employer employs the Employee, and the Employee accepts employment to perform all duties faithfully and diligently in accordance with this Agreement and the Workplace Policies.",
            "<b>1.2 Duties & Responsibilities:</b> Primary duties include Point-of-Sale (POS) operations, till management, inventory display, stock counting, customer service, and shop cleanliness as detailed in Schedule A.",
            "<b>1.3 Branch Mobility:</b> The Employee explicitly recognizes that Inventive Harvest operates retail outlets across Dub Dub, Kipasa, and Trade Center. The Company reserves the operational right to rotate or transfer the Employee between branches upon reasonable operational notice.",
        ]),
        ("2. PROBATION & PERFORMANCE EVALUATION", [
            "<b>2.1 Probation Duration:</b> The first three (3) months of employment constitute a probationary period during which suitability, punctuality, integrity, cash accuracy, and customer demeanour are assessed.",
            "<b>2.2 Extension:</b> Management may extend probation for an additional period not exceeding three (3) months where corrective training is warranted.",
            "<b>2.3 Notice During Probation:</b> Either party may terminate employment during probation by giving one (1) week's written notice or basic salary in lieu thereof.",
        ]),
        ("3. REMUNERATION, DEDUCTIONS & OVERTIME", [
            "<b>3.1 Remuneration:</b> Gross basic salary shall be paid monthly in arrears on or before the monthly pay date.",
            "<b>3.2 Statutory Deductions:</b> The Employer shall deduct statutory employee contributions (PAYE income tax, social security/pension, and national health insurance) as required by law.",
            "<b>3.3 Consented Deductions for Loss/Shortage:</b> The Employee irrevocably consents to lawful salary deductions for proven till shortages, unverified cash variances occurring on the Employee's shift, unreturned advances, or proven company asset losses occurring through the Employee's wilful default or negligence.",
            "<b>3.4 Overtime:</b> All overtime requires prior written authorization from the supervisor or Managing Director and shall be compensated in accordance with applicable statutory standards.",
        ]),
        ("4. STRICT CASH HANDLING, POS & TILL INTEGRITY", [
            "<b>4.1 Mandatory POS Rule:</b> EVERY SINGLE customer transaction must be entered into the POS system (or pre-numbered manual backup register during power outages) BEFORE merchandise is released to the customer. No unrecorded sales are permitted under any circumstances.",
            "<b>4.2 Official Customer Receipts:</b> Cashiers must issue an official printed POS receipt to every customer. Discarding receipts or failing to issue them is a disciplinary offense.",
            "<b>4.3 Shift Float & Closing Counts:</b> Cashiers must perform joint opening and closing cash counts with the supervisor and sign the Daily Cash Register Control Sheet daily.",
            "<b>4.4 Bucket Separation:</b> Sales takings, Operations funds, Rent reserve, and Savings/Black Box reserves must remain strictly segregated. Commingling funds or paying operational expenses directly from till cash without a formal voucher is prohibited.",
            "<b>4.5 Absolute Ban on IOUs & Borrowing:</b> Taking money from the till for personal use, placing IOUs ('chits') in the cash drawer, or storing personal cash in the company till constitutes gross misconduct and criminal theft.",
        ]),
        ("5. INVENTORY, TRANSFERS & LOSS PREVENTION", [
            "<b>5.1 Stock Inwarding:</b> All goods delivered to the branch must be inspected, verified against delivery invoices, and inwarded into the POS inventory before being placed on sales shelves.",
            "<b>5.2 Inter-Branch Transfers:</b> Stock transferred between Dub Dub, Kipasa, and Trade Center requires a pre-numbered Stock Transfer Voucher (STV) signed by both dispatching and receiving staff.",
            "<b>5.3 Physical Audits & Cycle Counts:</b> The Employee shall participate fully in weekly cycle counts and monthly full physical stocktakes.",
            "<b>5.4 Right to Search:</b> To protect inventory integrity, the Company reserves the lawful right to conduct reasonable physical searches of the Employee's bags, lockers, and parcels upon entering or departing Company premises.",
        ]),
        ("6. LEAVE ENTITLEMENTS & ABSENCE", [
            "<b>6.1 Annual Leave:</b> Paid annual leave accrues at two (2) working days per completed month of service (24 days/year) and must be requested fourteen (14) days in advance.",
            "<b>6.2 Sick Leave:</b> Employees must report incapacity at least two (2) hours prior to shift start. Medical practitioner certificates are required for absences over one (1) day.",
            "<b>6.3 Job Desertion:</b> Unauthorized absence for three (3) consecutive working days without communication is classified as job desertion, triggering immediate contract termination.",
        ]),
        ("7. CONFIDENTIALITY, NON-COMPETE & LOYALTY", [
            "<b>7.1 Non-Disclosure:</b> The Employee shall maintain strict confidentiality regarding supplier pricing, profit margins, turnover data, POS credentials, and business strategy during and after employment.",
            "<b>7.2 Conflict of Interest:</b> The Employee shall not engage in parallel private trading, sell personal goods on company premises, divert company customers, or accept kickbacks/commissions from suppliers.",
        ]),
        ("8. DISCIPLINE, TERMINATION & EXIT CLEARANCE", [
            "<b>8.1 Disciplinary Framework:</b> Progressive discipline shall be administered: Verbal Warning -> Written Warning -> Final Written Warning -> Summary Dismissal.",
            "<b>8.2 Gross Misconduct:</b> Offenses warranting summary dismissal without notice after a fair hearing include: theft, till manipulation, unrecorded sales, fraudulent records, unauthorized cash borrowing, intoxication on duty, violence, insubordination, and breach of confidentiality.",
            "<b>8.3 Notice of Termination:</b> After probation, either party may terminate employment with one (1) calendar month's written notice or basic salary in lieu thereof.",
            "<b>8.4 Asset Clearance:</b> Upon exit, all keys, passwords, tablets, uniforms, and company property must be returned before terminal dues are disbursed.",
        ]),
    ]

    for title, items in sections:
        story.append(Paragraph(title, STYLES["Section"]))
        for itm in items:
            story.append(Paragraph(itm, STYLES["Bullet"]))
        story.append(Spacer(1, 4))

    # Signatures
    story.append(Spacer(1, 6))
    story.append(Paragraph("EXECUTION AND ATTESTATION", STYLES["Section"]))
    story.append(Paragraph(
        "IN WITNESS WHEREOF, the Parties confirm that they have read, understood, and agreed to be bound by this Contract of Employment.",
        STYLES["Body"]
    ))
    story.append(Spacer(1, 4))

    sig_data = [
        [
            Paragraph("<b>FOR AND ON BEHALF OF INVENTIVE HARVEST</b>", STYLES["TableCellBold"]),
            Paragraph("<b>BY THE EMPLOYEE</b>", STYLES["TableCellBold"])
        ],
        [
            Paragraph("Authorised Signatory: __________________________<br/>Title: Managing Director / Authorised Representative<br/>Signature: ___________________________________<br/>Date: ______ / ______ / 20___<br/>Place: ______________________________________", STYLES["TableCell"]),
            Paragraph("Employee Full Name: __________________________<br/>National ID / NRC No: ________________________<br/>Signature: ___________________________________<br/>Date: ______ / ______ / 20___<br/>Place: ______________________________________", STYLES["TableCell"])
        ],
        [
            Paragraph("<b>EMPLOYER WITNESS:</b><br/>Name: ______________________________________<br/>Signature: ___________________________________<br/>Date: ______ / ______ / 20___", STYLES["TableCell"]),
            Paragraph("<b>EMPLOYEE WITNESS:</b><br/>Name: ______________________________________<br/>Signature: ___________________________________<br/>Date: ______ / ______ / 20___", STYLES["TableCell"])
        ]
    ]
    t_sig = Table(sig_data, colWidths=[3.6 * inch, 3.6 * inch])
    t_sig.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), COLOR_HEADER_BG),
        ("GRID", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(t_sig)

    # Build PDF
    pdf_path_desktop = DESKTOP / "INVENTIVE_HARVEST_EMPLOYMENT_CONTRACT.pdf"
    pdf_path_docs = DOCS_DIR / "INVENTIVE_HARVEST_EMPLOYMENT_CONTRACT.pdf"
    
    doc = SimpleDocTemplate(
        str(pdf_path_desktop),
        pagesize=LETTER,
        leftMargin=0.65 * inch,
        rightMargin=0.65 * inch,
        topMargin=0.85 * inch,
        bottomMargin=0.75 * inch,
    )
    doc.build(story, canvasmaker=NumberedCanvas)
    
    # Save copy to docs/
    pdf_path_docs.write_bytes(pdf_path_desktop.read_bytes())
    print(f"Contract PDF created at: {pdf_path_desktop}")


def build_policies_pdf():
    story = []
    
    # Title
    story.append(Paragraph("INVENTIVE HARVEST", STYLES["DocTitle"]))
    story.append(Paragraph("WORKPLACE POLICIES & OPERATING MANUAL", STYLES["DocSubtitle"]))
    story.append(Paragraph(f"Standard Operating Procedures  •  Dub Dub | Kipasa | Trade Center | Head Office  •  Version 2026.1", STYLES["DocMeta"]))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_ACCENT, spaceAfter=8, spaceBefore=0))

    story.append(make_callout(
        "<b>MANDATORY COMPLIANCE:</b> This manual governs all operational procedures, till standards, cashflow "
        "controls, inventory logistics, and staff conduct across Inventive Harvest retail branches. "
        "Every staff member must understand, observe, and adhere strictly to these rules as a condition of employment."
    ))
    story.append(Spacer(1, 6))

    policy_sections = [
        ("1. PROFESSIONAL ETHICS & CODE OF CONDUCT", [
            "<b>Customer Excellence:</b> Customers must be received with warmth, courtesy, and prompt attention. Rude, dismissive, or argumentative behaviour is strictly prohibited.",
            "<b>Uniform & Presentation:</b> Staff must wear company uniforms cleanly pressed with visible nametags throughout their shift.",
            "<b>Anti-Bribery & Integrity:</b> Soliciting or accepting kickbacks, personal discounts, gifts, or secret commissions from suppliers or customers is strictly forbidden.",
            "<b>No Moonlighting / Private Sales:</b> Employees may not sell private merchandise in the shop or divert company customers to personal accounts or competitors.",
            "<b>Zero Tolerance Harassment:</b> Sexual harassment, tribal discrimination, verbal abuse, bullying, or intimidation will result in immediate summary dismissal.",
        ]),
        ("2. SHOP OPERATIONS & POINT-OF-SALE (POS) STANDARD OPERATING PROCEDURES", [
            "<b>Opening Routine:</b> Morning staff must arrive 15 minutes before opening, inspect physical locks/grilles, perform joint float counts, and test POS hardware.",
            "<b>THE GOLDEN RULE: NO UNRECORDED SALES:</b> Every item leaving the shop MUST be entered into the POS system before merchandise is handed to the customer.",
            "<b>Mandatory Official Receipts:</b> Cashiers must hand an official printed POS receipt to every customer. Discarding receipts or failing to issue them is an offense.",
            "<b>Digital & Mobile Payments:</b> For payments made via Mobile Money (EcoCash, Airtel Money) or Bank Card, staff must verify receipt confirmation on the official terminal before releasing goods.",
            "<b>Offline / System Downtime SOP:</b> If power or POS fails, log every transaction line-by-line in the pre-numbered Manual Sales Register. Inward manual records into the POS immediately once system is restored.",
            "<b>Closing Routine:</b> Run the end-of-day Z-report, conduct physical cash counts, reconcile cash against expected totals, document variances, and secure all locks.",
        ]),
    ]

    for title, items in policy_sections:
        story.append(Paragraph(title, STYLES["Section"]))
        for itm in items:
            story.append(Paragraph(itm, STYLES["Bullet"]))
        story.append(Spacer(1, 4))

    # Financial Buckets Table
    story.append(Paragraph("3. STRICT CASH MANAGEMENT & FINANCIAL BUCKET CONTROLS", STYLES["Section"]))
    story.append(Paragraph(
        "Inventive Harvest strictly segregates business capital into five (5) distinct, non-commingled financial buckets to prevent cash drift and unaccountable expenditure:",
        STYLES["Body"]
    ))
    story.append(Spacer(1, 2))

    bucket_data = [
        [Paragraph("Bucket Name", STYLES["TableHead"]), Paragraph("Authorized Purpose", STYLES["TableHead"]), Paragraph("Mandatory Control Mechanism", STYLES["TableHead"])],
        [
            Paragraph("<b>1. Shop Till (Sales)</b>", STYLES["TableCellBold"]),
            Paragraph("Daily customer sales takings and verified change float.", STYLES["TableCell"]),
            Paragraph("Must match daily POS Z-Report exactly. Zero direct expense payouts permitted.", STYLES["TableCell"])
        ],
        [
            Paragraph("<b>2. Operations Fund</b>", STYLES["TableCellBold"]),
            Paragraph("Approved operational expenses (procurement, utilities, transport).", STYLES["TableCell"]),
            Paragraph("Requires pre-numbered payment voucher with attached original VAT/cash receipt.", STYLES["TableCell"])
        ],
        [
            Paragraph("<b>3. Rent Reserve</b>", STYLES["TableCellBold"]),
            Paragraph("Ring-fenced monthly funds for shop rental obligations.", STYLES["TableCell"]),
            Paragraph("Strictly ring-fenced; cannot be borrowed or spent on stock or casual expenses.", STYLES["TableCell"])
        ],
        [
            Paragraph("<b>4. Savings / Black Box</b>", STYLES["TableCellBold"]),
            Paragraph("Protected contingency reserve for capital security and shocks.", STYLES["TableCell"]),
            Paragraph("Withdrawals restricted to written Managing Director / Owner authorization.", STYLES["TableCell"])
        ],
        [
            Paragraph("<b>5. Petty Cash</b>", STYLES["TableCellBold"]),
            Paragraph("Fixed imprest float for urgent emergency store supplies.", STYLES["TableCell"]),
            Paragraph("Imprest reconciliation: every single payout must be supported by a signed receipt.", STYLES["TableCell"])
        ],
    ]
    t_bucket = Table(bucket_data, colWidths=[1.8 * inch, 2.7 * inch, 2.7 * inch])
    t_bucket.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), COLOR_HEADER_BG),
        ("GRID", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(t_bucket)
    story.append(Spacer(1, 4))

    more_policy = [
        ("CASH OUTFLOW APPROVAL LIMITS & ABSOLUTE BAN ON IOUs", [
            "<b>Payment Vouchers:</b> Every cash outflow from Petty Cash or Operations funds requires a signed voucher detailing date, expense category, payee, approving supervisor, and attached receipt.",
            "<b>Approval Limits:</b> Up to $20 requires Branch Supervisor approval; $21 to $100 requires Managing Director approval; expenses over $100 require pre-documentation and executive authorization.",
            "<b>ABSOLUTE BAN ON IOUs & BORROWING:</b> Borrowing from the till or placing personal notes/IOUs in the cash drawer is strictly treated as criminal theft resulting in summary dismissal.",
            "<b>Cash Overages & Shortages:</b> Cash surpluses belong to the company and must be credited in the daily closing report. Cash shortages resulting from negligence must be made good by the responsible cashier.",
        ]),
        ("4. INVENTORY LOGISTICS & INTER-BRANCH TRANSFERS", [
            "<b>Stock Inwarding:</b> Verify all deliveries against invoices before shelving. Inward goods immediately into the POS to avoid negative stock.",
            "<b>Inter-Branch Transfers:</b> No stock may move between Dub Dub, Kipasa, and Trade Center without an authorized Stock Transfer Voucher (STV) signed by both dispatching and receiving staff.",
            "<b>Stock Audits:</b> Full participation in weekly cycle counts, monthly wall-to-wall stocktakes, and unannounced spot checks.",
            "<b>Damaged Goods:</b> Unsaleable items must be recorded in the Damaged Goods Register. Staff may not consume or discard damaged items without executive approval.",
        ]),
        ("5. WORKING HOURS, ATTENDANCE & LEAVE", [
            "<b>Rostered Shifts:</b> Rosters are published 3 days in advance. Informal shift swapping without supervisor approval is prohibited.",
            "<b>Punctuality:</b> Staff must be on the floor ready to trade at start time. Three unexcused late arrivals per month trigger formal disciplinary action.",
            "<b>Absence Notification:</b> Unplanned illness must be reported at least 2 hours before shift. Medical certificates required for absences exceeding 1 day.",
            "<b>Annual Leave:</b> Accrues at 2 days per month; must be requested 14 days in advance and is subject to operational peak requirements.",
        ]),
        ("6. SECURITY, IT & ASSET PROTECTION", [
            "<b>Key Security:</b> Keys remain with authorized keyholders; duplication or leaving keys unattended is strictly forbidden.",
            "<b>CCTV Monitoring:</b> Premises and till counters are under video surveillance. Tampering with cameras constitutes gross misconduct.",
            "<b>Right of Search:</b> Management reserves the right to conduct reasonable physical searches of bags, lockers, and parcels upon exit/entry.",
            "<b>POS Passwords & Phones:</b> Never share POS login credentials. Personal smartphones must be stored away during working hours; no personal browsing behind the till.",
        ]),
    ]

    for title, items in more_policy:
        story.append(Paragraph(title, STYLES["SubSection"]))
        for itm in items:
            story.append(Paragraph(itm, STYLES["Bullet"]))
        story.append(Spacer(1, 3))

    # Disciplinary Offenses Matrix
    story.append(Paragraph("7. DISCIPLINARY OFFENSES & CORRECTIVE SANCTIONS MATRIX", STYLES["Section"]))
    disc_data = [
        [Paragraph("Category", STYLES["TableHead"]), Paragraph("Offense Examples", STYLES["TableHead"]), Paragraph("1st Offense", STYLES["TableHead"]), Paragraph("2nd Offense", STYLES["TableHead"]), Paragraph("3rd Offense", STYLES["TableHead"])],
        [
            Paragraph("<b>Minor</b>", STYLES["TableCellBold"]),
            Paragraph("Late arrival (<15m), eating at counter, unkempt uniform, personal phone at till.", STYLES["TableCell"]),
            Paragraph("Verbal Warning", STYLES["TableCell"]),
            Paragraph("Written Warning", STYLES["TableCell"]),
            Paragraph("Final Warning", STYLES["TableCell"])
        ],
        [
            Paragraph("<b>Serious</b>", STYLES["TableCellBold"]),
            Paragraph("Till shortage, failing to issue receipt, unauthorized absence (1-2 days), insubordination.", STYLES["TableCell"]),
            Paragraph("Written Warning", STYLES["TableCell"]),
            Paragraph("Final Warning", STYLES["TableCell"]),
            Paragraph("Hearing / Dismissal", STYLES["TableCell"])
        ],
        [
            Paragraph("<b>Gross Misconduct</b>", STYLES["TableCellBold"]),
            Paragraph("Theft, unrecorded sales, till manipulation, IOUs, drunkenness on duty, violence, desertion.", STYLES["TableCell"]),
            Paragraph("<b>Dismissal</b> (upon fair hearing)", STYLES["TableCellBold"]),
            Paragraph("—", STYLES["TableCell"]),
            Paragraph("—", STYLES["TableCell"])
        ],
    ]
    t_disc = Table(disc_data, colWidths=[1.1 * inch, 2.5 * inch, 1.2 * inch, 1.2 * inch, 1.2 * inch])
    t_disc.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), COLOR_HEADER_BG),
        ("GRID", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(t_disc)
    story.append(Spacer(1, 6))

    # Acknowledgment Form
    story.append(Paragraph("8. EMPLOYEE POLICY COMPLIANCE UNDERTAKING", STYLES["Section"]))
    story.append(Paragraph(
        "I hereby declare that I have received, read, and understood the Inventive Harvest Workplace Policies & Operating Manual. "
        "I agree to comply strictly with all cash handling, POS controls, inventory rules, and disciplinary standards outlined herein.",
        STYLES["Body"]
    ))
    story.append(Spacer(1, 4))

    ack_data = [
        [
            Paragraph("<b>Employee Full Name:</b> ___________________________", STYLES["TableCell"]),
            Paragraph("<b>National ID / NRC No:</b> ___________________________", STYLES["TableCell"])
        ],
        [
            Paragraph("<b>Assigned Branch:</b> [ ] Dub Dub  [ ] Kipasa  [ ] Trade Center", STYLES["TableCell"]),
            Paragraph("<b>Position:</b> ______________________________________", STYLES["TableCell"])
        ],
        [
            Paragraph("<b>Employee Signature:</b> ___________________________", STYLES["TableCell"]),
            Paragraph("<b>Date:</b> ______ / ______ / 20___", STYLES["TableCell"])
        ],
        [
            Paragraph("<b>Supervisor / Witness Name:</b> ____________________", STYLES["TableCell"]),
            Paragraph("<b>Supervisor Signature & Date:</b> ___________________", STYLES["TableCell"])
        ],
    ]
    t_ack = Table(ack_data, colWidths=[3.6 * inch, 3.6 * inch])
    t_ack.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ("BACKGROUND", (0, 0), (-1, -1), COLOR_LIGHT_BG),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(t_ack)

    # Build PDF
    pdf_path_desktop = DESKTOP / "INVENTIVE_HARVEST_WORKPLACE_POLICIES.pdf"
    pdf_path_docs = DOCS_DIR / "INVENTIVE_HARVEST_WORKPLACE_POLICIES.pdf"
    
    doc = SimpleDocTemplate(
        str(pdf_path_desktop),
        pagesize=LETTER,
        leftMargin=0.65 * inch,
        rightMargin=0.65 * inch,
        topMargin=0.85 * inch,
        bottomMargin=0.75 * inch,
    )
    doc.build(story, canvasmaker=NumberedCanvas)
    
    # Save copy to docs/
    pdf_path_docs.write_bytes(pdf_path_desktop.read_bytes())
    print(f"Policies PDF created at: {pdf_path_desktop}")


if __name__ == "__main__":
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    build_contract_pdf()
    build_policies_pdf()
