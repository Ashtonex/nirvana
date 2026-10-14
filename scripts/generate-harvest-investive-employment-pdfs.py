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
)


DESKTOP = Path.home() / "Desktop" / "Harvest Investive Employment Documents"
REPORTS = Path("reports") / "Harvest Investive Employment Documents"
TODAY = date.today().strftime("%d %B %Y")


def money_placeholder():
    return "[Insert amount and pay frequency]"


def styles():
    base = getSampleStyleSheet()
    base.add(
        ParagraphStyle(
            name="DocTitle",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=18,
            leading=22,
            textColor=colors.HexColor("#0B2545"),
            alignment=1,
            spaceAfter=8,
        )
    )
    base.add(
        ParagraphStyle(
            name="Subtitle",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#50565E"),
            alignment=1,
            spaceAfter=12,
        )
    )
    base.add(
        ParagraphStyle(
            name="Section",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=16,
            textColor=colors.HexColor("#1F4D78"),
            spaceBefore=10,
            spaceAfter=6,
        )
    )
    base.add(
        ParagraphStyle(
            name="Body",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9.3,
            leading=12,
            spaceAfter=5,
        )
    )
    base.add(
        ParagraphStyle(
            name="HIBullet",
            parent=base["Body"],
            leftIndent=14,
            firstLineIndent=-8,
            bulletIndent=4,
        )
    )
    base.add(
        ParagraphStyle(
            name="Small",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#555555"),
        )
    )
    return base


STYLES = styles()


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#69727D"))
    canvas.drawString(0.75 * inch, 0.45 * inch, "Harvest Investive employment documents - draft for review before signature")
    canvas.drawRightString(7.75 * inch, 0.45 * inch, f"Page {doc.page}")
    canvas.restoreState()


def p(text, style="Body"):
    return Paragraph(str(text), STYLES[style])


def bullets(items):
    flow = []
    for item in items:
        flow.append(Paragraph(f"- {item}", STYLES["HIBullet"]))
    return flow


def numbered(items):
    flow = []
    for idx, item in enumerate(items, 1):
        flow.append(Paragraph(f"{idx}. {item}", STYLES["HIBullet"]))
    return flow


def note_box():
    text = (
        "<b>Legal review note:</b> This is a practical draft for internal use. "
        "Before signing, Harvest Investive should confirm the correct NEC/CBA, minimum wage, leave, notice, "
        "and disciplinary-code requirements applicable to the business and location."
    )
    table = Table([[p(text, "Small")]], colWidths=[6.75 * inch])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F4F6F9")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#D0D7DE")),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return table


def metadata_table(rows):
    data = [[p(f"<b>{label}</b>", "Small"), p(value, "Small")] for label, value in rows]
    table = Table(data, colWidths=[1.8 * inch, 4.95 * inch], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D0D7DE")),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F2F4F7")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return table


def signature_table(employee_name, company_signatory="David Chaeruka / Authorised Representative"):
    rows = [
        [p("<b>For Harvest Investive</b>", "Small"), p("<b>Employee</b>", "Small")],
        [p(company_signatory, "Small"), p(employee_name, "Small")],
        [p("Signature: ______________________________", "Small"), p("Signature: ______________________________", "Small")],
        [p("Date: __________________", "Small"), p("Date: __________________", "Small")],
    ]
    table = Table(rows, colWidths=[3.35 * inch, 3.35 * inch], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D0D7DE")),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F2F4F7")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return table


def section(flow, title):
    flow.append(Paragraph(title, STYLES["Section"]))


def contract_flow(employee):
    flow = [
        p("Employment Contract", "DocTitle"),
        p(f"{employee['name']} - {employee['role']} - {employee['shop']}", "Subtitle"),
        p(f"Prepared for Harvest Investive | Draft date: {TODAY}", "Subtitle"),
        note_box(),
        Spacer(1, 10),
    ]
    section(flow, "1. Appointment")
    flow.append(
        p(
            f"Harvest Investive appoints {employee['name']} as {employee['role']} assigned to {employee['shop']} on the terms set out in this contract. The employee accepts the appointment and agrees to perform duties honestly, carefully, and in the best interests of Harvest Investive."
        )
    )
    section(flow, "2. Key Employment Particulars")
    flow.append(
        metadata_table(
            [
                ("Employer", "Harvest Investive"),
                ("Employee", employee["name"]),
                ("Role", employee["role"]),
                ("Assigned shop/base", employee["shop"]),
                ("Start date", "[Insert start date]"),
                ("Employment type", employee.get("employment_type", "Full-time permanent, subject to probation")),
                ("Probation", "Three months, subject to lawful review and fair process"),
                ("Basic salary/wage", money_placeholder()),
                ("Normal working days/hours", "[Insert roster, opening hours, lunch/rest arrangements, and weekly rest day]"),
                ("Reporting line", employee.get("reporting", "Managing Director / Shop Supervisor")),
            ]
        )
    )
    section(flow, "3. Duties and Performance Standards")
    flow.extend(bullets(employee["duties"]))
    flow.extend(
        bullets(
            [
                "Follow all Harvest Investive policies, shop rules, stock controls, POS controls, cash controls, and lawful instructions.",
                "Protect company stock, cash, equipment, records, passwords, supplier information, and customer information.",
                "Report suspected theft, cash variance, stock loss, fraud, misconduct, or unsafe work conditions immediately.",
            ]
        )
    )
    section(flow, "4. Cash, Stock, and POS Accountability")
    flow.extend(
        bullets(
            [
                "No employee may remove cash, stock, receipts, devices, or records without written approval.",
                "All sales must be entered into the approved POS or written manual backup register before stock leaves the shop.",
                "Cash drawer counts, handovers, banking, savings, black box, rent reserve, and Operations transfers must match the daily record.",
                "Unexplained shortages, false entries, deliberate under-ringing, unauthorised discounts, or private use of company money may lead to disciplinary action.",
            ]
        )
    )
    section(flow, "5. Pay, Benefits, Deductions, and Records")
    flow.append(
        p(
            "Salary, allowances, benefits, commission, deductions, and payment dates must be recorded in writing. Any lawful deductions must be explained to the employee and supported by company records, applicable law, or written agreement where required."
        )
    )
    section(flow, "6. Leave, Public Holidays, Sickness, and Absence")
    flow.extend(
        bullets(
            [
                "Leave, public holidays, sick leave, and other statutory benefits will be handled in line with applicable Zimbabwean law, the relevant NEC/CBA where applicable, and company policy.",
                "Absence must be reported to the reporting line before shift start unless impossible.",
                "Sick leave may require medical proof where lawful and reasonable.",
            ]
        )
    )
    section(flow, "7. Confidentiality and Conflict of Interest")
    flow.extend(
        bullets(
            [
                "The employee must keep business information confidential during and after employment.",
                "The employee must not run competing sales, divert customers, use company suppliers privately, or take side payments from suppliers or customers.",
                "Any family, supplier, customer, or personal relationship that may affect business decisions must be disclosed.",
            ]
        )
    )
    section(flow, "8. Discipline, Grievance, and Termination")
    flow.extend(
        bullets(
            [
                "Discipline and grievance matters will be handled fairly and in line with applicable law, any registered employment code, and the relevant NEC/CBA where applicable.",
                "Termination may occur through resignation, mutual agreement, expiry of a fixed term if applicable, dismissal after fair process, retrenchment, or any other lawful ground.",
                "On termination, the employee must return all company property, cash, stock, records, uniforms, keys, passwords, and devices immediately.",
            ]
        )
    )
    section(flow, "9. Entire Agreement")
    flow.append(
        p(
            "This contract, the Harvest Investive Work Policy, and any written salary or role schedule form the employment agreement. Any changes must be recorded in writing and signed or acknowledged by the parties."
        )
    )
    section(flow, "Signatures")
    flow.append(signature_table(employee["name"], employee.get("company_signatory", "Authorised Representative")))
    return flow


def policy_flow():
    flow = [
        p("Harvest Investive Work Policy", "DocTitle"),
        p("Applies to Dub Dub, Kipasa, and Trade Center", "Subtitle"),
        p(f"Prepared for Harvest Investive | Draft date: {TODAY}", "Subtitle"),
        note_box(),
        Spacer(1, 10),
    ]
    section(flow, "1. Purpose")
    flow.append(
        p(
            "This policy creates one operating standard for Harvest Investive shops: Dub Dub, Kipasa, and Trade Center. It is intended to protect cash, stock, staff, customers, records, and owner capital."
        )
    )
    section(flow, "2. Core Rules")
    flow.extend(
        bullets(
            [
                "Every sale must be recorded before stock leaves the shop.",
                "Every cash movement must have a reason, amount, person responsible, date, and proof.",
                "No Operations, savings, black box, rent reserve, stock purchase, or banking entry may be made without a matching note or receipt.",
                "No one may borrow company cash or stock without written owner approval.",
                "Each shop must close daily with a signed cash count, stock issue note where relevant, and variance explanation.",
            ]
        )
    )
    section(flow, "3. Shop Roles and Accountability")
    flow.append(
        metadata_table(
            [
                ("Dub Dub", "Two assigned shop employees. Responsible for POS, customer service, cash drawer, stock display, and daily handover."),
                ("Trade Center", "Two assigned shop employees. Responsible for POS, customer service, cash drawer, stock display, and daily handover."),
                ("Kipasa", "Two assigned shop employees. Responsible for POS, customer service, cash drawer, stock display, and daily handover."),
                ("MD/CEO", "Responsible for financial discipline, owner reporting, approvals, staff oversight, procurement discipline, and policy enforcement."),
            ]
        )
    )
    section(flow, "4. Cash Handling Policy")
    flow.extend(
        numbered(
            [
                "Each shift starts with an opening cash count signed by the person taking responsibility for the drawer.",
                "All cash sales, EcoCash/mobile money sales, lay-bys, refunds, expenses, savings, black box, rent reserve, and Operations transfers must be recorded the same day.",
                "Cash may not be mixed with personal money.",
                "Cash shortages must be reported immediately and recorded before the shop closes.",
                "Cash overages are company money and must be recorded. Staff may not keep overages.",
                "Banking must be supported by a deposit slip, bank confirmation, or owner acknowledgement.",
            ]
        )
    )
    sections = [
        (
            "5. Operations, Savings, Black Box, and Rent Reserve",
            [
                "Savings and black box money must be treated as protected business money, not casual spend money.",
                "Rent reserve must be ring-fenced monthly. If the company budgets USD 2,000 and pays USD 1,200 rent, the USD 800 difference must remain visible in a reserve record.",
                "Operations payouts require a category: stock order, rent, tax, banking, salaries, utilities, transport, supplier/payable, maintenance, or owner-approved other.",
                "Generic labels such as 'Round', 'Balance', 'Person name only', 'Adjustment', or 'Other' are not acceptable without supporting explanation.",
                "Any Operations payout over USD 100 requires proof. Any payout over USD 500 requires owner approval and proof before or immediately after payment.",
            ],
        ),
        (
            "6. Stock Purchasing and Inventory",
            [
                "Stock orders must have supplier, amount, date, receiving shop, expected items, and proof of payment.",
                "Stock received must be checked against the order before it is sold.",
                "Damaged, missing, returned, or transferred stock must be recorded.",
                "Staff may not take stock on credit or for personal use unless authorised in writing.",
            ],
        ),
        (
            "7. Expenses, Salaries, and Approvals",
            [
                "Routine shop expenses must be pre-approved where possible and recorded with receipts.",
                "Salary and wage payments must be recorded separately from stock, rent, banking, and owner drawings.",
                "Tax must be recorded separately from banking. The business must not hide ordinary cash movement inside a tax/banking label.",
                "Owner drawings, loans, or advances must be labelled separately and cannot be treated as operating expenses.",
            ],
        ),
        (
            "8. Attendance, Conduct, and Customer Service",
            [
                "Staff must report on time, dress neatly, serve customers respectfully, and keep the shop clean.",
                "Staff must not drink alcohol, use drugs, gamble, fight, harass others, or bring the company into disrepute during work.",
                "Phones may be used for business communication but must not interfere with customers, cash handling, or stock control.",
                "Customer complaints must be escalated to the MD/CEO or owner.",
            ],
        ),
        (
            "9. Discipline and Grievance Procedure",
            [
                "Misconduct will be handled fairly and proportionately.",
                "Serious misconduct may include theft, fraud, falsifying records, unauthorised cash use, violence, gross negligence, or deliberate stock loss.",
                "Employees may raise grievances without victimisation. The complaint must be recorded, investigated, and responded to.",
                "Where an NEC/CBA or registered employment code applies, it must be followed.",
            ],
        ),
        (
            "10. Daily Required Records",
            [
                "Opening cash count.",
                "Daily sales report.",
                "Expense and payout register with receipts.",
                "Savings, black box, rent reserve, and Operations transfer register.",
                "Closing cash count and variance note.",
                "Stock received, stock transferred, and stock lost/damaged register.",
            ],
        ),
    ]
    for heading, items in sections:
        section(flow, heading)
        flow.extend(bullets(items))
    section(flow, "11. Acknowledgement")
    flow.append(
        p(
            "Each employee must sign acknowledgement that they received, understood, and agreed to follow this policy. Refusal to follow the policy may lead to disciplinary action."
        )
    )
    section(flow, "Signatures")
    flow.append(signature_table("Employee", "David Chaeruka / Authorised Representative"))
    return flow


EMPLOYEES = [
    {
        "name": "David Chaeruka",
        "role": "Managing Director / Chief Executive Officer",
        "shop": "Harvest Investive Head Office / All Shops",
        "reporting": "Owner / Shareholders",
        "company_signatory": "Owner / Authorised Representative",
        "duties": [
            "Lead daily operations across Dub Dub, Kipasa, and Trade Center.",
            "Enforce cash controls, rent reserve controls, stock purchasing controls, and staff discipline.",
            "Prepare weekly owner reports covering sales, cash, stock, expenses, rent reserve, black box, savings, and Operations payouts.",
            "Approve staff rosters, investigate variances, maintain supplier discipline, and escalate risks promptly.",
            "Protect company strategy, finances, staff records, supplier relationships, and owner instructions.",
        ],
    },
    {
        "name": "[Dub Dub Employee 1]",
        "role": "Shop Assistant / Cashier",
        "shop": "Dub Dub",
        "duties": ["Open and close the shop as rostered.", "Record sales, receive customers, maintain displays, and protect the cash drawer.", "Record savings, black box, rent reserve, and Operations transfers exactly as instructed.", "Assist with stock counts, stock receiving, cleaning, and daily handover."],
    },
    {
        "name": "[Dub Dub Employee 2]",
        "role": "Shop Assistant / Cashier",
        "shop": "Dub Dub",
        "duties": ["Serve customers, process sales, maintain shop cleanliness, and protect stock.", "Support cash counts, POS entries, expense records, and handover notes.", "Report all variances, customer complaints, stock issues, and suspicious activity immediately."],
    },
    {
        "name": "[Trade Center Employee 1]",
        "role": "Shop Assistant / Cashier",
        "shop": "Trade Center",
        "duties": ["Open and close the Trade Center shop as rostered.", "Record sales accurately and maintain customer service standards.", "Handle cash, stock, and transfer records according to policy.", "Assist with stock checks, receiving, cleaning, and daily reporting."],
    },
    {
        "name": "[Trade Center Employee 2]",
        "role": "Shop Assistant / Cashier",
        "shop": "Trade Center",
        "duties": ["Serve customers, record sales, protect stock, and support shop presentation.", "Complete cash and stock handovers truthfully.", "Report shortages, overages, refunds, returns, and damaged stock immediately."],
    },
    {
        "name": "[Kipasa Employee 1]",
        "role": "Shop Assistant / Cashier",
        "shop": "Kipasa",
        "duties": ["Open and close the Kipasa shop as rostered.", "Record sales, maintain displays, protect cash, and manage customer service.", "Support daily cash count, stock count, transfer records, and expense documentation."],
    },
    {
        "name": "[Kipasa Employee 2]",
        "role": "Shop Assistant / Cashier",
        "shop": "Kipasa",
        "duties": ["Serve customers and record all sales before stock leaves the shop.", "Protect the cash drawer and company stock during shifts.", "Report stock issues, cash variances, and suspicious activity immediately."],
    },
]


def build_pdf(path, flow):
    doc = SimpleDocTemplate(
        str(path),
        pagesize=LETTER,
        rightMargin=0.75 * inch,
        leftMargin=0.75 * inch,
        topMargin=0.7 * inch,
        bottomMargin=0.65 * inch,
    )
    doc.build(flow, onFirstPage=footer, onLaterPages=footer)


def safe_filename(value):
    return value.replace("[", "").replace("]", "").replace("/", "-")


def main():
    DESKTOP.mkdir(parents=True, exist_ok=True)
    REPORTS.mkdir(parents=True, exist_ok=True)
    docs = [("Harvest Investive - Work Policy - Dub Dub Kipasa Trade Center.pdf", policy_flow())]
    for employee in EMPLOYEES:
        docs.append(
            (
                f"Employment Contract - {safe_filename(employee['name'])} - {employee['shop'].replace('/', '-')}.pdf",
                contract_flow(employee),
            )
        )

    created = []
    for filename, flow in docs:
        desktop_path = DESKTOP / filename
        reports_path = REPORTS / filename
        build_pdf(desktop_path, flow)
        # Rebuild separately because flowables are consumed during build.
        if filename.startswith("Harvest Investive"):
            copy_flow = policy_flow()
        else:
            employee = next(e for e in EMPLOYEES if safe_filename(e["name"]) in filename)
            copy_flow = contract_flow(employee)
        build_pdf(reports_path, copy_flow)
        created.append(desktop_path)

    print("\n".join(str(path) for path in created))


if __name__ == "__main__":
    main()
