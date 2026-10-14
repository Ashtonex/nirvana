from pathlib import Path
from datetime import date

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER, landscape
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


DESKTOP = Path.home() / "Desktop"
REPORTS = Path("reports")
OUTPUT = DESKTOP / "August Cashflow Bucket Control System - Harvest Investive.pdf"
COPY_OUTPUT = REPORTS / "August Cashflow Bucket Control System - Harvest Investive.pdf"
TODAY = date.today().strftime("%d %B %Y")


def styles():
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle(
        name="CoverTitle",
        parent=ss["Title"],
        fontName="Helvetica-Bold",
        fontSize=22,
        leading=27,
        textColor=colors.HexColor("#0B2545"),
        alignment=1,
        spaceAfter=10,
    ))
    ss.add(ParagraphStyle(
        name="Subtitle2",
        parent=ss["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=13,
        textColor=colors.HexColor("#50565E"),
        alignment=1,
        spaceAfter=10,
    ))
    ss.add(ParagraphStyle(
        name="H1x",
        parent=ss["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=15,
        leading=18,
        textColor=colors.HexColor("#1F4D78"),
        spaceBefore=10,
        spaceAfter=6,
    ))
    ss.add(ParagraphStyle(
        name="H2x",
        parent=ss["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=14,
        textColor=colors.HexColor("#2E74B5"),
        spaceBefore=8,
        spaceAfter=4,
    ))
    ss.add(ParagraphStyle(
        name="Bodyx",
        parent=ss["Normal"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=12.2,
        spaceAfter=5,
    ))
    ss.add(ParagraphStyle(
        name="Smallx",
        parent=ss["Normal"],
        fontName="Helvetica",
        fontSize=7.7,
        leading=9.5,
        spaceAfter=2,
    ))
    ss.add(ParagraphStyle(
        name="Bulletx",
        parent=ss["Bodyx"],
        leftIndent=14,
        firstLineIndent=-8,
    ))
    return ss


STYLES = styles()


def p(text, style="Bodyx"):
    return Paragraph(str(text), STYLES[style])


def h1(text):
    return Paragraph(str(text), STYLES["H1x"])


def h2(text):
    return Paragraph(str(text), STYLES["H2x"])


def bullets(items):
    return [p(f"- {item}", "Bulletx") for item in items]


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#69727D"))
    canvas.drawString(0.55 * inch, 0.38 * inch, "Harvest Investive - August cashflow bucket control system")
    canvas.drawRightString(doc.pagesize[0] - 0.55 * inch, 0.38 * inch, f"Page {doc.page}")
    canvas.restoreState()


def table(data, widths, header=True, font_size=7.3):
    formatted = []
    for row in data:
        formatted.append([cell if hasattr(cell, "wrap") else p(cell, "Smallx") for cell in row])
    t = Table(formatted, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    commands = [
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D0D7DE")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("FONTSIZE", (0, 0), (-1, -1), font_size),
    ]
    if header:
        commands.extend([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F2F4F7")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#0B2545")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ])
    t.setStyle(TableStyle(commands))
    return t


def note_box(text):
    t = Table([[p(text, "Smallx")]], colWidths=[7.25 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F4F6F9")),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#D0D7DE")),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return t


def build_story():
    flow = []
    flow.append(p("August Cashflow Bucket Control System", "CoverTitle"))
    flow.append(p("Harvest Investive - Dub Dub, Kipasa, and Trade Center", "Subtitle2"))
    flow.append(p(f"Start month: August 2026 | Prepared: {TODAY}", "Subtitle2"))
    flow.append(note_box(
        "<b>Purpose:</b> Stop cash from disappearing into one general Operations pool. From August, every dollar must be assigned to one of four buckets before it moves: Rent, Salaries, Stock, or Savings/Black Box."
    ))
    flow.append(Spacer(1, 10))
    flow.append(h1("1. The Four-Bucket Rule"))
    flow.append(p(
        "Every cash movement must belong to one of these four buckets. If a payment does not fit, it must be treated as an exception and approved by the owner before money leaves the business."
    ))
    flow.append(table([
        ["Bucket", "Purpose", "Allowed payments", "Hard rule"],
        ["Rent", "Protect rent money before it gets consumed.", "Shop rent, premises costs approved as rent reserve use.", "Rent reserve is not spending money. Unused rent balance carries forward."],
        ["Salaries", "Protect staff payroll.", "Approved wages, salaries, staff advances if authorised.", "Salary money cannot be borrowed for stock or petty expenses."],
        ["Stock", "Fund stock orders that create saleable inventory.", "Supplier payments, freight linked to stock, receiving-related costs.", "Every stock payment needs supplier, item list, proof, and stock received record."],
        ["Savings / Black Box", "Build retained cash and owner reserve.", "Owner-approved savings, black box deposits, protected retained cash.", "No withdrawal unless owner signs and reason is recorded."],
    ], [1.1 * inch, 1.7 * inch, 2.1 * inch, 2.35 * inch]))

    flow.append(h1("2. Movement Rules"))
    flow.extend(bullets([
        "No money moves without date, amount, bucket, reason, person requesting, person approving, and receipt/proof.",
        "The person who requests payment cannot be the only person approving it.",
        "Cash received from shops must be split into buckets before it is spent.",
        "Petty cash is not a fifth bucket. It is only a small payment method and must still point back to one of the four buckets.",
        "Generic descriptions are banned: Round, Balance, Other, Adjustment, Banking, Person-name-only, and Stock Order without supplier details.",
    ]))

    flow.append(PageBreak())
    flow.append(h1("3. Approval Levels"))
    flow.append(table([
        ["Amount", "Approval needed", "Proof needed", "When paid"],
        ["$0 - $20", "Shop lead or MD", "Receipt or petty cash slip", "Same day if valid"],
        ["$20.01 - $100", "MD approval", "Receipt plus bucket code", "Same day if valid"],
        ["$100.01 - $500", "MD + owner approval", "Receipt/proof, reason, bucket, expected benefit", "Before payment unless emergency"],
        ["Above $500", "Owner approval before payment", "Full proof pack and sign-off", "Before payment only"],
    ], [1.3 * inch, 2.0 * inch, 2.2 * inch, 1.75 * inch]))

    flow.append(PageBreak())
    flow.append(h1("4. August Opening Setup"))
    flow.append(p("Complete this once at the start of August 2026. The business must know what cash exists and where it belongs before new spending begins."))
    flow.append(table([
        ["Step", "Action", "Owner", "Done"],
        ["1", "Count all shop cash: Dub Dub, Kipasa, Trade Center.", "Shop staff + MD", ""],
        ["2", "Confirm bank cash and owner-held business cash.", "Owner + MD", ""],
        ["3", "Set opening balances for Rent, Salaries, Stock, Savings/Black Box.", "Owner + MD", ""],
        ["4", "Record any unpaid rent, unpaid salaries, supplier payables, or tax/banking obligations.", "MD", ""],
        ["5", "Start August daily cash close and bucket ledger.", "All shops", ""],
    ], [0.55 * inch, 3.5 * inch, 1.5 * inch, 0.8 * inch]))

    flow.append(h1("5. Monthly Bucket Targets"))
    flow.append(p("Use these targets as the first August control plan. Adjust only with owner approval."))
    flow.append(table([
        ["Bucket", "Monthly target", "When funded", "Minimum evidence"],
        ["Rent", "$2,000 target unless changed by owner", "Weekly or daily split from shop transfers", "Rent reserve register and rent receipt"],
        ["Salaries", "Set exact payroll budget before month starts", "Before payroll week", "Payroll list and signatures"],
        ["Stock", "Stock budget approved weekly", "Before supplier payment", "Supplier, item list, payment proof, stock received"],
        ["Savings / Black Box", "Protected reserve target", "After sales close or weekly owner sweep", "Deposit note and owner sign-off"],
    ], [1.35 * inch, 1.85 * inch, 1.9 * inch, 2.15 * inch]))

    flow.append(h1("6. Daily Cash Close"))
    flow.append(p("Every shop must close with this record. If cash is short or over, the variance must be written before staff leave."))
    flow.append(table([
        ["Date", "Shop", "Opening cash", "Cash sales", "Expenses paid", "Transfers to buckets", "Expected cash", "Actual cash", "Variance", "Staff sign"],
        *[["", "", "", "", "", "", "", "", "", ""] for _ in range(10)]
    ], [0.72 * inch, 0.75 * inch, 0.78 * inch, 0.78 * inch, 0.85 * inch, 1.05 * inch, 0.85 * inch, 0.78 * inch, 0.62 * inch, 0.87 * inch]))

    flow.append(PageBreak())
    flow.append(h1("7. Bucket Ledger"))
    flow.append(p("This is the main control. Every transfer into or out of Rent, Salaries, Stock, and Savings/Black Box must appear here."))
    flow.append(table([
        ["Date", "Bucket", "In", "Out", "Balance", "Reason", "Requested by", "Approved by", "Proof ref"],
        *[["", "", "", "", "", "", "", "", ""] for _ in range(15)]
    ], [0.72 * inch, 1.1 * inch, 0.65 * inch, 0.65 * inch, 0.75 * inch, 1.75 * inch, 1.0 * inch, 1.0 * inch, 0.9 * inch]))

    flow.append(h1("8. Petty Cash Sign-Off"))
    flow.append(p("Petty cash only pays small approved items. Every petty cash payment still needs a bucket."))
    flow.append(table([
        ["Date", "Amount", "Bucket", "Paid to", "Reason", "Receipt yes/no", "Approved by", "Signature"],
        *[["", "", "", "", "", "", "", ""] for _ in range(10)]
    ], [0.72 * inch, 0.65 * inch, 1.05 * inch, 1.0 * inch, 1.75 * inch, 0.9 * inch, 1.0 * inch, 1.0 * inch]))

    flow.append(PageBreak())
    flow.append(h1("9. Weekly Owner Report"))
    flow.append(p("Every Monday, the MD should send this to the owner for the previous week."))
    flow.append(table([
        ["Line", "Dub Dub", "Kipasa", "Trade Center", "Total", "Owner notes"],
        ["Cash received", "", "", "", "", ""],
        ["Rent bucket balance", "", "", "", "", ""],
        ["Salaries bucket balance", "", "", "", "", ""],
        ["Stock bucket balance", "", "", "", "", ""],
        ["Savings / Black Box balance", "", "", "", "", ""],
        ["Petty cash spent", "", "", "", "", ""],
        ["Stock purchases paid", "", "", "", "", ""],
        ["Unapproved / unclear payments", "", "", "", "", ""],
        ["Cash variance", "", "", "", "", ""],
        ["Bank / physical cash held", "", "", "", "", ""],
    ], [1.75 * inch, 0.9 * inch, 0.9 * inch, 1.0 * inch, 0.8 * inch, 1.9 * inch]))

    flow.append(h1("10. Red Flags"))
    flow.extend(bullets([
        "Any bucket balance goes negative.",
        "Rent reserve is not visible as cash, bank, or signed reserve balance.",
        "Stock paid for but not received or not entered into inventory.",
        "Payment description is vague or person-name-only.",
        "Petty cash is topped up without receipts.",
        "Savings / Black Box withdrawal happens without owner signature.",
        "Daily cash close is skipped or signed late.",
    ]))

    flow.append(h1("11. First August Instruction"))
    flow.append(note_box(
        "From 1 August 2026, do not ask only 'how much money came in?' Ask: 'Which bucket did it go into, who approved the movement, and what proof shows it is still there or was used correctly?'"
    ))

    return flow


def build_pdf(path):
    doc = SimpleDocTemplate(
        str(path),
        pagesize=landscape(LETTER),
        rightMargin=0.55 * inch,
        leftMargin=0.55 * inch,
        topMargin=0.55 * inch,
        bottomMargin=0.58 * inch,
    )
    doc.build(build_story(), onFirstPage=footer, onLaterPages=footer)


def main():
    REPORTS.mkdir(parents=True, exist_ok=True)
    build_pdf(OUTPUT)
    build_pdf(COPY_OUTPUT)
    print(OUTPUT)
    print(COPY_OUTPUT)


if __name__ == "__main__":
    main()


