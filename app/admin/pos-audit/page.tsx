"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { AlertCircle, Calendar, Download, FileSearch, ShieldCheck, TriangleAlert, Edit2, X, PackageOpen } from "lucide-react";
import { updatePosExpense, updateSale } from "../../actions";

function money(n: any) {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return "$0.00";
  return `$${v.toFixed(2)}`;
}

function fmtTime(iso: string | null | undefined) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return String(iso);
  }
}

export default function PosAuditPage() {
  const [db, setDb] = useState<any>(null);
  const [shopId, setShopId] = useState<string>("kipasa");
  const [date, setDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState<string>("");
  const [loading, startTransition] = useTransition();

  useEffect(() => {
    getDashboardData()
      .then((d) => {
        setDb(d);
        const firstShop = (d?.shops || [])?.[0]?.id;
        if (firstShop) setShopId(firstShop);
      })
      .catch(() => setDb({ shops: [] }));
  }, []);

  const shops = useMemo(() => db?.shops || [], [db]);

  const run = () => {
    setError("");
    startTransition(async () => {
      try {
        const r = await getPosAuditReport({ shopId, dateYYYYMMDD: date });
        setReport(r);
      } catch (e: any) {
        setReport(null);
        setError(e?.message || "Failed to generate report");
      }
    });
  };

  const flags = (report?.flags || []) as any[];
  const hasCritical = flags.some((f) => f?.severity === "critical");

  const [editingExpense, setEditingExpense] = useState<any>(null);
  const [newExpenseAmount, setNewExpenseAmount] = useState("");
  const [newExpenseDesc, setNewExpenseDesc] = useState("");

  const [editingSale, setEditingSale] = useState<any>(null);
  const [newSaleTotal, setNewSaleTotal] = useState("");
  const [newSaleQty, setNewSaleQty] = useState("");
  const [newSaleItemName, setNewSaleItemName] = useState("");
  const [shouldRestock, setShouldRestock] = useState(false);

  const openEditExpense = (exp: any) => {
    setEditingExpense(exp);
    setNewExpenseAmount(String(exp.amount));
    setNewExpenseDesc(exp.description);
  };

  const saveExpenseEdit = async () => {
    if (!editingExpense) return;
    const amount = parseFloat(newExpenseAmount);
    if (isNaN(amount) || amount < 0) {
      alert("Invalid amount");
      return;
    }

    startTransition(async () => {
      try {
        await updatePosExpense(editingExpense.id, {
          amount,
          description: newExpenseDesc
        });
        setEditingExpense(null);
        run(); // Refresh report
      } catch (e: any) {
        alert(e.message || "Failed to update expense");
      }
      }
    });
  };

  const saveSaleEdit = async () => {
    if (!editingSale) return;
    const total = parseFloat(newSaleTotal);
    const qty = parseInt(newSaleQty);
    if (isNaN(total) || total < 0 || isNaN(qty) || qty < 0) {
      alert("Invalid input figures");
      return;
    }

    startTransition(async () => {
      try {
        await updateSale(editingSale.id, {
          total_with_tax: total,
          quantity: qty,
          item_name: newSaleItemName
        }, shouldRestock);
        setEditingSale(null);
        run(); // Refresh report
      } catch (e: any) {
        alert(e.message || "Failed to update sale");
      }
    });
  };

  const openEditSale = (sale: any) => {
    setEditingSale(sale);
    setNewSaleTotal(String(sale.totalWithTax));
    setNewSaleQty(String(sale.qty));
    setNewSaleItemName(sale.itemName);
    setShouldRestock(false);
  };

  return (
    <div className="space-y-8 pb-32 pt-8">
      <div className="space-y-2 text-center max-w-3xl mx-auto">
        <Badge className="bg-emerald-600/10 text-emerald-400 border-emerald-500/20 px-4 py-1 mb-4 uppercase text-[10px] font-black">
          <ShieldCheck className="h-3 w-3 mr-2" /> Strict POS Finance Audit
        </Badge>
        <h1 className="text-3xl sm:text-5xl font-black tracking-tighter uppercase italic text-white leading-none">
          POS Audit
        </h1>
        <p className="text-slate-400 font-medium tracking-tight uppercase text-xs">
          Pick a date. Get a strict reconciliation with staff attribution, variance flags, and a PDF export.
        </p>
      </div>

      <Card className="max-w-4xl mx-auto bg-slate-950/40 border-slate-800">
        <CardHeader>
          <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
            <FileSearch className="h-5 w-5 text-sky-400" /> Audit Controls
          </CardTitle>
          <CardDescription className="text-[10px] font-bold uppercase italic">
            Manager/Admin/Owner only. Uses the ledger + audit log to reconstruct who did what.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Shop</label>
              <select
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-bold"
                value={shopId}
                onChange={(e) => setShopId(e.target.value)}
              >
                {(shops || []).map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name || s.id}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Date</label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-slate-900 border-slate-800 font-bold"
                max={new Date().toISOString().split("T")[0]}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Actions</label>
              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-sky-600 hover:bg-sky-500 text-[10px] font-black uppercase italic tracking-widest"
                  disabled={loading || !shopId || !date}
                  onClick={run}
                >
                  <Calendar className="h-4 w-4 mr-2" /> Generate
                </Button>
                <a
                  className="flex-1"
                  href={`/api/pos-audit/pdf?shopId=${encodeURIComponent(shopId)}&date=${encodeURIComponent(date)}`}
                >
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-slate-700 text-slate-200 hover:bg-slate-900 text-[10px] font-black uppercase italic tracking-widest"
                    disabled={!shopId || !date}
                  >
                    <Download className="h-4 w-4 mr-2" /> PDF
                  </Button>
                </a>
              </div>
            </div>
          </div>

          {error ? (
            <div className="text-[10px] font-black uppercase text-rose-400 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {report ? (
        <div className="max-w-5xl mx-auto space-y-6">
          <Card className={`bg-slate-950/40 border-slate-800 ${hasCritical ? "border-rose-500/30" : "border-emerald-500/20"}`}>
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
                {hasCritical ? <TriangleAlert className="h-5 w-5 text-rose-400" /> : <ShieldCheck className="h-5 w-5 text-emerald-400" />}
                Summary — {String(report.shopId || "").toUpperCase()} {report.date}
              </CardTitle>
              <CardDescription className="text-[10px] font-bold uppercase italic">
                Generated {new Date(report.generatedAt).toLocaleString()}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Opening Entered</div>
                  <div className="text-2xl font-black text-white">{report.opening.amount === null ? "MISSING" : money(report.opening.amount)}</div>
                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    By {report.opening.enteredByName || report.opening.enteredByEmployeeId || "Unknown"} {report.opening.entryTimestamp ? `@ ${fmtTime(report.opening.entryTimestamp)}` : ""}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Expected From Prev Closing</div>
                  <div className="text-2xl font-black text-slate-100">{money(report.expectedOpeningFromPrevClosing.estimatedPrevClosing)}</div>
                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    Prev day: {report.expectedOpeningFromPrevClosing.date}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Variance</div>
                  <div className={`text-2xl font-black ${report.variance.amount === null ? "text-slate-500" : Math.abs(Number(report.variance.amount || 0)) > 0.01 ? "text-rose-400" : "text-emerald-400"}`}>
                    {report.variance.amount === null ? "-" : money(report.variance.amount)}
                  </div>
                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    Abs {report.variance.absAmount === null ? "-" : money(report.variance.absAmount)}
                  </div>
                </div>
              </div>

              {flags.length ? (
                <div className="space-y-2">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Flags</div>
                  <div className="grid gap-2">
                    {flags.map((f: any) => (
                      <div
                        key={`${f.code}-${f.message}`}
                        className={`rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest ${
                          f.severity === "critical"
                            ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                            : f.severity === "warn"
                            ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                            : "border-slate-700 bg-slate-900/40 text-slate-300"
                        }`}
                      >
                        {f.code}: {f.message}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="bg-slate-950/40 border-slate-800">
              <CardHeader>
                <CardTitle className="text-sm font-black uppercase italic">Totals</CardTitle>
                <CardDescription className="text-[10px] font-bold uppercase italic">Revenue, tax, expenses, and estimated closing cash</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><span className="text-slate-400">Sales (inc tax)</span><span className="font-black">{money(report.totals.salesWithTax)}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-400">Sales (pre tax)</span><span className="font-black">{money(report.totals.salesBeforeTax)}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-400">Tax</span><span className="font-black">{money(report.totals.tax)}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-400">Cash sales</span><span className="font-black">{money(report.totals.cashSales)}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-400">EcoCash sales</span><span className="font-black">{money(report.totals.ecocashSales)}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-400">Lay-by cash</span><span className="font-black">{money(report.totals.laybyCash)}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-400">POS expenses</span><span className="font-black text-rose-300">{money(report.totals.posExpenses)}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-400">Drawer adjustments (net)</span><span className="font-black">{money(report.totals.cashDrawerAdjustmentNet)}</span></div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                  <span className="text-slate-400">Estimated closing cash</span>
                  <span className="font-black">{report.totals.estimatedClosingCash === null ? "-" : money(report.totals.estimatedClosingCash)}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-950/40 border-slate-800">
              <CardHeader>
                <CardTitle className="text-sm font-black uppercase italic">Audit Trail (Selected Day)</CardTitle>
                <CardDescription className="text-[10px] font-bold uppercase italic">Cash drawer edits, sales, and expense events</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {(report.auditEvents || []).length === 0 ? (
                  <div className="text-xs text-slate-500">No audit events found for this day.</div>
                ) : (
                  <div className="space-y-2 max-h-[320px] overflow-auto pr-2">
                    {(report.auditEvents || []).map((e: any) => (
                      <div key={e.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] font-black uppercase tracking-widest text-slate-300">{e.action}</div>
                          <div className="text-[10px] font-bold text-slate-500">{fmtTime(e.timestamp)}</div>
                        </div>
                        <div className="text-[10px] font-bold uppercase text-slate-500">
                          {e.employeeName || e.employeeId || "SYSTEM"}
                        </div>
                        <div className="text-[10px] text-slate-400 break-words">{typeof e.details === "string" ? e.details : JSON.stringify(e.details)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="bg-slate-950/40 border-slate-800">
            <CardHeader>
              <CardTitle className="text-sm font-black uppercase italic">Sales</CardTitle>
              <CardDescription className="text-[10px] font-bold uppercase italic">Every sale, with staff attribution</CardDescription>
            </CardHeader>
            <CardContent>
              {(report.sales || []).length === 0 ? (
                <div className="text-xs text-slate-500">No sales recorded.</div>
              ) : (
                <div className="overflow-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase font-black text-slate-500">
                        <th className="text-left py-2 pr-3">Time</th>
                        <th className="text-left py-2 pr-3">Employee</th>
                        <th className="text-left py-2 pr-3">Item</th>
                        <th className="text-right py-2 pr-3">Qty</th>
                        <th className="text-right py-2 pr-3">Tax</th>
                        <th className="text-right py-2 pr-3">Total</th>
                        <th className="text-right py-2">Method</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(report.sales || []).map((s: any) => (
                        <tr key={s.id} className="border-t border-slate-800">
                          <td className="py-2 pr-3 text-slate-300">{fmtTime(s.timestamp)}</td>
                          <td className="py-2 pr-3 text-slate-300">{s.employeeName || s.employeeId || "SYSTEM"}</td>
                          <td className="py-2 pr-3 text-slate-200 font-bold">{s.itemName}</td>
                          <td className="py-2 pr-3 text-right text-slate-200 font-bold">{s.qty}</td>
                          <td className="py-2 pr-3 text-right text-slate-400">{money(s.tax)}</td>
                          <td className="py-2 pr-3 text-right text-slate-100 font-black">{money(s.totalWithTax)}</td>
                          <td className="py-2 text-right text-slate-400 uppercase font-black">{String(s.paymentMethod || "")}</td>
                          <td className="py-2 text-right">
                             <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6 text-slate-500 hover:text-white"
                                onClick={() => openEditSale(s)}
                             >
                                <Edit2 className="h-3 w-3" />
                             </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-slate-950/40 border-slate-800">
            <CardHeader>
              <CardTitle className="text-sm font-black uppercase italic">Expenses</CardTitle>
              <CardDescription className="text-[10px] font-bold uppercase italic">Ledger expenses for the day</CardDescription>
            </CardHeader>
            <CardContent>
              {(report.expenses || []).length === 0 ? (
                <div className="text-xs text-slate-500">No expenses recorded.</div>
              ) : (
                <div className="overflow-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase font-black text-slate-500">
                        <th className="text-left py-2 pr-3">Time</th>
                        <th className="text-left py-2 pr-3">Employee</th>
                        <th className="text-left py-2 pr-3">Category</th>
                        <th className="text-left py-2 pr-3">Description</th>
                        <th className="text-right py-2">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(report.expenses || []).map((e: any) => (
                        <tr key={e.id} className="border-t border-slate-800">
                          <td className="py-2 pr-3 text-slate-300">{fmtTime(e.timestamp)}</td>
                          <td className="py-2 pr-3 text-slate-300">{e.employeeName || e.employeeId || "Unknown"}</td>
                          <td className="py-2 pr-3 text-slate-200 font-bold">{e.category}</td>
                          <td className="py-2 pr-3 text-slate-400">{e.description}</td>
                          <td className="py-2 pr-3 text-right text-rose-300 font-black">{money(e.amount)}</td>
                          <td className="py-2 text-right">
                             <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6 text-slate-500 hover:text-white"
                                onClick={() => openEditExpense(e)}
                             >
                                <Edit2 className="h-3 w-3" />
                             </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
      {/* EDIT EXPENSE MODAL */}
      {editingExpense ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <Card className="w-full max-w-md bg-slate-900 border-slate-800 shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xl font-black uppercase italic tracking-tight">Edit Expense</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setEditingExpense(null)} className="h-8 w-8 text-slate-500 hover:text-white">
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Amount</label>
                <Input
                  type="number"
                  className="bg-slate-950 border-slate-800 font-black italic"
                  value={newExpenseAmount}
                  onChange={(e) => setNewExpenseAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Description</label>
                <Input
                  className="bg-slate-950 border-slate-800 font-bold"
                  value={newExpenseDesc}
                  onChange={(e) => setNewExpenseDesc(e.target.value)}
                />
              </div>
              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-500 font-black uppercase italic text-xs h-12"
                disabled={loading}
                onClick={saveExpenseEdit}
              >
                {loading ? "Updating..." : "Save Changes"}
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* EDIT SALE MODAL */}
      {editingSale ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <Card className="w-full max-w-md bg-slate-900 border-slate-800 shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xl font-black uppercase italic tracking-tight">Edit Sale Record</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setEditingSale(null)} className="h-8 w-8 text-slate-500 hover:text-white">
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Item Name</label>
                <Input
                  className="bg-slate-950 border-slate-800 font-bold"
                  value={newSaleItemName}
                  onChange={(e) => setNewSaleItemName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Total (inc tax)</label>
                   <Input
                     type="number"
                     className="bg-slate-950 border-slate-800 font-black italic"
                     value={newSaleTotal}
                     onChange={(e) => setNewSaleTotal(e.target.value)}
                   />
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Quantity</label>
                   <Input
                     type="number"
                     className="bg-slate-950 border-slate-800 font-black italic"
                     value={newSaleQty}
                     onChange={(e) => setNewSaleQty(e.target.value)}
                   />
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
                <input 
                  type="checkbox" 
                  id="restock-check"
                  checked={shouldRestock}
                  onChange={(e) => setShouldRestock(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="restock-check" className="text-xs font-black uppercase italic text-slate-300 cursor-pointer flex items-center gap-2">
                  <PackageOpen className="h-4 w-4 text-emerald-500" /> Restock item in inventory?
                </label>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg">
                <p className="text-[10px] font-medium text-amber-200 uppercase leading-relaxed italic">
                  Note: Zeroing the figure will void its impact on the report totals. Restocking will increment the master stock by the difference in quantity.
                </p>
              </div>

              <Button
                className="w-full bg-sky-600 hover:bg-sky-500 font-black uppercase italic text-xs h-12"
                disabled={loading}
                onClick={saveSaleEdit}
              >
                {loading ? "Syncing..." : "Apply Financial Correction"}
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
