import sys
import json
import random
import datetime

def generate_report_html(scenario_name, simulations, summary):
    """
    Generates a rich HTML report for the stress test.
    """
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # Simple HTML template for the report
    html = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Nirvana Logic Stress Test: {scenario_name}</title>
        <style>
            body {{ font-family: 'Inter', system-ui, sans-serif; background: #020617; color: #f8fafc; padding: 40px; line-height: 1.6; }}
            .container {{ max-width: 900px; margin: 0 auto; }}
            header {{ border-bottom: 2px solid #8b5cf6; padding-bottom: 20px; margin-bottom: 40px; }}
            .badge {{ background: #8b5cf620; color: #a78bfa; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 800; text-transform: uppercase; border: 1px solid #8b5cf640; }}
            .grid {{ display: grid; grid-template-cols: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 40px; }}
            .card {{ background: #0f172a; border: 1px solid #1e293b; padding: 20px; rounded-radius: 12px; }}
            .card h3 {{ font-size: 10px; color: #64748b; text-transform: uppercase; margin: 0 0 10px 0; }}
            .card p {{ font-size: 24px; font-weight: 900; margin: 0; color: #e2e8f0; }}
            .trend-up {{ color: #10b981; }}
            .trend-down {{ color: #ef4444; }}
            section {{ margin-bottom: 40px; }}
            h2 {{ font-size: 18px; text-transform: uppercase; letter-spacing: 0.1em; color: #8b5cf6; border-left: 4px solid #8b5cf6; padding-left: 15px; }}
            table {{ width: 100%; border-collapse: collapse; margin-top: 20px; }}
            th {{ text-align: left; padding: 12px; background: #1e293b; font-size: 12px; text-transform: uppercase; color: #94a3b8; }}
            td {{ padding: 12px; border-bottom: 1px solid #1e293b; font-size: 14px; color: #cbd5e1; }}
            .footer {{ text-align: center; font-size: 10px; color: #475569; margin-top: 80px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <header>
                <div class="badge">Nirvana Intelligence v4.0 Simulation</div>
                <h1 style="font-size: 32px; font-weight: 900; margin: 10px 0;">STRESS TEST: {scenario_name}</h1>
                <p style="color: #64748b;">Generated on {now}</p>
            </header>

            <section class="grid">
                <div class="card">
                    <h3>Survival Probability</h3>
                    <p class="trend-up">{summary['survival_rate']}%</p>
                </div>
                <div class="card">
                    <h3>Peak Drawdown</h3>
                    <p class="trend-down">${summary['peak_drawdown']:,.2f}</p>
                </div>
                <div class="card">
                    <h3>Final Liquidity</h3>
                    <p>${summary['final_liquidity']:,.2f}</p>
                </div>
                <div class="card">
                    <h3>Critical Threshold</h3>
                    <p style="color: #f59e0b;">{summary['days_to_insolvency']} Days</p>
                </div>
            </section>

            <section>
                <h2>Simulation Outliers</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Path ID</th>
                            <th>Scenario Intensity</th>
                            <th>Revenue Impact</th>
                            <th>Outcome</th>
                        </tr>
                    </thead>
                    <tbody>
                        {summary['outliers_rows']}
                    </tbody>
                </table>
            </section>

            <section>
                <h2>Oracle Strategy</h2>
                <p style="font-style: italic; color: #94a3b8;">{summary['oracle_advice']}</p>
            </section>

            <div class="footer">
                NERV OS • LOGIC SIMULATION CORE [MONTE_CARLO]
            </div>
        </div>
    </body>
    </html>
    """
    return html

def run_simulation(data):
    """
    Core Monte Carlo simulation logic.
    """
    scenario_type = data.get("scenario", "Recession")
    inventory = data.get("inventory", [])
    sales = data.get("sales", [])
    ledger = data.get("ledger", [])
    cash_on_hand = data.get("cash_balance", 1000.0)
    
    # Constants
    def safe_float(v, default=0.0):
        try:
            return float(v) if v is not None else default
        except (ValueError, TypeError):
            return default

    # 1. Monthly Overhead calculation
    MONTHLY_OVERHEAD = sum(
        abs(safe_float(item.get("amount"))) 
        for item in ledger 
        if item.get("category") == "Overhead" and safe_float(item.get("amount")) < 0
    )
    if MONTHLY_OVERHEAD == 0: MONTHLY_OVERHEAD = 1500.0 # Fallback
    
    # 2. Daily Revenue calculation
    total_rev = sum(safe_float(s.get("total_with_tax")) for s in sales)
    AVG_DAILY_REVENUE = total_rev / 30 if len(sales) > 0 else 200.0
    
    simulations = []
    survival_count = 0
    total_drawdown = 0
    insolvency_day = 180

    for i in range(100): # 100 paths for speed
        path_cash = cash_on_hand
        path_revenue_mult = 1.0
        path_overhead_mult = 1.0
        
        # Scenarios modifiers
        if scenario_type == "Recession":
            path_revenue_mult = random.uniform(0.4, 0.8)
            path_overhead_mult = random.uniform(1.0, 1.3) # Inflation
        elif scenario_type == "Liquidation":
            path_revenue_mult = random.uniform(1.1, 1.5) # Fast sale
            path_overhead_mult = 1.0
        elif scenario_type == "Hypergrowth":
            path_revenue_mult = random.uniform(2.0, 3.5)
            path_overhead_mult = random.uniform(1.5, 2.0)
            
        path_alive = True
        for day in range(1, 181): # 6 month forecast
            daily_revenue = AVG_DAILY_REVENUE * path_revenue_mult * random.uniform(0.8, 1.2)
            daily_overhead = (MONTHLY_OVERHEAD / 30) * path_overhead_mult
            
            path_cash += (daily_revenue - daily_overhead)
            
            if path_cash < 0:
                path_alive = False
                insolvency_day = min(insolvency_day, day)
                break
        
        if path_alive: survival_count += 1
        simulations.append(path_cash)

    summary = {
        "survival_rate": survival_count,
        "peak_drawdown": min(simulations) if min(simulations) < 0 else 0,
        "final_liquidity": sum(simulations) / len(simulations),
        "days_to_insolvency": insolvency_day,
        "oracle_advice": "In the simulated scenario, current cash reserves are " + ("SUFFICIENT" if survival_count > 80 else "CRITICAL") + ". Recommend reducing inventory holdings to boost liquidity."
    }

    # Generate some table rows
    rows = ""
    for idx, cash in enumerate(simulations[:10]):
        outcome = "SURVIVED" if cash > 0 else "INSOLVENT"
        rows += f"<tr><td>SIM_{idx:03}</td><td>{scenario_type} Standard</td><td>${cash:,.2f}</td><td>{outcome}</td></tr>"
    summary['outliers_rows'] = rows

    return generate_report_html(scenario_type, simulations, summary)

if __name__ == "__main__":
    try:
        input_data = sys.stdin.read()
        if not input_data:
            print(json.dumps({"status": "error", "message": "No input received"}))
            sys.exit(1)
            
        payload = json.loads(input_data)
        report_html = run_simulation(payload)
        
        # Output result as JSON containing the HTML
        print(json.dumps({
            "status": "success",
            "report_html": report_html,
            "filename": f"stress_test_{payload.get('scenario', 'Recession').lower()}_{datetime.datetime.now().strftime('%Y%m%d%H%M')}.html"
        }))
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}))
