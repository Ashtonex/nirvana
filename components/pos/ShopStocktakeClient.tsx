"use client";

import React, { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    Badge,
    Button,
    Input
} from "@/components/ui";
import {
    Search,
    Plus,
    Minus,
    ArrowLeft,
    Check,
    CheckCircle2,
    AlertTriangle,
    AlertCircle,
    RefreshCw,
    Download,
    Share2,
    Copy,
    Printer,
    Calendar,
    Clock,
    DollarSign,
    Package,
    ShieldCheck,
    Sparkles,
    Filter,
    X,
    Store,
    FileText,
    TrendingUp,
    TrendingDown,
    PackagePlus,
    Zap,
    ExternalLink
} from "lucide-react";
import { completeShopStocktake, addNewUnitFromStocktake, type ShopStocktakeCountItem } from "@/app/actions";

interface ShopStocktakeClientProps {
    shop: {
        id: string;
        name: string;
    };
    employees: Array<{
        id: string;
        name: string;
        surname?: string;
        role?: string;
        active?: boolean;
    }>;
    initialInventory: Array<{
        id: string;
        name: string;
        category?: string;
        sku?: string;
        landedCost: number;
        sellingPrice: number;
        systemQuantity: number;
        dateAdded?: string;
    }>;
}

export default function ShopStocktakeClient({
    shop,
    employees,
    initialInventory
}: ShopStocktakeClientProps) {
    // Inventory items list with local state
    const [items, setItems] = useState(() =>
        initialInventory.map((item) => ({
            ...item,
            physicalQuantity: item.systemQuantity,
            initialCount: item.systemQuantity,
            isModified: false
        }))
    );

    // Filter and search
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
    const [activeTab, setActiveTab] = useState<"in_stock" | "all" | "modified" | "discrepancies" | "zero" | "zombie">("in_stock");

    // Auditor selection
    const activeEmployees = employees.filter((e) => e.active !== false);
    const [selectedAuditorId, setSelectedAuditorId] = useState<string>(activeEmployees[0]?.id || "");
    const selectedAuditor = activeEmployees.find((e) => e.id === selectedAuditorId);
    const auditorDisplayName = selectedAuditor
        ? `${selectedAuditor.name} ${selectedAuditor.surname || ""}`.trim()
        : "Staff Auditor";

    // Modals & workflows
    const [isAddUnitModalOpen, setIsAddUnitModalOpen] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [auditReport, setAuditReport] = useState<any>(null);
    const [copiedWhatsApp, setCopiedWhatsApp] = useState(false);

    // Add Unit Form State
    const [newUnitName, setNewUnitName] = useState("");
    const [newUnitCategory, setNewUnitCategory] = useState("Jewelry");
    const [newUnitQuantity, setNewUnitQuantity] = useState(1);
    const [newUnitLandedCost, setNewUnitLandedCost] = useState("");
    const [newUnitSellingPrice, setNewUnitSellingPrice] = useState("");
    const [isAddingUnit, startAddUnitTransition] = useTransition();
    const [isCompleting, startCompleteTransition] = useTransition();

    // Categories list
    const categories = useMemo(() => {
        const set = new Set<string>();
        for (const item of items) {
            if (item.category) set.add(item.category);
        }
        return Array.from(set).sort();
    }, [items]);

    // Calculate days in system for each item
    const getDaysInSystem = (dateAdded?: string) => {
        if (!dateAdded) return 0;
        const now = new Date().getTime();
        const added = new Date(dateAdded).getTime();
        return Math.max(0, Math.floor((now - added) / (1000 * 60 * 60 * 24)));
    };

    const getAgingCategory = (days: number) => {
        if (days < 60) return { label: "< 2m (Fresh)", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" };
        if (days < 120) return { label: "2 - 4m (Aging)", color: "text-sky-400 bg-sky-500/10 border-sky-500/30" };
        if (days < 180) return { label: "4 - 6m (Stagnant)", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" };
        if (days < 240) return { label: "6 - 8m (Critical)", color: "text-orange-400 bg-orange-500/10 border-orange-500/30" };
        return { label: "8+m (Zombie)", color: "text-rose-400 bg-rose-500/10 border-rose-500/30 animate-pulse" };
    };

    // Live Metrics Calculations
    const liveMetrics = useMemo(() => {
        let totalCountedUnits = 0;
        let totalSystemUnits = 0;
        let totalCostLocked = 0;
        let totalRetailRevenue = 0;
        let shrinkageCount = 0;
        let shrinkageCost = 0;
        let surplusCount = 0;
        let surplusCost = 0;
        let discrepancyItemCount = 0;
        let modifiedItemCount = 0;

        for (const item of items) {
            const pQty = Number(item.physicalQuantity || 0);
            const sQty = Number(item.systemQuantity || 0);
            const cost = Number(item.landedCost || 0);
            const price = Number(item.sellingPrice || 0);

            totalCountedUnits += pQty;
            totalSystemUnits += sQty;
            totalCostLocked += pQty * cost;
            totalRetailRevenue += pQty * price;

            if (item.isModified) modifiedItemCount++;

            const delta = pQty - sQty;
            if (delta < 0) {
                shrinkageCount += Math.abs(delta);
                shrinkageCost += Math.abs(delta) * cost;
                discrepancyItemCount++;
            } else if (delta > 0) {
                surplusCount += delta;
                surplusCost += delta * cost;
                discrepancyItemCount++;
            }
        }

        return {
            totalCountedUnits,
            totalSystemUnits,
            totalCostLocked,
            totalRetailRevenue,
            shrinkageCount,
            shrinkageCost,
            surplusCount,
            surplusCost,
            discrepancyItemCount,
            modifiedItemCount,
            totalItems: items.length
        };
    }, [items]);

    // Quick Stepper Actions
    const adjustQuantity = (itemId: string, delta: number) => {
        setItems((prev) =>
            prev.map((item) => {
                if (item.id === itemId) {
                    const newQty = Math.max(0, Number(item.physicalQuantity || 0) + delta);
                    return {
                        ...item,
                        physicalQuantity: newQty,
                        isModified: newQty !== item.systemQuantity
                    };
                }
                return item;
            })
        );
    };

    const setExactQuantity = (itemId: string, exactQty: number) => {
        const qty = Math.max(0, Math.round(Number(exactQty) || 0));
        setItems((prev) =>
            prev.map((item) => {
                if (item.id === itemId) {
                    return {
                        ...item,
                        physicalQuantity: qty,
                        isModified: qty !== item.systemQuantity
                    };
                }
                return item;
            })
        );
    };

    // Update Landed Cost & Selling Price
    const updateLandedCost = (itemId: string, newCost: number) => {
        const cost = Math.max(0, Number(newCost) || 0);
        setItems((prev) =>
            prev.map((item) => {
                if (item.id === itemId) {
                    const defaultSelling = Math.round(cost * 1.617 * 100) / 100;
                    return {
                        ...item,
                        landedCost: cost,
                        sellingPrice: item.sellingPrice > 0 ? item.sellingPrice : defaultSelling,
                        isModified: true
                    };
                }
                return item;
            })
        );
    };

    const updateSellingPrice = (itemId: string, newPrice: number) => {
        const price = Math.max(0, Number(newPrice) || 0);
        setItems((prev) =>
            prev.map((item) => {
                if (item.id === itemId) {
                    return {
                        ...item,
                        sellingPrice: price,
                        isModified: true
                    };
                }
                return item;
            })
        );
    };

    // Filter items for display
    const filteredItems = useMemo(() => {
        const query = searchTerm.toLowerCase().trim();
        return items.filter((item) => {
            // Category filter
            if (selectedCategory !== "ALL" && item.category !== selectedCategory) {
                return false;
            }

            // Tab filter
            const days = getDaysInSystem(item.dateAdded);
            if (activeTab === "in_stock" && (item.physicalQuantity <= 0 && item.systemQuantity <= 0)) return false;
            if (activeTab === "modified" && !item.isModified) return false;
            if (activeTab === "discrepancies" && item.physicalQuantity === item.systemQuantity) return false;
            if (activeTab === "zero" && item.physicalQuantity > 0) return false;
            if (activeTab === "zombie" && (days < 240 || item.physicalQuantity <= 0)) return false;

            // Search query
            if (query) {
                const nameMatch = item.name.toLowerCase().includes(query);
                const catMatch = (item.category || "").toLowerCase().includes(query);
                const skuMatch = (item.sku || "").toLowerCase().includes(query);
                return nameMatch || catMatch || skuMatch;
            }

            return true;
        });
    }, [items, selectedCategory, activeTab, searchTerm]);

    // Handle Add New Unit Submission
    const handleAddNewUnit = () => {
        if (!newUnitName.trim()) {
            alert("Please enter a product name.");
            return;
        }

        const cost = parseFloat(newUnitLandedCost) || 0;
        const retail = parseFloat(newUnitSellingPrice) || Math.round(cost * 1.617 * 100) / 100;
        const qty = Math.max(1, Math.round(Number(newUnitQuantity) || 1));

        startAddUnitTransition(async () => {
            try {
                const res = await addNewUnitFromStocktake({
                    shopId: shop.id,
                    name: newUnitName.trim(),
                    category: newUnitCategory.trim(),
                    physicalQuantity: qty,
                    landedCost: cost,
                    sellingPrice: retail,
                    auditorId: selectedAuditorId
                });

                if (res.success && res.item) {
                    setItems((prev) => [
                        {
                            id: res.item.id,
                            name: res.item.name,
                            category: res.item.category,
                            sku: res.item.sku,
                            landedCost: res.item.landedCost,
                            sellingPrice: res.item.sellingPrice,
                            systemQuantity: 0,
                            physicalQuantity: res.item.physicalQuantity,
                            initialCount: 0,
                            isModified: true,
                            dateAdded: res.item.dateAdded
                        },
                        ...prev
                    ]);

                    // Reset form
                    setNewUnitName("");
                    setNewUnitLandedCost("");
                    setNewUnitSellingPrice("");
                    setNewUnitQuantity(1);
                    setIsAddUnitModalOpen(false);
                }
            } catch (err: any) {
                alert(`Error adding unit: ${err?.message || "Failed"}`);
            }
        });
    };

    // Handle Complete Stocktake Submission
    const handleCompleteStocktake = () => {
        startCompleteTransition(async () => {
            try {
                // Only send items actually relevant to this shop (in stock now or previously),
                // instead of the entire company-wide catalog, to keep the payload small and fast.
                const payload: ShopStocktakeCountItem[] = items
                    .filter((i) => Number(i.physicalQuantity || 0) > 0 || Number(i.systemQuantity || 0) > 0)
                    .map((i) => ({
                    itemId: i.id,
                    name: i.name,
                    category: i.category,
                    physicalQuantity: Number(i.physicalQuantity || 0),
                    systemQuantity: Number(i.systemQuantity || 0),
                    landedCost: Number(i.landedCost || 0),
                    sellingPrice: Number(i.sellingPrice || (i.landedCost * 1.617)),
                    dateAdded: i.dateAdded,
                    sku: i.sku
                }));

                const report = await completeShopStocktake({
                    shopId: shop.id,
                    auditorEmployeeId: selectedAuditorId,
                    auditorName: auditorDisplayName,
                    items: payload
                });

                if (report.success) {
                    setAuditReport(report);
                    setIsConfirmModalOpen(false);
                }
            } catch (err: any) {
                alert(`Error completing stocktake: ${err?.message || "Failed to complete"}`);
            }
        });
    };

    // Generate Client-Side Branded PDF
    const handleDownloadPDF = async () => {
        if (!auditReport) return;
        try {
            const { default: jsPDF } = await import("jspdf");
            const { default: autoTable } = await import("jspdf-autotable");

            const doc = new jsPDF() as any;
            const r = auditReport;

            // Brand Header
            doc.setFillColor(15, 23, 42); // slate-900
            doc.rect(0, 0, 210, 48, "F");

            doc.setTextColor(255, 255, 255);
            doc.setFontSize(24);
            doc.setFont("helvetica", "bold");
            doc.text("NIRVANA LUXURY", 15, 22);

            doc.setFontSize(10);
            doc.setTextColor(16, 185, 129); // emerald-500
            doc.text("PHYSICAL STOCKTAKE & CAPITAL HEALTH AUDIT", 15, 32);

            doc.setFontSize(9);
            doc.setTextColor(148, 163, 184); // slate-400
            doc.text(
                `SHOP: ${r.shop.name.toUpperCase()}  |  AUDITOR: ${r.auditor.name}  |  REF: ${r.reportRef}  |  DATE: ${new Date(r.completedAt).toLocaleDateString()}`,
                15,
                40
            );

            // Next Due Date Banner
            doc.setFillColor(236, 253, 245);
            doc.rect(15, 54, 180, 16, "F");
            doc.setDrawColor(16, 185, 129);
            doc.rect(15, 54, 180, 16, "S");
            doc.setTextColor(4, 120, 87);
            doc.setFontSize(10);
            doc.setFont("helvetica", "bold");
            doc.text(`NEXT MONTHLY AUDIT DUE: ${r.nextDueDate.toUpperCase()}`, 20, 64);

            // KPI Financial Table
            doc.setTextColor(15, 23, 42);
            doc.setFontSize(12);
            doc.text("I. EXECUTIVE CAPITAL & INVENTORY MATRIX", 15, 80);

            const kpiData = [
                ["Total Units Counted", `${r.summary.totalPhysicalUnits.toLocaleString()} pcs`],
                ["Previous System Units", `${r.summary.totalSystemUnits.toLocaleString()} pcs`],
                ["Net Discrepancy", `${r.summary.totalPhysicalUnits - r.summary.totalSystemUnits >= 0 ? "+" : ""}${r.summary.totalPhysicalUnits - r.summary.totalSystemUnits} pcs`],
                ["Shrinkage Loss", r.summary.shrinkageUnits > 0 ? `-${r.summary.shrinkageUnits} pcs (-$${r.summary.shrinkageValueCost.toFixed(2)})` : "$0.00 (None)"],
                ["Surplus Stock", r.summary.surplusUnits > 0 ? `+${r.summary.surplusUnits} pcs (+$${r.summary.surplusValueCost.toFixed(2)})` : "$0.00 (None)"],
                ["Total Locked Capital (At Landed Cost)", `$${r.summary.totalLockedCapitalCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}`],
                ["Expected Retail Revenue", `$${r.summary.totalPotentialRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`],
                ["Projected Gross Margin", `$${r.summary.projectedGrossMargin.toLocaleString("en-US", { minimumFractionDigits: 2 })}`]
            ];

            autoTable(doc, {
                startY: 85,
                head: [["Financial & Physical Indicator", "Audited Value"]],
                body: kpiData,
                theme: "grid",
                headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold" },
                styles: { fontSize: 9 }
            });

            // Aging Buckets Table
            const finalY1 = doc.lastAutoTable.finalY + 12;
            doc.setFontSize(12);
            doc.text("II. CAPITAL AGING BREAKDOWN (HOLDING DURATION)", 15, finalY1);

            const b = r.agingBuckets;
            const agingData = [
                ["< 2 Months (Fresh)", `${b.under2m.units} pcs`, `$${b.under2m.costValue.toFixed(2)}`, `$${b.under2m.retailValue.toFixed(2)}`, `${b.under2m.pct}%`],
                ["2 - 4 Months (Aging)", `${b.twoTo4m.units} pcs`, `$${b.twoTo4m.costValue.toFixed(2)}`, `$${b.twoTo4m.retailValue.toFixed(2)}`, `${b.twoTo4m.pct}%`],
                ["4 - 6 Months (Stagnant)", `${b.fourTo6m.units} pcs`, `$${b.fourTo6m.costValue.toFixed(2)}`, `$${b.fourTo6m.retailValue.toFixed(2)}`, `${b.fourTo6m.pct}%`],
                ["6 - 8 Months (Critical)", `${b.sixTo8m.units} pcs`, `$${b.sixTo8m.costValue.toFixed(2)}`, `$${b.sixTo8m.retailValue.toFixed(2)}`, `${b.sixTo8m.pct}%`],
                ["8+ Months (Zombie Capital)", `${b.over8m.units} pcs`, `$${b.over8m.costValue.toFixed(2)}`, `$${b.over8m.retailValue.toFixed(2)}`, `${b.over8m.pct}%`]
            ];

            autoTable(doc, {
                startY: finalY1 + 5,
                head: [["Aging Horizon", "Physical Units", "Capital at Cost", "Retail Potential", "% of Capital"]],
                body: agingData,
                theme: "striped",
                headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255] },
                styles: { fontSize: 8.5 }
            });

            // Actionable Clearance Strategies
            const finalY2 = doc.lastAutoTable.finalY + 12;
            doc.setFontSize(12);
            doc.text("III. ACTIONABLE CLEARANCE RECOMMENDATIONS", 15, finalY2);

            const recs = r.recommendations.map((rec: string, idx: number) => [`${idx + 1}.`, rec]);
            autoTable(doc, {
                startY: finalY2 + 5,
                body: recs,
                theme: "plain",
                styles: { fontSize: 8.5, cellPadding: 2.5 },
                columnStyles: { 0: { cellWidth: 8, fontStyle: "bold" } }
            });

            // Blind-Spot Diagnostics
            const finalY3 = doc.lastAutoTable.finalY + 10;
            doc.setFontSize(12);
            doc.text("IV. BLIND-SPOT DIAGNOSTICS (UNADDRESSED BY SALES REPORTS)", 15, finalY3);

            const blinds = r.blindSpots.map((bText: string, idx: number) => [`•`, bText]);
            autoTable(doc, {
                startY: finalY3 + 5,
                body: blinds,
                theme: "plain",
                styles: { fontSize: 8.5, cellPadding: 2 },
                columnStyles: { 0: { cellWidth: 8, fontStyle: "bold", textColor: [225, 29, 72] } }
            });

            // Save PDF
            doc.save(`Nirvana_${r.shop.name}_Stocktake_${new Date().toISOString().split("T")[0]}.pdf`);
        } catch (e: any) {
            alert(`Could not generate PDF: ${e?.message || e}`);
        }
    };

    // Copy WhatsApp Summary
    const handleCopyWhatsApp = () => {
        if (!auditReport?.whatsappSummaryText) return;
        navigator.clipboard.writeText(auditReport.whatsappSummaryText);
        setCopiedWhatsApp(true);
        setTimeout(() => setCopiedWhatsApp(false), 2500);
    };

    // ─────────────────────────────────────────────────────────────────────────
    // IF COMPLETED: RENDER EXECUTIVE STOCKTAKE REPORT VIEW
    // ─────────────────────────────────────────────────────────────────────────
    if (auditReport) {
        const r = auditReport;
        const b = r.agingBuckets;
        const encodedWhatsAppUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(r.whatsappSummaryText)}`;

        return (
            <div className="max-w-6xl mx-auto space-y-8 pb-32 pt-4 px-2 sm:px-4">
                {/* Header Strip */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-6 rounded-3xl backdrop-blur-md shadow-2xl">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40 uppercase font-black tracking-widest text-[10px] px-2.5 py-1">
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Stocktake Finalized
                            </Badge>
                            <span className="text-xs font-mono text-slate-400">Ref: {r.reportRef}</span>
                        </div>
                        <h1 className="text-3xl sm:text-4xl font-black uppercase italic tracking-tight text-white">
                            {r.shop.name} Stocktake & Capital Report
                        </h1>
                        <p className="text-sm text-slate-400 font-medium">
                            Audited by <span className="text-white font-bold">{r.auditor.name}</span> on{" "}
                            {new Date(r.completedAt).toLocaleDateString("en-US", {
                                weekday: "long",
                                year: "numeric",
                                month: "long",
                                day: "numeric"
                            })}
                        </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2.5">
                        <Button
                            onClick={handleDownloadPDF}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase text-xs h-11 px-4 rounded-2xl shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all hover:scale-105"
                        >
                            <Download className="h-4 w-4" /> Download PDF Report
                        </Button>

                        <a href={encodedWhatsAppUrl} target="_blank" rel="noopener noreferrer">
                            <Button className="bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase text-xs h-11 px-4 rounded-2xl shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition-all hover:scale-105">
                                <Share2 className="h-4 w-4" /> Share on WhatsApp
                            </Button>
                        </a>

                        <Button
                            onClick={handleCopyWhatsApp}
                            variant="outline"
                            className="border-slate-700 text-slate-300 hover:text-white bg-slate-950 font-black uppercase text-xs h-11 px-3.5 rounded-2xl"
                        >
                            {copiedWhatsApp ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                            {copiedWhatsApp ? "Copied!" : "Copy Text"}
                        </Button>

                        <Link href={`/shops/${shop.id}`}>
                            <Button
                                variant="outline"
                                className="border-slate-800 text-slate-400 hover:text-white bg-slate-950 font-black uppercase text-xs h-11 px-3.5 rounded-2xl"
                            >
                                <ArrowLeft className="h-4 w-4 mr-1" /> Back to POS
                            </Button>
                        </Link>
                    </div>
                </div>

                {/* Monthly Schedule Next Due Card */}
                <div className="bg-gradient-to-r from-emerald-950/60 via-slate-900 to-indigo-950/60 border border-emerald-500/40 p-5 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
                    <div className="flex items-center gap-3.5">
                        <div className="h-12 w-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                            <Calendar className="h-6 w-6 text-emerald-400" />
                        </div>
                        <div>
                            <span className="text-[10px] uppercase font-black tracking-widest text-emerald-400">
                                Monthly Stocktake Schedule
                            </span>
                            <h3 className="text-xl font-black text-white uppercase italic tracking-tight">
                                Next Audit Due: {r.nextDueDate}
                            </h3>
                            <p className="text-xs text-slate-400">
                                Monthly cycle maintains accurate valuation and halts shrinkage before variance compounds.
                            </p>
                        </div>
                    </div>
                    <Badge className="bg-emerald-500 text-slate-950 font-black uppercase text-xs px-3 py-1.5 rounded-xl shrink-0">
                        30-Day Cycle Active
                    </Badge>
                </div>

                {/* Capital & Physical Valuation Grid */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Card className="bg-slate-900/60 border-slate-800 shadow-xl backdrop-blur-md">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                                <DollarSign className="h-3.5 w-3.5 text-emerald-400" /> Locked Capital (Cost)
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-black text-emerald-400 font-mono">
                                ${r.summary.totalLockedCapitalCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <p className="text-[11px] text-slate-500 font-medium mt-1">
                                Total inventory cost at shop
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="bg-slate-900/60 border-slate-800 shadow-xl backdrop-blur-md">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                                <TrendingUp className="h-3.5 w-3.5 text-sky-400" /> Expected Retail Revenue
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-black text-sky-400 font-mono">
                                ${r.summary.totalPotentialRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <p className="text-[11px] text-slate-500 font-medium mt-1">
                                Gross Margin: ${r.summary.projectedGrossMargin.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="bg-slate-900/60 border-slate-800 shadow-xl backdrop-blur-md">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                                <Package className="h-3.5 w-3.5 text-violet-400" /> Counted Physical Units
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-black text-white font-mono">
                                {r.summary.totalPhysicalUnits.toLocaleString()} <span className="text-sm font-bold text-slate-500">Pcs</span>
                            </div>
                            <p className="text-[11px] text-slate-500 font-medium mt-1">
                                System had: {r.summary.totalSystemUnits.toLocaleString()} pcs
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="bg-slate-900/60 border-slate-800 shadow-xl backdrop-blur-md">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> Discrepancy & Shrinkage
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-black font-mono flex items-center gap-2">
                                {r.summary.shrinkageUnits > 0 ? (
                                    <span className="text-rose-400">-${r.summary.shrinkageValueCost.toFixed(2)}</span>
                                ) : (
                                    <span className="text-emerald-400">$0.00</span>
                                )}
                            </div>
                            <p className="text-[11px] text-slate-500 font-medium mt-1">
                                {r.summary.shrinkageUnits > 0
                                    ? `-${r.summary.shrinkageUnits} pcs missing (recorded in ledger)`
                                    : "Zero shrinkage detected"}
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Capital Aging Breakdown Buckets */}
                <Card className="bg-slate-900/60 border-slate-800 shadow-2xl backdrop-blur-md">
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                                <CardTitle className="text-xl font-black uppercase italic tracking-tight text-white flex items-center gap-2">
                                    <Clock className="h-5 w-5 text-indigo-400" /> Capital Aging Breakdown (Holding Duration)
                                </CardTitle>
                                <CardDescription className="text-xs text-slate-400 mt-1">
                                    Total value of inventory held categorized by age since addition to Nirvana database.
                                </CardDescription>
                            </div>
                            <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/40 uppercase font-black text-[10px] px-3 py-1">
                                Holding Velocity Audit
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* 5 Distinct Aging Cards */}
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                            {/* 1. Fresh (< 2m) */}
                            <div className="bg-slate-950/70 border border-emerald-500/30 p-4 rounded-2xl space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">&lt; 2 Months</span>
                                    <Badge className="bg-emerald-500/20 text-emerald-300 text-[9px] font-bold">Fresh</Badge>
                                </div>
                                <div className="text-xl font-black text-white font-mono">
                                    ${b.under2m.costValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                                <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                                    <span>{b.under2m.units} pcs</span>
                                    <span className="text-emerald-400 font-bold">{b.under2m.pct}% capital</span>
                                </div>
                            </div>

                            {/* 2. Aging (2 - 4m) */}
                            <div className="bg-slate-950/70 border border-sky-500/30 p-4 rounded-2xl space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-sky-400">2 - 4 Months</span>
                                    <Badge className="bg-sky-500/20 text-sky-300 text-[9px] font-bold">Normal</Badge>
                                </div>
                                <div className="text-xl font-black text-white font-mono">
                                    ${b.twoTo4m.costValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                                <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                                    <span>{b.twoTo4m.units} pcs</span>
                                    <span className="text-sky-400 font-bold">{b.twoTo4m.pct}% capital</span>
                                </div>
                            </div>

                            {/* 3. Stagnant (4 - 6m) */}
                            <div className="bg-slate-950/70 border border-amber-500/30 p-4 rounded-2xl space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">4 - 6 Months</span>
                                    <Badge className="bg-amber-500/20 text-amber-300 text-[9px] font-bold">Stagnant</Badge>
                                </div>
                                <div className="text-xl font-black text-white font-mono">
                                    ${b.fourTo6m.costValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                                <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                                    <span>{b.fourTo6m.units} pcs</span>
                                    <span className="text-amber-400 font-bold">{b.fourTo6m.pct}% capital</span>
                                </div>
                            </div>

                            {/* 4. Critical (6 - 8m) */}
                            <div className="bg-slate-950/70 border border-orange-500/30 p-4 rounded-2xl space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-orange-400">6 - 8 Months</span>
                                    <Badge className="bg-orange-500/20 text-orange-300 text-[9px] font-bold">Critical</Badge>
                                </div>
                                <div className="text-xl font-black text-white font-mono">
                                    ${b.sixTo8m.costValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                                <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                                    <span>{b.sixTo8m.units} pcs</span>
                                    <span className="text-orange-400 font-bold">{b.sixTo8m.pct}% capital</span>
                                </div>
                            </div>

                            {/* 5. Zombie (8+m) */}
                            <div className="bg-slate-950/70 border border-rose-500/40 p-4 rounded-2xl space-y-2 ring-1 ring-rose-500/30">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-rose-400">8+ Months</span>
                                    <Badge className="bg-rose-500/20 text-rose-300 text-[9px] font-bold animate-pulse">Zombie</Badge>
                                </div>
                                <div className="text-xl font-black text-rose-400 font-mono">
                                    ${b.over8m.costValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                                <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                                    <span>{b.over8m.units} pcs</span>
                                    <span className="text-rose-400 font-bold">{b.over8m.pct}% capital</span>
                                </div>
                            </div>
                        </div>

                        {/* Stacked Progress Bar */}
                        <div className="space-y-2">
                            <div className="flex justify-between text-[11px] font-mono text-slate-400">
                                <span>Capital Velocity Spectrum</span>
                                <span>100% of Shop Capital</span>
                            </div>
                            <div className="h-4 w-full bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
                                <div style={{ width: `${b.under2m.pct}%` }} className="bg-emerald-500 h-full" title={`< 2m: ${b.under2m.pct}%`} />
                                <div style={{ width: `${b.twoTo4m.pct}%` }} className="bg-sky-500 h-full" title={`2-4m: ${b.twoTo4m.pct}%`} />
                                <div style={{ width: `${b.fourTo6m.pct}%` }} className="bg-amber-500 h-full" title={`4-6m: ${b.fourTo6m.pct}%`} />
                                <div style={{ width: `${b.sixTo8m.pct}%` }} className="bg-orange-500 h-full" title={`6-8m: ${b.sixTo8m.pct}%`} />
                                <div style={{ width: `${b.over8m.pct}%` }} className="bg-rose-500 h-full" title={`8+m: ${b.over8m.pct}%`} />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Recommendations & Blind-Spots Split */}
                <div className="grid gap-6 md:grid-cols-2">
                    {/* Clearance Recommendations */}
                    <Card className="bg-slate-900/60 border-slate-800 shadow-xl backdrop-blur-md">
                        <CardHeader>
                            <CardTitle className="text-lg font-black uppercase italic tracking-tight text-white flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-amber-400" /> Actionable Clearance Strategies
                            </CardTitle>
                            <CardDescription className="text-xs text-slate-400">
                                Data-driven tactics to liquidate aged units and recover trapped capital.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {r.recommendations.map((rec: string, index: number) => (
                                <div key={index} className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-2xl flex items-start gap-3">
                                    <div className="h-6 w-6 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5 text-xs font-black text-amber-400">
                                        {index + 1}
                                    </div>
                                    <p className="text-xs text-slate-200 font-medium leading-relaxed">{rec}</p>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    {/* Blind Spots Addressed */}
                    <Card className="bg-slate-900/60 border-slate-800 shadow-xl backdrop-blur-md">
                        <CardHeader>
                            <CardTitle className="text-lg font-black uppercase italic tracking-tight text-white flex items-center gap-2">
                                <ShieldCheck className="h-5 w-5 text-sky-400" /> Critical Audit Blind-Spots Unmasked
                            </CardTitle>
                            <CardDescription className="text-xs text-slate-400">
                                Major risk factors that standard sales reports fail to detect.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {r.blindSpots.map((blind: string, index: number) => (
                                <div key={index} className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-2xl flex items-start gap-3">
                                    <div className="h-6 w-6 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center shrink-0 mt-0.5 text-xs font-black text-sky-400">
                                        ✓
                                    </div>
                                    <p className="text-xs text-slate-300 font-medium leading-relaxed">{blind}</p>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>

                {/* Finish & Back to POS Footer */}
                <div className="text-center pt-4">
                    <Link href={`/shops/${shop.id}`}>
                        <Button className="bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase text-sm h-12 px-8 rounded-2xl shadow-xl shadow-emerald-600/30">
                            Complete & Return to {shop.name} POS
                        </Button>
                    </Link>
                </div>
            </div>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACTIVE STOCKTAKE CONDUCT SCREEN
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="max-w-7xl mx-auto space-y-6 pb-32 pt-2 px-2 sm:px-4">
            {/* Top Navigation & Status Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-4 sm:p-5 rounded-3xl backdrop-blur-md shadow-2xl">
                <div className="flex items-center gap-3">
                    <Link href={`/shops/${shop.id}`}>
                        <Button variant="ghost" size="icon" className="h-10 w-10 text-slate-400 hover:text-white rounded-xl bg-slate-950 border border-slate-800">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl sm:text-3xl font-black uppercase italic tracking-tight text-white">
                                {shop.name} Stocktake
                            </h1>
                            <Badge className="bg-indigo-500/20 text-indigo-400 border-indigo-500/30 uppercase font-black text-[9px]">
                                Monthly Audit
                            </Badge>
                        </div>
                        <p className="text-xs text-slate-400">
                            Touch-first stock count • Update physical counts & landed costs
                        </p>
                    </div>
                </div>

                {/* Right Auditor Selector & Primary Action */}
                <div className="flex flex-wrap items-center gap-2.5">
                    {/* Auditor Selector */}
                    <div className="bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-2xl flex items-center gap-2 h-11">
                        <ShieldCheck className="h-4 w-4 text-violet-400" />
                        <div className="flex flex-col text-left">
                            <span className="text-[8px] text-slate-500 uppercase font-black leading-none">Auditor</span>
                            <select
                                value={selectedAuditorId}
                                onChange={(e) => setSelectedAuditorId(e.target.value)}
                                className="bg-transparent text-xs font-bold text-slate-200 border-none p-0 focus:ring-0 cursor-pointer"
                            >
                                {activeEmployees.map((emp) => (
                                    <option key={emp.id} value={emp.id} className="bg-slate-900 text-white">
                                        {emp.name} {emp.surname || ""} ({emp.role || "Staff"})
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Add New Unit Button */}
                    <Button
                        onClick={() => setIsAddUnitModalOpen(true)}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase text-xs h-11 px-3.5 rounded-2xl shadow-lg shadow-emerald-600/20 flex items-center gap-2"
                        title="Add a new unit to the database and shop stocktake"
                    >
                        <PackagePlus className="h-4 w-4" /> Add New Unit
                    </Button>

                    {/* Complete Stocktake Button */}
                    <Button
                        onClick={() => setIsConfirmModalOpen(true)}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase text-xs h-11 px-4 rounded-2xl shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all hover:scale-105"
                    >
                        <Check className="h-4 w-4" /> Complete Stocktake
                    </Button>
                </div>
            </div>

            {/* Live Metrics Quick Glance */}
            <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
                <div className="bg-slate-900/50 border border-slate-800 p-3.5 rounded-2xl space-y-1">
                    <span className="text-[9px] uppercase font-black text-slate-500 tracking-wider">Physical Count ({shop.name})</span>
                    <div className="text-2xl font-black text-white font-mono">
                        {liveMetrics.totalCountedUnits.toLocaleString()} <span className="text-xs font-bold text-slate-500">pcs</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium">
                        System was: {liveMetrics.totalSystemUnits.toLocaleString()} pcs at {shop.name}
                    </span>
                </div>

                <div className="bg-slate-900/50 border border-slate-800 p-3.5 rounded-2xl space-y-1">
                    <span className="text-[9px] uppercase font-black text-slate-500 tracking-wider">Locked Capital ({shop.name})</span>
                    <div className="text-2xl font-black text-emerald-400 font-mono">
                        ${liveMetrics.totalCostLocked.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium">
                        Retail: ${liveMetrics.totalRetailRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                </div>

                <div className="bg-slate-900/50 border border-slate-800 p-3.5 rounded-2xl space-y-1">
                    <span className="text-[9px] uppercase font-black text-slate-500 tracking-wider">Discrepancies ({shop.name})</span>
                    <div className="text-2xl font-black font-mono">
                        {liveMetrics.shrinkageCount > 0 ? (
                            <span className="text-rose-400">-{liveMetrics.shrinkageCount} pcs (-${liveMetrics.shrinkageCost.toFixed(2)})</span>
                        ) : liveMetrics.surplusCount > 0 ? (
                            <span className="text-emerald-400">+{liveMetrics.surplusCount} pcs</span>
                        ) : (
                            <span className="text-slate-400">Balanced (0)</span>
                        )}
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium">
                        {liveMetrics.discrepancyItemCount} items with variance
                    </span>
                </div>

                <div className="bg-slate-900/50 border border-slate-800 p-3.5 rounded-2xl space-y-1">
                    <span className="text-[9px] uppercase font-black text-slate-500 tracking-wider">Audited Changes</span>
                    <div className="text-2xl font-black text-violet-400 font-mono">
                        {liveMetrics.modifiedItemCount} / {liveMetrics.totalItems}
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium">
                        Modified items in current session
                    </span>
                </div>
            </div>

            {/* Search & Filter Bar */}
            <div className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                    {/* Search Input */}
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                        <Input
                            placeholder={`Search ${shop.name} stock or master catalog by name, SKU...`}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-12 h-12 bg-slate-900/70 border-slate-800 text-sm focus:border-indigo-500/50 rounded-2xl shadow"
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm("")}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>

                    {/* Filter Tabs */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                        <button
                            onClick={() => setActiveTab("in_stock")}
                            className={`px-3 py-2 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${
                                activeTab === "in_stock" ? "bg-indigo-600 text-white" : "bg-slate-900/80 text-slate-400 hover:text-white"
                            }`}
                        >
                            {shop.name} Stock ({items.filter((i) => i.physicalQuantity > 0 || i.systemQuantity > 0).length})
                        </button>
                        <button
                            onClick={() => setActiveTab("discrepancies")}
                            className={`px-3 py-2 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${
                                activeTab === "discrepancies" ? "bg-rose-600 text-white" : "bg-slate-900/80 text-slate-400 hover:text-white"
                            }`}
                        >
                            Discrepancies ({liveMetrics.discrepancyItemCount})
                        </button>
                        <button
                            onClick={() => setActiveTab("modified")}
                            className={`px-3 py-2 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${
                                activeTab === "modified" ? "bg-violet-600 text-white" : "bg-slate-900/80 text-slate-400 hover:text-white"
                            }`}
                        >
                            Modified ({liveMetrics.modifiedItemCount})
                        </button>
                        <button
                            onClick={() => setActiveTab("zombie")}
                            className={`px-3 py-2 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${
                                activeTab === "zombie" ? "bg-amber-600 text-white" : "bg-slate-900/80 text-slate-400 hover:text-white"
                            }`}
                        >
                            Zombie (&gt;8m)
                        </button>
                        <button
                            onClick={() => setActiveTab("all")}
                            className={`px-3 py-2 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${
                                activeTab === "all" ? "bg-slate-800 text-white" : "bg-slate-900/80 text-slate-500 hover:text-white"
                            }`}
                        >
                            Master Catalog ({items.length})
                        </button>
                    </div>
                </div>

                {/* Category Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    <button
                        onClick={() => setSelectedCategory("ALL")}
                        className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                            selectedCategory === "ALL" ? "bg-white text-slate-950 font-black" : "bg-slate-900 text-slate-400 hover:text-white"
                        }`}
                    >
                        All Categories
                    </button>
                    {categories.map((cat) => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                                selectedCategory === cat ? "bg-white text-slate-950 font-black" : "bg-slate-900 text-slate-400 hover:text-white"
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Product List / Touch Cards */}
            <div className="space-y-3">
                {filteredItems.length === 0 ? (
                    <div className="text-center py-16 bg-slate-900/30 border border-slate-800 rounded-3xl space-y-3">
                        <Package className="h-10 w-10 text-slate-600 mx-auto" />
                        <p className="text-slate-400 font-medium">No items match your search filter.</p>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setSearchTerm("");
                                setSelectedCategory("ALL");
                                setActiveTab("all");
                            }}
                            className="text-xs font-black uppercase border-slate-800"
                        >
                            Reset Filters
                        </Button>
                    </div>
                ) : (
                    filteredItems.map((item) => {
                        const days = getDaysInSystem(item.dateAdded);
                        const aging = getAgingCategory(days);
                        const delta = item.physicalQuantity - item.systemQuantity;
                        const itemLockedCost = item.physicalQuantity * item.landedCost;
                        const itemRetailVal = item.physicalQuantity * item.sellingPrice;

                        return (
                            <div
                                key={item.id}
                                className={`bg-slate-900/60 border rounded-2xl p-4 transition-all shadow-md ${
                                    item.isModified
                                        ? "border-violet-500/50 bg-violet-950/20"
                                        : delta !== 0
                                        ? "border-amber-500/40"
                                        : "border-slate-800/80"
                                }`}
                            >
                                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                    {/* Left: Product Info & Age */}
                                    <div className="space-y-1.5 flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="text-base font-black text-white truncate max-w-md">
                                                {item.name}
                                            </h3>
                                            <Badge className="bg-slate-800 text-slate-300 text-[9px] uppercase font-bold">
                                                {item.category || "General"}
                                            </Badge>
                                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${aging.color}`}>
                                                {aging.label} • {days}d
                                            </span>
                                            {item.sku && (
                                                <span className="text-[10px] font-mono text-slate-500">
                                                    SKU: {item.sku}
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex flex-wrap items-center gap-4 text-xs">
                                            <span className="text-slate-400">
                                                System Qty: <strong className="text-white font-mono">{item.systemQuantity} pcs</strong>
                                            </span>
                                            <span className="text-slate-400">
                                                Variance:{" "}
                                                {delta === 0 ? (
                                                    <span className="text-emerald-400 font-bold font-mono">0 (Match)</span>
                                                ) : delta < 0 ? (
                                                    <span className="text-rose-400 font-bold font-mono">{delta} pcs (Shrinkage)</span>
                                                ) : (
                                                    <span className="text-emerald-400 font-bold font-mono">+{delta} pcs (Surplus)</span>
                                                )}
                                            </span>
                                            <span className="text-slate-400">
                                                Locked: <strong className="text-emerald-400 font-mono">${itemLockedCost.toFixed(2)}</strong> (Cost) |{" "}
                                                <strong className="text-sky-400 font-mono">${itemRetailVal.toFixed(2)}</strong> (Retail)
                                            </span>
                                        </div>
                                    </div>

                                    {/* Middle: Inline Editable Cost & Selling Price */}
                                    <div className="flex items-center gap-3 shrink-0">
                                        <div className="flex flex-col">
                                            <label className="text-[9px] uppercase font-black text-slate-500">Landed Cost ($)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={item.landedCost || ""}
                                                onChange={(e) => updateLandedCost(item.id, parseFloat(e.target.value) || 0)}
                                                className="w-20 h-9 bg-slate-950 border border-slate-800 rounded-xl px-2 text-xs font-mono font-bold text-emerald-400 focus:border-emerald-500 focus:ring-0"
                                            />
                                        </div>

                                        <div className="flex flex-col">
                                            <label className="text-[9px] uppercase font-black text-slate-500">Retail Price ($)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={item.sellingPrice || ""}
                                                onChange={(e) => updateSellingPrice(item.id, parseFloat(e.target.value) || 0)}
                                                className="w-20 h-9 bg-slate-950 border border-slate-800 rounded-xl px-2 text-xs font-mono font-bold text-sky-400 focus:border-sky-500 focus:ring-0"
                                            />
                                        </div>
                                    </div>

                                    {/* Right: Zero-Typing Stepper Controls */}
                                    <div className="flex items-center gap-1.5 shrink-0 bg-slate-950/80 border border-slate-800 p-1.5 rounded-2xl">
                                        {/* -5 */}
                                        <button
                                            type="button"
                                            onClick={() => adjustQuantity(item.id, -5)}
                                            className="h-9 w-9 flex items-center justify-center rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-black text-slate-300 hover:text-white transition-all active:scale-95"
                                            title="Reduce by 5"
                                        >
                                            -5
                                        </button>

                                        {/* -1 */}
                                        <button
                                            type="button"
                                            onClick={() => adjustQuantity(item.id, -1)}
                                            className="h-9 w-9 flex items-center justify-center rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-all active:scale-95"
                                            title="Reduce by 1"
                                        >
                                            <Minus className="h-4 w-4" />
                                        </button>

                                        {/* Current Physical Count */}
                                        <div className="px-3 min-w-[70px] text-center">
                                            <input
                                                type="number"
                                                min="0"
                                                value={item.physicalQuantity}
                                                onChange={(e) => setExactQuantity(item.id, parseInt(e.target.value) || 0)}
                                                className="w-14 text-center font-mono font-black text-lg bg-transparent border-none text-white p-0 focus:ring-0"
                                            />
                                            <span className="block text-[8px] uppercase font-black text-slate-500 leading-none">Count</span>
                                        </div>

                                        {/* +1 */}
                                        <button
                                            type="button"
                                            onClick={() => adjustQuantity(item.id, 1)}
                                            className="h-9 w-9 flex items-center justify-center rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-all active:scale-95"
                                            title="Add 1"
                                        >
                                            <Plus className="h-4 w-4" />
                                        </button>

                                        {/* +5 */}
                                        <button
                                            type="button"
                                            onClick={() => adjustQuantity(item.id, 5)}
                                            className="h-9 w-9 flex items-center justify-center rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-black text-slate-300 hover:text-white transition-all active:scale-95"
                                            title="Add 5"
                                        >
                                            +5
                                        </button>

                                        {/* +10 */}
                                        <button
                                            type="button"
                                            onClick={() => adjustQuantity(item.id, 10)}
                                            className="h-9 w-9 flex items-center justify-center rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-black text-slate-300 hover:text-white transition-all active:scale-95"
                                            title="Add 10"
                                        >
                                            +10
                                        </button>

                                        {/* Zero out button */}
                                        <button
                                            type="button"
                                            onClick={() => setExactQuantity(item.id, 0)}
                                            className="h-9 px-2.5 flex items-center justify-center rounded-xl bg-slate-900 hover:bg-rose-950/40 text-[9px] font-black uppercase text-slate-500 hover:text-rose-400 border border-slate-800 hover:border-rose-500/40 transition-all"
                                            title="Set physical count to 0"
                                        >
                                            Zero
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* ─────────────────────────────────────────────────────────────────
                ADD NEW UNIT MODAL
            ───────────────────────────────────────────────────────────────── */}
            {isAddUnitModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
                    <Card className="w-full max-w-md bg-slate-900 border-slate-800 shadow-2xl">
                        <CardHeader className="flex flex-row items-center justify-between pb-3">
                            <div>
                                <CardTitle className="text-xl font-black uppercase italic tracking-tight text-white flex items-center gap-2">
                                    <PackagePlus className="h-5 w-5 text-emerald-400" /> Add New Unit
                                </CardTitle>
                                <CardDescription className="text-xs text-slate-400 mt-1">
                                    Create a new item and immediately allocate it to {shop.name}.
                                </CardDescription>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setIsAddUnitModalOpen(false)}
                                className="h-8 w-8 text-slate-400 hover:text-white"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Product Name */}
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                    Product Name *
                                </label>
                                <Input
                                    placeholder="e.g. 18K Gold Plated Tennis Bracelet"
                                    value={newUnitName}
                                    onChange={(e) => setNewUnitName(e.target.value)}
                                    className="bg-slate-950 border-slate-800 text-sm"
                                    autoFocus
                                />
                            </div>

                            {/* Category */}
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                    Category
                                </label>
                                <div className="flex gap-2">
                                    <Input
                                        placeholder="Category"
                                        value={newUnitCategory}
                                        onChange={(e) => setNewUnitCategory(e.target.value)}
                                        className="bg-slate-950 border-slate-800 text-sm flex-1"
                                    />
                                    <select
                                        onChange={(e) => setNewUnitCategory(e.target.value)}
                                        className="bg-slate-950 border border-slate-800 text-xs rounded-xl px-2 text-slate-300"
                                    >
                                        <option value="">Presets</option>
                                        <option value="Jewelry">Jewelry</option>
                                        <option value="Chains">Chains</option>
                                        <option value="Pendants">Pendants</option>
                                        <option value="Watches">Watches</option>
                                        <option value="Bracelets">Bracelets</option>
                                        <option value="Rings">Rings</option>
                                        <option value="Perfume">Perfume</option>
                                        <option value="Apparel">Apparel</option>
                                    </select>
                                </div>
                            </div>

                            {/* Quantities & Pricing Row */}
                            <div className="grid grid-cols-3 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                                        Count (Pcs) *
                                    </label>
                                    <Input
                                        type="number"
                                        min="1"
                                        value={newUnitQuantity}
                                        onChange={(e) => setNewUnitQuantity(parseInt(e.target.value) || 1)}
                                        className="bg-slate-950 border-slate-800 text-sm font-mono font-bold"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                                        Landed Cost ($) *
                                    </label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="0.00"
                                        value={newUnitLandedCost}
                                        onChange={(e) => {
                                            setNewUnitLandedCost(e.target.value);
                                            const cost = parseFloat(e.target.value) || 0;
                                            if (cost > 0 && !newUnitSellingPrice) {
                                                setNewUnitSellingPrice((cost * 1.617).toFixed(2));
                                            }
                                        }}
                                        className="bg-slate-950 border-slate-800 text-sm font-mono font-bold text-emerald-400"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                                        Retail Price ($)
                                    </label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="0.00"
                                        value={newUnitSellingPrice}
                                        onChange={(e) => setNewUnitSellingPrice(e.target.value)}
                                        className="bg-slate-950 border-slate-800 text-sm font-mono font-bold text-sky-400"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
                                <Button
                                    variant="outline"
                                    onClick={() => setIsAddUnitModalOpen(false)}
                                    className="border-slate-800 text-xs font-black uppercase"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleAddNewUnit}
                                    disabled={isAddingUnit || !newUnitName.trim()}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase px-5"
                                >
                                    {isAddingUnit ? "Adding..." : "Save & Allocate Unit"}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* ─────────────────────────────────────────────────────────────────
                CONFIRM COMPLETE STOCKTAKE MODAL
            ───────────────────────────────────────────────────────────────── */}
            {isConfirmModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
                    <Card className="w-full max-w-lg bg-slate-900 border-slate-800 shadow-2xl">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-xl font-black uppercase italic tracking-tight text-white flex items-center gap-2">
                                <CheckCircle2 className="h-5 w-5 text-indigo-400" /> Complete {shop.name} Stocktake
                            </CardTitle>
                            <CardDescription className="text-xs text-slate-400 mt-1">
                                Review final inventory audit numbers before committing to the database.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Summary Matrix */}
                            <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-2xl space-y-2.5 text-xs">
                                <div className="flex justify-between items-center text-slate-300">
                                    <span>Auditing Cashier/Staff:</span>
                                    <strong className="text-white font-bold">{auditorDisplayName}</strong>
                                </div>
                                <div className="flex justify-between items-center text-slate-300">
                                    <span>Total Physical Count:</span>
                                    <strong className="text-white font-mono font-bold">{liveMetrics.totalCountedUnits} pcs</strong>
                                </div>
                                <div className="flex justify-between items-center text-slate-300">
                                    <span>Previous System Records:</span>
                                    <span className="text-slate-400 font-mono">{liveMetrics.totalSystemUnits} pcs</span>
                                </div>
                                <div className="border-t border-slate-800 pt-2 flex justify-between items-center">
                                    <span className="text-slate-300">Total Locked Capital (Cost):</span>
                                    <strong className="text-emerald-400 font-mono font-bold">
                                        ${liveMetrics.totalCostLocked.toFixed(2)}
                                    </strong>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-300">Expected Retail Revenue:</span>
                                    <strong className="text-sky-400 font-mono font-bold">
                                        ${liveMetrics.totalRetailRevenue.toFixed(2)}
                                    </strong>
                                </div>
                                <div className="border-t border-slate-800 pt-2 flex justify-between items-center">
                                    <span className="text-slate-300">Shrinkage Loss:</span>
                                    {liveMetrics.shrinkageCount > 0 ? (
                                        <span className="text-rose-400 font-mono font-bold">
                                            -{liveMetrics.shrinkageCount} pcs (-${liveMetrics.shrinkageCost.toFixed(2)})
                                        </span>
                                    ) : (
                                        <span className="text-emerald-400 font-mono">None ($0.00)</span>
                                    )}
                                </div>
                            </div>

                            <div className="p-3 bg-indigo-950/30 border border-indigo-500/30 rounded-xl text-[11px] text-indigo-300 space-y-1">
                                <p className="font-bold flex items-center gap-1.5">
                                    <Sparkles className="h-3.5 w-3.5" /> What happens next:
                                </p>
                                <ul className="list-disc list-inside space-y-0.5 text-slate-300 text-[10px]">
                                    <li>Shop allocations and global inventory counts are reconciled.</li>
                                    <li>Landed costs and selling prices update database records.</li>
                                    <li>A 30-day monthly stocktake schedule is locked in.</li>
                                    <li>A WhatsApp executive summary is generated & dispatched.</li>
                                    <li>A downloadable PDF executive document is created instantly.</li>
                                </ul>
                            </div>

                            <div className="flex justify-end gap-2.5 pt-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setIsConfirmModalOpen(false)}
                                    disabled={isCompleting}
                                    className="border-slate-800 text-xs font-black uppercase"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleCompleteStocktake}
                                    disabled={isCompleting}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase px-6 shadow-lg shadow-indigo-600/30"
                                >
                                    {isCompleting ? "Reconciling..." : "Confirm & Complete Stocktake"}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
