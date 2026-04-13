"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@/components/ui";

type LedgerEntry = {
  id: string;
  amount: number;
  kind: string;
  title?: string | null;
  notes?: string | null;
  created_at: string;
  metadata?: {
    borrower?: string;
    borrowedDate?: string;
    expectedReturnDate?: string | null;
  } | null;
};

function currency(value: number) {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function monthLabel(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex, 1)).toLocaleString(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function StockvelPanel({
  ledger,
  onRefresh,
}: {
  ledger: LedgerEntry[];
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [entryType, setEntryType] = useState<"loan" | "repayment">("loan");
  const [borrower, setBorrower] = useState("");
  const [amount, setAmount] = useState("");
  const [borrowedDate, setBorrowedDate] = useState(new Date().toISOString().split("T")[0]);
  const [expectedReturnDate, setExpectedReturnDate] = useState("");
  const [notes, setNotes] = useState("");

  const currentDate = useMemo(() => new Date(), []);
  const currentYear = currentDate.getUTCFullYear();
  const currentMonth = currentDate.getUTCMonth();

  const projection = useMemo(() => {
    const rows: Array<{
      id: string;
      month: string;
      startBalance: number;
      borrowedPerPerson: number;
      interestEarned: number;
      closingBalance: number;
      status: string;
    }> = [];

    let running = 2500;
    for (let monthIndex = 0; monthIndex <= currentMonth; monthIndex += 1) {
      const startBalance = running;
      const borrowedPerPerson = startBalance / 5;
      const interestEarned = startBalance * 0.1;
      const closingBalance = startBalance + interestEarned;

      rows.push({
        id: `${currentYear}-${monthIndex + 1}`,
        month: monthLabel(currentYear, monthIndex),
        startBalance,
        borrowedPerPerson,
        interestEarned,
        closingBalance,
        status: monthIndex < currentMonth ? "Projected cycle closed" : "Current month estimate",
      });

      running = closingBalance;
    }

    return rows;
  }, [currentMonth, currentYear]);

  const stockvelEntries = useMemo(() => {
    return ledger
      .filter((entry) => entry.kind === "stockvel_loan" || entry.kind === "stockvel_repayment")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [ledger]);

  const manualDelta = stockvelEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const projectedCurrentBalance = projection[projection.length - 1]?.closingBalance || 2500;
  const estimatedLiveBalance = projectedCurrentBalance + manualDelta;
  const outstandingManualLoans = Math.max(0, stockvelEntries.reduce((sum, entry) => {
    if (entry.kind === "stockvel_loan") return sum + Math.abs(Number(entry.amount || 0));
    if (entry.kind === "stockvel_repayment") return sum - Number(entry.amount || 0);
    return sum;
  }, 0));

  const submitEntry = async () => {
    const numericAmount = Number(amount);
    if (!borrower.trim()) {
      alert("Enter the borrower name.");
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      alert("Enter a valid amount.");
      return;
    }
    if (!borrowedDate) {
      alert("Enter a date.");
      return;
    }
    if (entryType === "loan" && !expectedReturnDate) {
      alert("Enter the expected return date.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/operations/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount: entryType === "loan" ? -numericAmount : numericAmount,
          kind: entryType === "loan" ? "stockvel_loan" : "stockvel_repayment",
          title: `Stockvel ${entryType === "loan" ? "Loan" : "Repayment"}: ${borrower.trim()}`,
          notes: notes.trim() || null,
          effectiveDate: borrowedDate,
          metadata: {
            source: "stockvel",
            borrower: borrower.trim(),
            borrowedDate,
            expectedReturnDate: expectedReturnDate || null,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to save stockvel entry");

      setBorrower("");
      setAmount("");
      setExpectedReturnDate("");
      setNotes("");
      setEntryType("loan");
      setBorrowedDate(new Date().toISOString().split("T")[0]);
      await onRefresh();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to save stockvel entry.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-br from-amber-950/40 to-slate-950 border-amber-800/30">
        <CardHeader>
          <CardTitle className="text-lg font-black uppercase italic">Stockvel Model</CardTitle>
          <CardDescription className="text-[10px] font-bold uppercase italic">
            Seeded at $2,500.00 in January • 5 members • each member borrows once per month • every loan returns with 10% interest inside the same month.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Projected Balance</div>
            <div className="text-2xl font-black italic text-amber-300">{currency(projectedCurrentBalance)}</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Manual Delta</div>
            <div className={`text-2xl font-black italic ${manualDelta >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
              {manualDelta >= 0 ? "+" : "-"}{currency(Math.abs(manualDelta))}
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Estimated Live Balance</div>
            <div className="text-2xl font-black italic text-white">{currency(estimatedLiveBalance)}</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Outstanding Manual Loans</div>
            <div className="text-2xl font-black italic text-sky-300">{currency(outstandingManualLoans)}</div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_0.9fr] gap-6">
        <Card className="bg-slate-950/60 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg font-black uppercase italic">Projection Timeline</CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase italic">
              January to current date using the assumption that the pool goes to zero each month and returns at 110%.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {projection.map((row) => (
              <div key={row.id} className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-black uppercase text-white">{row.month}</div>
                    <div className="text-[10px] uppercase tracking-widest text-slate-500">{row.status}</div>
                  </div>
                  <Badge className="bg-amber-500/10 text-amber-300 border-amber-500/20">5 members</Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <div className="text-slate-500 uppercase text-[10px]">Start</div>
                    <div className="font-black text-slate-200">{currency(row.startBalance)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 uppercase text-[10px]">Borrow / person</div>
                    <div className="font-black text-slate-200">{currency(row.borrowedPerPerson)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 uppercase text-[10px]">Interest</div>
                    <div className="font-black text-emerald-300">{currency(row.interestEarned)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 uppercase text-[10px]">Close</div>
                    <div className="font-black text-amber-300">{currency(row.closingBalance)}</div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-slate-950/60 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg font-black uppercase italic">Manual Book</CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase italic">
              From today onward, capture the real borrower, draw date, expected return date, and repayments here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={entryType === "loan" ? "default" : "outline"}
                className={entryType === "loan" ? "flex-1 bg-rose-600 hover:bg-rose-500 font-black uppercase" : "flex-1 font-black uppercase"}
                onClick={() => setEntryType("loan")}
              >
                Record Loan
              </Button>
              <Button
                type="button"
                variant={entryType === "repayment" ? "default" : "outline"}
                className={entryType === "repayment" ? "flex-1 bg-emerald-600 hover:bg-emerald-500 font-black uppercase" : "flex-1 font-black uppercase"}
                onClick={() => setEntryType("repayment")}
              >
                Record Repayment
              </Button>
            </div>

            <Input value={borrower} onChange={(e) => setBorrower(e.target.value)} placeholder="Borrower name" className="bg-slate-900 border-slate-800" />
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" inputMode="decimal" className="bg-slate-900 border-slate-800 font-mono" />
            <Input value={borrowedDate} onChange={(e) => setBorrowedDate(e.target.value)} type="date" className="bg-slate-900 border-slate-800 font-mono" />
            <Input
              value={expectedReturnDate}
              onChange={(e) => setExpectedReturnDate(e.target.value)}
              type="date"
              className="bg-slate-900 border-slate-800 font-mono"
              placeholder="Expected return date"
            />
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" className="bg-slate-900 border-slate-800" />

            <Button disabled={busy} onClick={submitEntry} className="w-full font-black uppercase">
              {busy ? "Saving..." : entryType === "loan" ? "Save Loan" : "Save Repayment"}
            </Button>

            <div className="space-y-2 border-t border-slate-800 pt-4">
              {stockvelEntries.length === 0 ? (
                <div className="text-center py-6 text-[10px] font-black uppercase italic text-slate-600">No manual stockvel entries yet.</div>
              ) : (
                stockvelEntries.map((entry) => {
                  const borrowerName = String(entry.metadata?.borrower || entry.title || "Unknown borrower");
                  const expectedDate = entry.metadata?.expectedReturnDate;
                  const isLoan = entry.kind === "stockvel_loan";
                  return (
                    <div key={entry.id} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-black text-white">{borrowerName}</div>
                          <div className="text-[10px] uppercase tracking-widest text-slate-500">
                            {new Date(entry.created_at).toLocaleDateString()}
                            {expectedDate ? ` • due ${new Date(expectedDate).toLocaleDateString()}` : ""}
                          </div>
                        </div>
                        <div className={`text-lg font-black italic ${isLoan ? "text-rose-300" : "text-emerald-300"}`}>
                          {isLoan ? "-" : "+"}{currency(Math.abs(Number(entry.amount || 0)))}
                        </div>
                      </div>
                      {(entry.notes || entry.title) && (
                        <div className="mt-2 text-xs text-slate-400">{entry.notes || entry.title}</div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
