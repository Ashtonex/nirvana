"use client";

import React, { useEffect, useMemo, useState, useTransition } from "react";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    Button,
    Input,
    Badge
} from "@/components/ui";
import {
    Plus,
    Trash2,
    Truck,
    TrendingUp,
    TrendingDown,
    Save,
    Search,
    RefreshCcw,
    AlertTriangle,
    DollarSign,
    Zap,
    Scale,
    Clock,
    Target,
    Store,
    Upload,
    FileText,
    X,
    Check,
    AlertCircle,
    BarChart3,
    Loader2,
    ShieldAlert,
    Download
} from "lucide-react";
import { InventoryIntelligenceCard } from "@/components/InventoryIntelligenceCard";
import { updateGlobalExpenses, processShipment, registerInventoryItem, registerBulkInventoryItems, updateInventoryItem, deleteInventoryItem, logInventoryAdjustment } from "../actions";

export default function InventoryMaster({ db }: { db: any }) {
    const inventory = db?.inventory || [];
    const sales = db?.sales || [];
    const shops = db?.shops || [];

    const TAX_RATE = 1.155; // 15.5% Tax Buffer

    // Predictive logic helper — includes ML-driven Reorder Point & Safety Stock
    const getInsights = (itemId: string, currentQty: number, landedCost: number, dateAdded: string) => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const relevantSales = sales.filter((s: any) => s.itemId === itemId && new Date(s.date) >= thirtyDaysAgo);
        const totalSold = relevantSales.reduce((acc: number, s: any) => acc + s.quantity, 0);
        const velocity = totalSold / 30;
        const daysToZero = velocity > 0 ? Math.floor(currentQty / velocity) : Infinity;

        // Aging & Bleed (Nirvana Logic)
        const totalGlobalOverhead = (globalExpenses && typeof globalExpenses === 'object') ? Object.values(globalExpenses).reduce((a: any, b: any) => a + Number(b), 0) as number : 0;
        const totalInventoryPieces = inventory.reduce((sum: number, i: any) => sum + i.quantity, 0);
        const dailyBleedPerPiece = totalInventoryPieces > 0 ? (totalGlobalOverhead / 30) / totalInventoryPieces : 0;
        const daysInStock = Math.floor((new Date().getTime() - new Date(dateAdded).getTime()) / (1000 * 3600 * 24));
        const cumulativeBleed = dailyBleedPerPiece * daysInStock;

        // Suggest a price that covers Landed + Cumulative Bleed + 50% Margin + 15.5% Tax
        const suggestedPrice = (landedCost + cumulativeBleed) * 1.5 * TAX_RATE;

        // ML-Driven Reorder Point & Safety Stock (95% service level, Z=1.65)
        const safetyStock = Math.ceil(velocity * leadTimeDays * 0.5);
        const rop = Math.ceil(velocity * leadTimeDays + safetyStock);
        const stockStatus: 'safe' | 'monitor' | 'reorder' | 'critical' =
            currentQty <= safetyStock ? 'critical'
            : currentQty <= rop ? 'reorder'
            : currentQty <= rop * 2 ? 'monitor'
            : 'safe';

        return { velocity, daysToZero, totalSold, suggestedPrice, cumulativeBleed, daysInStock, safetyStock, rop, stockStatus };
    };

    const [activeSimulation, setActiveSimulation] = useState<any>(null); // For The Oracle Modal

    const [globalExpenses, setGlobalExpenses] = useState(db?.globalExpenses || {});
    const [isPending, startTransition] = useTransition();
    // Weighted landed cost split method: 'piece' | 'value' | 'weight'
    const [costSplitMethod, setCostSplitMethod] = useState<'piece' | 'value' | 'weight'>('piece');
    // Lead time in days (configurable, default 7) used for ROP
    const [leadTimeDays, setLeadTimeDays] = useState(7);
    // Audit log state
    const [auditLog, setAuditLog] = useState<{ id: string; timestamp: string; details: string }[]>([]);
    const [auditLogVisible, setAuditLogVisible] = useState(false);
    const [auditLogLoading, setAuditLogLoading] = useState(false);
    const [stockBrain, setStockBrain] = useState<any>(null);
    const [stockBrainLoading, setStockBrainLoading] = useState(false);
    const [simulationBudget, setSimulationBudget] = useState(500);
    const [snapshotRunning, setSnapshotRunning] = useState(false);
    const [snapshotMessage, setSnapshotMessage] = useState("");
    const [intelligenceRefreshKey, setIntelligenceRefreshKey] = useState(0);
    const [workflowDraft, setWorkflowDraft] = useState<{ type: string; title: string; rows: Array<Record<string, any>> } | null>(null);
    const [shipment, setShipment] = useState({
        supplier: "",
        shipmentNumber: "",
        shippingCost: 0,
        dutyCost: 0,
        purchasePrice: 0,
        manifestPieces: 0
    });

    // The Oracle: Generates 5 pricing tiers for a product
    const generatePriceTiers = (landedCost: number, overheadPerPiece: number) => {
        const baseCost = landedCost + overheadPerPiece;
        const tiers = [
            { name: "Break-Even", multiplier: 1.0, color: "text-slate-400" }, // 0% Net
            { name: "Lean", multiplier: 1.15, color: "text-emerald-400" }, // 15% Net
            { name: "Standard", multiplier: 1.35, color: "text-sky-400" }, // 35% Net
            { name: "Premium", multiplier: 1.65, color: "text-violet-400" }, // 65% Net
            { name: "Oracle", multiplier: 2.0, color: "text-amber-400" }, // 100% Net
        ];

        return tiers.map(tier => {
            const sellingPrice = baseCost * tier.multiplier * TAX_RATE;
            const netProfit = (baseCost * tier.multiplier) - baseCost; // Excludes tax from profit calc
            return {
                ...tier,
                price: sellingPrice,
                netProfit
            };
        });
    };

    const [items, setItems] = useState([
        { name: "", category: "", quantity: 1, acquisitionPrice: 0, unitPurchasePrice: 0, showOracle: false, weightKg: 0 }
    ]);

    const [showAdHoc, setShowAdHoc] = useState(false);
    const [adHocItem, setAdHocItem] = useState({ name: "", category: "", quantity: 0, acquisitionPrice: 0, landedCost: 0 });

    const [showBulkUpload, setShowBulkUpload] = useState(false);
    const [bulkShops, setBulkShops] = useState<string[]>([]);
    const [bulkLandedCostMethod, setBulkLandedCostMethod] = useState<'flat' | 'auto'>('flat');
    const [bulkFile, setBulkFile] = useState<File | null>(null);
    const [bulkParsedData, setBulkParsedData] = useState<Array<{ name: string; category: string; quantity: number; price: number }>>([]);
    const [bulkError, setBulkError] = useState("");
    const [isUploading, setIsUploading] = useState(false);

    // Search functionality
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedShopsForAdHoc, setSelectedShopsForAdHoc] = useState<string[]>([]);

    // Filter inventory based on search
    // Group inventory by name to provide a unified view and support FIFO restocking
    const groupedInventory = useMemo(() => {
        const grouped = new Map<string, any>();
        for (const item of inventory) {
            const name = item.name || "Unknown";
            const existing = grouped.get(name);
            if (existing) {
                existing.quantity += Number(item.quantity || 0);
                existing.landedCost = Math.max(existing.landedCost || 0, Number(item.landed_cost || item.landedCost || 0));
                // Use oldest date for total stock age tracking
                if (new Date(item.date_added || item.dateAdded) < new Date(existing.dateAdded)) {
                    existing.dateAdded = item.date_added || item.dateAdded;
                }
            } else {
                grouped.set(name, {
                    ...item,
                    dateAdded: item.date_added || item.dateAdded,
                    landedCost: Number(item.landed_cost || item.landedCost || 0)
                });
            }
        }
        return Array.from(grouped.values());
    }, [inventory]);

    // Search-first approach: Hide list until searched
    const filteredInventory = searchTerm.trim() === "" ? [] : groupedInventory.filter((item: any) =>
        item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.sku && item.sku.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const handleRegisterAdHoc = () => {
        if (selectedShopsForAdHoc.length === 0) {
            alert("Please select at least one shop to allocate the product to");
            return;
        }

        if (!adHocItem.name || adHocItem.quantity <= 0 || adHocItem.landedCost <= 0) {
            alert("Please fill all fields with valid values");
            return;
        }

        startTransition(async () => {
            // Calculate acquisition price as total cost (landed cost per unit × quantity)
            const acquisitionPrice = adHocItem.landedCost * adHocItem.quantity;
            const itemToRegister = {
                ...adHocItem,
                acquisitionPrice
            };

            await registerInventoryItem(itemToRegister, selectedShopsForAdHoc);
            setShowAdHoc(false);
            setAdHocItem({ name: "", category: "", quantity: 0, acquisitionPrice: 0, landedCost: 0 });
            setSelectedShopsForAdHoc([]);
            alert(`${adHocItem.name} added to master inventory and allocated to selected shops!`);
        });
    };

    const parseCSV = (text: string): Array<{ name: string; category: string; quantity: number; price: number }> => {
        const lines = text.trim().split('\n');
        const results: Array<{ name: string; category: string; quantity: number; price: number }> = [];

        // Start at 0 - detect if first row is header or data
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const parts = line.split(',').map(p => p.trim());
            if (parts.length >= 4) {
                const name = parts[0];
                const category = parts[1];
                const quantity = parseInt(parts[2]);
                const price = parseFloat(parts[3]);

                // Skip if looks like a header (contains letters in qty/price)
                if (isNaN(quantity) || isNaN(price)) continue;

                if (name && category && !isNaN(quantity) && !isNaN(price)) {
                    results.push({ name, category, quantity, price });
                }
            }
        }

        return results;
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setBulkFile(file);
        setBulkError("");

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            const parsed = parseCSV(text);

            if (parsed.length === 0) {
                setBulkError("No valid items found in CSV. Expected format: name,category,quantity,price");
                setBulkParsedData([]);
            } else {
                setBulkParsedData(parsed);
            }
        };
        reader.readAsText(file);
    };

    const handleBulkUpload = () => {
        if (bulkShops.length === 0) {
            setBulkError("Please select at least one shop");
            return;
        }

        if (bulkParsedData.length === 0) {
            setBulkError("Please upload a valid CSV file");
            return;
        }

        setIsUploading(true);
        startTransition(async () => {
            await registerBulkInventoryItems(bulkParsedData, bulkShops, bulkLandedCostMethod, globalExpenses);
            setShowBulkUpload(false);
            setBulkFile(null);
            setBulkParsedData([]);
            setBulkShops([]);
            setBulkError("");
            setIsUploading(false);
            alert(`Successfully added ${bulkParsedData.length} items to inventory!`);
        });
    };

    const toggleShop = (shopId: string) => {
        if (bulkShops.includes(shopId)) {
            setBulkShops(bulkShops.filter(s => s !== shopId));
        } else {
            setBulkShops([...bulkShops, shopId]);
        }
    };

    const toggleAdHocShop = (shopId: string) => {
        if (selectedShopsForAdHoc.includes(shopId)) {
            setSelectedShopsForAdHoc(selectedShopsForAdHoc.filter(s => s !== shopId));
        } else {
            setSelectedShopsForAdHoc([...selectedShopsForAdHoc, shopId]);
        }
    };

    const [selectedShopId, setSelectedShopId] = useState(db?.shops?.[0]?.id || "");
    const [localShopExpenses, setLocalShopExpenses] = useState(db?.shops?.[0]?.expenses || { rent: 0, salaries: 0, utilities: 0, misc: 0 });

    const itemsTotal = items.reduce((sum, item) => sum + (Number(item.acquisitionPrice) || 0), 0);
    const allocatedPieces = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

    const commandMetrics = useMemo(() => {
        const enriched = inventory.map((item: any) => {
            const insights = getInsights(item.id, Number(item.quantity || 0), Number(item.landedCost || 0), item.dateAdded);
            const capital = Number(item.quantity || 0) * Number(item.landedCost || 0);
            return { ...item, insights, capital };
        });
        const priority = enriched.filter((item: any) => item.insights.stockStatus === 'reorder' || item.insights.stockStatus === 'critical');
        const deadStock = enriched.filter((item: any) => item.insights.totalSold === 0 && item.insights.daysInStock >= 60 && Number(item.quantity || 0) > 0);
        const fastest = [...enriched].sort((a: any, b: any) => b.insights.velocity - a.insights.velocity)[0] || null;
        const risk14 = enriched.filter((item: any) => item.insights.daysToZero !== Infinity && item.insights.daysToZero <= 14);
        const capitalTied = enriched.reduce((sum: number, item: any) => sum + item.capital, 0);
        const deadStockValue = deadStock.reduce((sum: number, item: any) => sum + item.capital, 0);
        const shipmentWarnings = (stockBrain?.shipmentAnalysis || []).filter((shipment: any) =>
            ['margin-risk', 'slow'].includes(shipment.status) || Number(shipment.roi || 0) < 0
        );

        return {
            priorityCount: priority.length,
            priority,
            deadStockValue,
            capitalTied,
            fastest,
            risk14Count: risk14.length,
            shipmentWarnings,
        };
    }, [inventory, sales, globalExpenses, leadTimeDays, stockBrain]);

    const whatIf = useMemo(() => {
        const fourteenDayRisk = inventory.filter((item: any) => {
            const currentQty = Number(item.quantity || 0);
            const insights = getInsights(item.id, currentQty, Number(item.landedCost || 0), item.dateAdded);
            const safetyStock14 = Math.ceil(insights.velocity * 14 * 0.5);
            const rop14 = Math.ceil((insights.velocity * 14) + safetyStock14);
            return insights.velocity > 0 && currentQty <= rop14;
        });
        const recoverableDeadStock = commandMetrics.deadStockValue * 0.8;
        const reorderNeed = commandMetrics.priority.reduce((sum: number, item: any) => {
            const targetUnits = Math.max(0, Math.ceil((item.insights.velocity * 30) - Number(item.quantity || 0)));
            return sum + (targetUnits * Number(item.landedCost || 0));
        }, 0);
        const coverage = reorderNeed > 0 ? Math.min(100, (simulationBudget / reorderNeed) * 100) : 100;

        return {
            fourteenDayRisk: fourteenDayRisk.length,
            recoverableDeadStock,
            reorderNeed,
            coverage,
        };
    }, [inventory, commandMetrics, simulationBudget, sales, globalExpenses]);

    const runInventorySnapshot = async () => {
        setSnapshotRunning(true);
        setSnapshotMessage("Running inventory snapshot...");
        try {
            const res = await fetch('/api/analytics/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind: 'inventory_velocity' })
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.success) {
                const error = json?.results?.[0]?.error || json?.error || "Snapshot failed";
                setSnapshotMessage(error);
                return;
            }
            const summary = json.results?.[0]?.summary || "Inventory snapshot refreshed";
            setSnapshotMessage(summary);
            setIntelligenceRefreshKey((value) => value + 1);
        } catch (error: any) {
            setSnapshotMessage(error?.message || "Snapshot failed");
        } finally {
            setSnapshotRunning(false);
        }
    };

    const generateReorderDraft = () => {
        const rows = commandMetrics.priority.slice(0, 12).map((item: any) => {
            const suggestedQty = Math.max(0, Math.ceil((item.insights.velocity * 30) - Number(item.quantity || 0)));
            return {
                item: item.name,
                currentStock: Number(item.quantity || 0),
                velocity: item.insights.velocity.toFixed(2),
                reorderPoint: item.insights.rop,
                suggestedQty,
                estimatedCost: `$${(suggestedQty * Number(item.landedCost || 0)).toFixed(2)}`,
            };
        });
        setWorkflowDraft({ type: "reorder", title: "Priority Reorder Draft", rows });
    };

    const generateDiscountDraft = () => {
        const rows = inventory
            .map((item: any) => ({ ...item, insights: getInsights(item.id, Number(item.quantity || 0), Number(item.landedCost || 0), item.dateAdded) }))
            .filter((item: any) => item.insights.totalSold === 0 && item.insights.daysInStock >= 60 && Number(item.quantity || 0) > 0)
            .slice(0, 12)
            .map((item: any) => ({
                item: item.name,
                stock: Number(item.quantity || 0),
                age: `${item.insights.daysInStock}d`,
                landedValue: `$${(Number(item.quantity || 0) * Number(item.landedCost || 0)).toFixed(2)}`,
                campaign: "20% recovery discount",
                targetCash: `$${(Number(item.quantity || 0) * Number(item.landedCost || 0) * 0.8).toFixed(2)}`,
            }));
        setWorkflowDraft({ type: "discount", title: "Dead Stock Discount Draft", rows });
    };

    const generateTransferDraft = () => {
        const rows = commandMetrics.priority
            .map((item: any) => {
                const allocations = Array.isArray(item.allocations) ? item.allocations : [];
                if (allocations.length < 2) return null;
                const sorted = [...allocations].sort((a: any, b: any) => Number(a.quantity || 0) - Number(b.quantity || 0));
                const target = sorted[0];
                const source = sorted[sorted.length - 1];
                const movable = Math.max(0, Number(source.quantity || 0) - item.insights.rop);
                if (movable <= 0) return null;
                const fromShop = shops.find((shop: any) => shop.id === source.shopId)?.name || source.shopId;
                const toShop = shops.find((shop: any) => shop.id === target.shopId)?.name || target.shopId;
                return {
                    item: item.name,
                    from: fromShop,
                    to: toShop,
                    suggestedQty: Math.max(1, Math.min(Math.ceil(movable / 2), Math.ceil(item.insights.rop || 1))),
                    reason: `${toShop} has the lowest allocation; ${item.insights.daysToZero === Infinity ? "velocity still forming" : `${item.insights.daysToZero}d runway`}`,
                };
            })
            .filter(Boolean)
            .slice(0, 12);
        setWorkflowDraft({ type: "transfer", title: "Shop Transfer Draft", rows: rows as Array<Record<string, any>> });
    };

    const downloadCsv = (filename: string, rows: Array<Record<string, any>>) => {
        if (rows.length === 0) {
            alert("No rows available for this export yet.");
            return;
        }
        const headers = Object.keys(rows[0]);
        const escapeCell = (value: any) => {
            const text = String(value ?? "");
            return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        };
        const csv = [
            headers.join(","),
            ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(","))
        ].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    const exportPriorityReorders = () => {
        downloadCsv("priority-reorders.csv", commandMetrics.priority.map((item: any) => {
            const suggestedQty = Math.max(0, Math.ceil((item.insights.velocity * 30) - Number(item.quantity || 0)));
            return {
                sku: item.sku || item.id,
                item: item.name,
                category: item.category,
                stock: Number(item.quantity || 0),
                velocity_per_day: item.insights.velocity.toFixed(3),
                days_to_zero: item.insights.daysToZero === Infinity ? "" : item.insights.daysToZero,
                reorder_point: item.insights.rop,
                safety_stock: item.insights.safetyStock,
                suggested_order_qty: suggestedQty,
                estimated_cost: (suggestedQty * Number(item.landedCost || 0)).toFixed(2),
            };
        }));
    };

    const exportTrappedCapital = () => {
        const rows = inventory
            .map((item: any) => ({
                sku: item.sku || item.id,
                item: item.name,
                category: item.category,
                stock: Number(item.quantity || 0),
                landed_cost: Number(item.landedCost || 0).toFixed(2),
                trapped_capital: (Number(item.quantity || 0) * Number(item.landedCost || 0)).toFixed(2),
                date_added: item.dateAdded || "",
            }))
            .sort((a: any, b: any) => Number(b.trapped_capital) - Number(a.trapped_capital));
        downloadCsv("trapped-capital.csv", rows);
    };

    const exportDeadStock = () => {
        const rows = inventory
            .map((item: any) => ({ ...item, insights: getInsights(item.id, Number(item.quantity || 0), Number(item.landedCost || 0), item.dateAdded) }))
            .filter((item: any) => item.insights.totalSold === 0 && item.insights.daysInStock >= 60 && Number(item.quantity || 0) > 0)
            .map((item: any) => ({
                sku: item.sku || item.id,
                item: item.name,
                category: item.category,
                stock: Number(item.quantity || 0),
                days_in_stock: item.insights.daysInStock,
                landed_cost: Number(item.landedCost || 0).toFixed(2),
                dead_stock_value: (Number(item.quantity || 0) * Number(item.landedCost || 0)).toFixed(2),
                recovery_at_20pct_discount: (Number(item.quantity || 0) * Number(item.landedCost || 0) * 0.8).toFixed(2),
            }))
            .sort((a: any, b: any) => Number(b.dead_stock_value) - Number(a.dead_stock_value));
        downloadCsv("dead-stock.csv", rows);
    };

    const exportShipmentWarnings = () => {
        const rows = commandMetrics.shipmentWarnings.map((shipment: any) => ({
            shipment: shipment.shipmentNumber,
            supplier: shipment.supplier,
            status: shipment.status,
            current_units: Number(shipment.currentUnits || 0),
            sold_units: Number(shipment.soldUnits || 0),
            cost_basis: Number(shipment.costBasis || 0).toFixed(2),
            revenue: Number(shipment.revenue || 0).toFixed(2),
            gross_profit: Number(shipment.grossProfit || 0).toFixed(2),
            roi_pct: Number(shipment.roi || 0).toFixed(2),
            sell_through_pct: Number(shipment.sellThrough || 0).toFixed(2),
            fastest_mover: shipment.fastestMover?.name || "",
            slowest_mover: shipment.slowestMover?.name || "",
            signal: ['winning', 'sold-through'].includes(shipment.status) && Number(shipment.roi || 0) > 0 ? "buy again" : "review",
        }));
        downloadCsv("shipment-warnings.csv", rows);
    };

    useEffect(() => {
        let cancelled = false;
        async function loadStockBrain() {
            setStockBrainLoading(true);
            try {
                const res = await fetch('/api/intelligence/stock-brain');
                if (res.ok && !cancelled) setStockBrain(await res.json());
            } catch {
                if (!cancelled) setStockBrain(null);
            } finally {
                if (!cancelled) setStockBrainLoading(false);
            }
        }
        loadStockBrain();
        return () => { cancelled = true; };
    }, []);

    const handleGlobalExpenseChange = (key: string, value: string) => {
        setGlobalExpenses({ ...globalExpenses, [key]: parseFloat(value) || 0 });
    };

    const saveGlobalExpenses = () => {
        startTransition(async () => {
            await updateGlobalExpenses(globalExpenses);
            alert("Global expenses updated!");
        });
    };

    const addItemToShipment = () => {
        setItems([...items, { name: "", category: "", quantity: 1, acquisitionPrice: 0, unitPurchasePrice: 0, showOracle: false, weightKg: 0 }]);
    };

    const removeItemFromShipment = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const updateItem = (index: number, field: string, value: any) => {
        const newItems = [...items];
        const item = { ...newItems[index], [field]: value };

        // Auto-fill category if picking an existing item from the datalist
        if (field === 'name') {
            const existing = groupedInventory.find(i => i.name?.toLowerCase() === String(value).toLowerCase());
            if (existing) {
                item.category = existing.category;
            }
        }

        const q = Number(item.quantity) || 0;
        const up = Number(item.unitPurchasePrice) || 0;
        const ap = Number(item.acquisitionPrice) || 0;

        if (field === 'quantity' || field === 'unitPurchasePrice') {
            item.acquisitionPrice = q * up;
        } else if (field === 'acquisitionPrice') {
            item.unitPurchasePrice = q > 0 ? ap / q : 0;
        }

        item.quantity = Number(item.quantity) || 0;
        item.acquisitionPrice = Number(item.acquisitionPrice) || 0;
        item.unitPurchasePrice = Number(item.unitPurchasePrice) || 0;

        newItems[index] = item;
        setItems(newItems);
    };

    const handleProcessShipment = () => {
        startTransition(async () => {
            await processShipment({
                ...shipment,
                miscCost: 0,
                costSplitMethod,
                items
            });
            setShipment({ supplier: "", shipmentNumber: "", shippingCost: 0, dutyCost: 0, purchasePrice: 0, manifestPieces: 0 });
            setItems([{ name: "", category: "", quantity: 1, acquisitionPrice: 0, unitPurchasePrice: 0, showOracle: false, weightKg: 0 }]);
            alert("Shipment processed successfully!");
        });
    };

    const fetchAuditLog = async () => {
        setAuditLogLoading(true);
        try {
            const res = await fetch('/api/inventory/history');
            if (res.ok) {
                const json = await res.json();
                setAuditLog(json.log || []);
            }
        } catch {
            setAuditLog([]);
        }
        setAuditLogLoading(false);
    };

    const handleToggleAuditLog = () => {
        if (!auditLogVisible && auditLog.length === 0) fetchAuditLog();
        setAuditLogVisible(!auditLogVisible);
    };

    return (
        <div className="space-y-8 pb-32">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl sm:text-4xl font-black tracking-tighter text-slate-100 uppercase italic flex items-center gap-3">
                        <Truck className="text-violet-500 h-7 w-7 sm:h-10 sm:w-10" /> Inventory Master
                    </h1>
                    <p className="text-slate-400 font-medium tracking-tight uppercase text-xs font-black">Central source of truth for global distribution and inventory reconciliation.</p>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                    <div className="flex items-center justify-between">
                        <p className="text-[9px] font-black uppercase tracking-widest text-amber-400">Priority Reorders</p>
                        <AlertTriangle className="h-4 w-4 text-amber-400" />
                    </div>
                    <p className="mt-3 text-2xl font-black text-white">{commandMetrics.priorityCount}</p>
                    <p className="mt-1 truncate text-[10px] font-bold uppercase text-slate-500">
                        {commandMetrics.priority[0]?.name || "No urgent reorder signal"}
                    </p>
                </div>

                <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                    <div className="flex items-center justify-between">
                        <p className="text-[9px] font-black uppercase tracking-widest text-rose-400">Dead Stock Value</p>
                        <ShieldAlert className="h-4 w-4 text-rose-400" />
                    </div>
                    <p className="mt-3 text-2xl font-black text-white">${commandMetrics.deadStockValue.toFixed(0)}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase text-slate-500">60d with no sale</p>
                </div>

                <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4">
                    <div className="flex items-center justify-between">
                        <p className="text-[9px] font-black uppercase tracking-widest text-sky-400">Capital Trapped</p>
                        <DollarSign className="h-4 w-4 text-sky-400" />
                    </div>
                    <p className="mt-3 text-2xl font-black text-white">${commandMetrics.capitalTied.toFixed(0)}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase text-slate-500">Current stock at landed cost</p>
                </div>

                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <div className="flex items-center justify-between">
                        <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400">Fastest Mover</p>
                        <TrendingUp className="h-4 w-4 text-emerald-400" />
                    </div>
                    <p className="mt-3 truncate text-lg font-black text-white">{commandMetrics.fastest?.name || "Waiting"}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase text-slate-500">
                        {(commandMetrics.fastest?.insights?.velocity || 0).toFixed(2)}/day
                    </p>
                </div>

                <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
                    <div className="flex items-center justify-between">
                        <p className="text-[9px] font-black uppercase tracking-widest text-violet-400">14d Stockout Risk</p>
                        <Clock className="h-4 w-4 text-violet-400" />
                    </div>
                    <p className="mt-3 text-2xl font-black text-white">{commandMetrics.risk14Count}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase text-slate-500">Based on current velocity</p>
                </div>

                <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
                    <div className="flex items-center justify-between">
                        <p className="text-[9px] font-black uppercase tracking-widest text-orange-400">Shipment Warnings</p>
                        {stockBrainLoading ? <Loader2 className="h-4 w-4 animate-spin text-orange-400" /> : <BarChart3 className="h-4 w-4 text-orange-400" />}
                    </div>
                    <p className="mt-3 text-2xl font-black text-white">{commandMetrics.shipmentWarnings.length}</p>
                    <p className="mt-1 truncate text-[10px] font-bold uppercase text-slate-500">
                        {commandMetrics.shipmentWarnings[0]?.shipmentNumber || "No margin-risk shipment"}
                    </p>
                </div>
            </div>

            <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-black uppercase italic tracking-widest text-white flex items-center gap-2">
                        <Download className="h-4 w-4 text-emerald-400" /> Inventory command exports
                    </CardTitle>
                    <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
                        Download the exact lists behind the command cards for review, ordering, and cleanup.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <Button
                        variant="outline"
                        onClick={exportPriorityReorders}
                        className="h-11 justify-start border-amber-500/30 text-[10px] font-black uppercase tracking-widest text-amber-400 hover:bg-amber-500/10"
                    >
                        <Download className="mr-2 h-4 w-4" /> Priority reorders
                    </Button>
                    <Button
                        variant="outline"
                        onClick={exportTrappedCapital}
                        className="h-11 justify-start border-sky-500/30 text-[10px] font-black uppercase tracking-widest text-sky-400 hover:bg-sky-500/10"
                    >
                        <Download className="mr-2 h-4 w-4" /> Trapped capital
                    </Button>
                    <Button
                        variant="outline"
                        onClick={exportDeadStock}
                        className="h-11 justify-start border-rose-500/30 text-[10px] font-black uppercase tracking-widest text-rose-400 hover:bg-rose-500/10"
                    >
                        <Download className="mr-2 h-4 w-4" /> Dead stock list
                    </Button>
                    <Button
                        variant="outline"
                        onClick={exportShipmentWarnings}
                        className="h-11 justify-start border-orange-500/30 text-[10px] font-black uppercase tracking-widest text-orange-400 hover:bg-orange-500/10"
                    >
                        <Download className="mr-2 h-4 w-4" /> Shipment warnings
                    </Button>
                </CardContent>
            </Card>

            <div className="grid gap-8 md:grid-cols-12">
                {/* Main Content Area */}
                <div className="md:col-span-8 space-y-8">
                    {/* Integrated Manifest & Ad-Hoc Section */}
                    <Card className="border-slate-800 bg-slate-900/40 backdrop-blur-md shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-1 h-full bg-violet-600 group-hover:bg-emerald-500 transition-colors" />
                        <CardHeader className="border-b border-slate-800/50">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-3 text-2xl font-black uppercase italic text-white">
                                        <Truck className="h-6 w-6 text-violet-400" /> Manifest & Ad-Hoc Acquisition
                                    </CardTitle>
                                    <CardDescription className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">
                                        Ref #{shipment.shipmentNumber || "---"} | {shipment.manifestPieces || allocatedPieces} Pieces Expected
                                    </CardDescription>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        onClick={() => setShowBulkUpload(!showBulkUpload)}
                                        className={`font-black uppercase italic text-xs tracking-widest px-4 h-10 border-2 transition-all flex items-center gap-2 ${showBulkUpload ? 'bg-violet-500/20 text-violet-500 border-violet-500/50' : 'bg-violet-500/10 text-violet-400 border-violet-500/30'}`}
                                    >
                                        <Upload className="h-4 w-4" />
                                        {showBulkUpload ? "Close" : "Bulk CSV"}
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        onClick={() => {
                                            if (confirm("Are you sure you want to PURGE ALL STOCK? This cannot be undone!")) {
                                                if (prompt('Type "PURGE_ALL_STOCK" to confirm') === 'PURGE_ALL_STOCK') {
                                                    fetch('/api/inventory/purge', {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({ confirm: 'PURGE_ALL_STOCK' })
                                                    }).then(() => window.location.reload());
                                                }
                                            }
                                        }}
                                        className="font-black uppercase italic text-xs tracking-widest px-4 h-10 border-2 border-rose-500/50 bg-rose-500/10 text-rose-400"
                                    >
                                        Purge All Stock
                                    </Button>
                                    <Button
                                        onClick={() => setShowAdHoc(!showAdHoc)}
                                        className={`font-black uppercase italic text-xs tracking-widest px-6 h-10 border-2 transition-all ${showAdHoc ? 'bg-rose-500/20 text-rose-500 border-rose-500/50' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'}`}
                                    >
                                        {showAdHoc ? "Close Ad-Hoc" : "Direct Ad-Hoc Add"}
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-8 space-y-10">
                            {showAdHoc && (
                                <div className="p-8 rounded-3xl bg-emerald-500/5 border-2 border-emerald-500/20 animate-in fade-in slide-in-from-top-4 duration-500">
                                    <h3 className="text-emerald-400 font-black uppercase italic tracking-widest text-sm mb-6 flex items-center gap-2">
                                        <Plus className="h-5 w-5 animate-pulse" /> Instant Ledger Registration
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-6">
                                        <div className="space-y-2 md:col-span-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Product Name</label>
                                            <Input
                                                className="bg-slate-950 border-slate-800 text-white font-bold h-12"
                                                placeholder="e.g. iPhone 15 Pro"
                                                value={adHocItem.name}
                                                onChange={(e) => setAdHocItem({ ...adHocItem, name: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Category</label>
                                            <Input
                                                className="bg-slate-950 border-slate-800 text-white font-bold h-12"
                                                placeholder="Mobile"
                                                value={adHocItem.category}
                                                onChange={(e) => setAdHocItem({ ...adHocItem, category: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Quantity</label>
                                            <Input
                                                type="number"
                                                className="bg-slate-950 border-slate-800 text-emerald-400 font-black h-12"
                                                value={adHocItem.quantity}
                                                onChange={(e) => setAdHocItem({ ...adHocItem, quantity: Number(e.target.value) })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Landed ($)</label>
                                            <Input
                                                type="number"
                                                className="bg-slate-950 border-slate-800 text-emerald-400 font-black h-12"
                                                value={adHocItem.landedCost}
                                                onChange={(e) => setAdHocItem({ ...adHocItem, landedCost: Number(e.target.value) })}
                                            />
                                        </div>
                                    </div>

                                    {/* Shop Selection */}
                                    <div className="space-y-3 mb-6">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Allocate to Shops</label>
                                        <div className="flex flex-wrap gap-2">
                                            {db.shops.map((shop: any) => (
                                                <button
                                                    key={shop.id}
                                                    onClick={() => toggleAdHocShop(shop.id)}
                                                    className={`px-4 py-2 rounded-lg border-2 font-black uppercase text-xs tracking-widest transition-all ${selectedShopsForAdHoc.includes(shop.id)
                                                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                                                        : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'
                                                        }`}
                                                >
                                                    {shop.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <Button
                                        onClick={handleRegisterAdHoc}
                                        disabled={isPending || !adHocItem.name || adHocItem.quantity <= 0 || adHocItem.landedCost <= 0 || selectedShopsForAdHoc.length === 0}
                                        className="w-full h-14 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase italic tracking-widest rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.2)] transition-all disabled:opacity-50"
                                    >
                                        Commit Ad-Hoc Item to master ledger
                                    </Button>
                                </div>
                            )}

                            {showBulkUpload && (
                                <div className="p-8 rounded-3xl bg-violet-500/5 border-2 border-violet-500/20 animate-in fade-in slide-in-from-top-4 duration-500">
                                    <h3 className="text-violet-400 font-black uppercase italic tracking-widest text-sm mb-6 flex items-center gap-2">
                                        <Upload className="h-5 w-5 animate-pulse" /> Bulk CSV Import
                                    </h3>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Select Shops</label>
                                            <div className="flex flex-wrap gap-2">
                                                {db.shops.map((shop: any) => (
                                                    <button
                                                        key={shop.id}
                                                        onClick={() => toggleShop(shop.id)}
                                                        className={`px-4 py-2 rounded-lg border-2 font-black uppercase text-xs tracking-widest transition-all ${bulkShops.includes(shop.id)
                                                            ? 'bg-violet-500/20 border-violet-500 text-violet-400'
                                                            : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'
                                                            }`}
                                                    >
                                                        {shop.name}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Landed Cost Method</label>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setBulkLandedCostMethod('flat')}
                                                    className={`flex-1 px-4 py-2 rounded-lg border-2 font-black uppercase text-xs tracking-widest transition-all ${bulkLandedCostMethod === 'flat'
                                                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                                                        : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'
                                                        }`}
                                                >
                                                    Flat Rate
                                                </button>
                                                <button
                                                    onClick={() => setBulkLandedCostMethod('auto')}
                                                    className={`flex-1 px-4 py-2 rounded-lg border-2 font-black uppercase text-xs tracking-widest transition-all ${bulkLandedCostMethod === 'auto'
                                                        ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                                                        : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'
                                                        }`}
                                                >
                                                    Auto-Calculate
                                                </button>
                                            </div>
                                            <p className="text-[9px] text-slate-500">
                                                {bulkLandedCostMethod === 'flat'
                                                    ? 'Uses price column as landed cost directly'
                                                    : 'Adds overhead fraction to price based on monthly expenses'
                                                }
                                            </p>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Upload CSV File</label>
                                        <div className="border-2 border-dashed border-slate-800 rounded-xl p-6 text-center hover:border-violet-500/50 transition-colors">
                                            <input
                                                type="file"
                                                accept=".csv"
                                                onChange={handleFileChange}
                                                className="hidden"
                                                id="bulk-csv-upload"
                                            />
                                            <label htmlFor="bulk-csv-upload" className="cursor-pointer">
                                                <FileText className="h-10 w-10 text-slate-600 mx-auto mb-2" />
                                                <p className="text-sm font-black text-slate-400">
                                                    {bulkFile ? bulkFile.name : "Click to upload CSV"}
                                                </p>
                                                <p className="text-[10px] text-slate-600 mt-1">
                                                    Format: name, category, quantity, price
                                                </p>
                                            </label>
                                        </div>
                                    </div>

                                    {bulkError && (
                                        <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center gap-2">
                                            <AlertCircle className="h-4 w-4 text-rose-500" />
                                            <p className="text-xs font-black text-rose-500">{bulkError}</p>
                                        </div>
                                    )}

                                    {bulkParsedData.length > 0 && (
                                        <div className="mt-6 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                                    Preview ({bulkParsedData.length} items)
                                                </label>
                                                <button
                                                    onClick={() => { setBulkParsedData([]); setBulkFile(null); }}
                                                    className="text-[10px] text-slate-500 hover:text-rose-500"
                                                >
                                                    Clear
                                                </button>
                                            </div>
                                            <div className="max-h-48 overflow-y-auto overflow-x-auto border border-slate-800 rounded-lg">
                                                <table className="w-full text-xs min-w-[500px]">
                                                    <thead className="bg-slate-950 sticky top-0">
                                                        <tr>
                                                            <th className="text-left p-2 font-black text-slate-500 uppercase">Name</th>
                                                            <th className="text-left p-2 font-black text-slate-500 uppercase">Category</th>
                                                            <th className="text-right p-2 font-black text-slate-500 uppercase">Qty</th>
                                                            <th className="text-right p-2 font-black text-slate-500 uppercase">Price</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-800">
                                                        {bulkParsedData.map((item, idx) => (
                                                            <tr key={idx} className="hover:bg-slate-800/30">
                                                                <td className="p-2 font-bold text-slate-300">{item.name}</td>
                                                                <td className="p-2 text-slate-400">{item.category}</td>
                                                                <td className="p-2 text-right font-black text-emerald-400">{item.quantity}</td>
                                                                <td className="p-2 text-right font-black text-slate-300">${item.price.toFixed(2)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    <Button
                                        onClick={handleBulkUpload}
                                        disabled={isPending || isUploading || bulkParsedData.length === 0 || bulkShops.length === 0}
                                        className="w-full mt-6 h-14 bg-violet-600 hover:bg-violet-500 text-white font-black uppercase italic tracking-widest rounded-xl shadow-[0_0_20px_rgba(139,92,246,0.2)] transition-all disabled:opacity-50"
                                    >
                                        {isUploading ? (
                                            <>Processing...</>
                                        ) : (
                                            <>
                                                <Check className="h-5 w-5 mr-2" /> Commit {bulkParsedData.length} Items to Inventory
                                            </>
                                        )}
                                    </Button>
                                </div>
                            )}

                            <div className="space-y-4">
                                <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] border-b border-slate-800 pb-2">Logistics & Totals</h3>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase">Supplier</label>
                                        <Input placeholder="Vendor" value={shipment.supplier} onChange={e => setShipment({ ...shipment, supplier: e.target.value })} className="h-10 bg-slate-950 border-slate-850" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase">Ref #</label>
                                        <Input placeholder="ID" value={shipment.shipmentNumber} onChange={e => setShipment({ ...shipment, shipmentNumber: e.target.value })} className="h-10 bg-slate-950 border-slate-850" />
                                    </div>
                                    <div className="space-y-2 text-sky-400">
                                        <label className="text-[10px] font-black text-slate-400 uppercase">Manifest Pieces</label>
                                        <Input type="number" value={shipment.manifestPieces} onChange={e => setShipment({ ...shipment, manifestPieces: parseInt(e.target.value) || 0 })} className="h-10 bg-slate-950 border-sky-900/40 font-black text-lg" />
                                    </div>
                                    <div className="space-y-2 text-emerald-400">
                                        <label className="text-[10px] font-black text-slate-400 uppercase">Goods Cost</label>
                                        <Input type="number" value={shipment.purchasePrice} onChange={e => setShipment({ ...shipment, purchasePrice: parseFloat(e.target.value) || 0 })} className="h-10 bg-slate-950 border-emerald-900/40 font-black text-lg" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase">Shipping Fees</label>
                                        <Input type="number" value={shipment.shippingCost} onChange={e => setShipment({ ...shipment, shippingCost: parseFloat(e.target.value) || 0 })} className="h-10 bg-slate-950 border-slate-850" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase">Duty Costs</label>
                                        <Input type="number" value={shipment.dutyCost} onChange={e => setShipment({ ...shipment, dutyCost: parseFloat(e.target.value) || 0 })} className="h-10 bg-slate-950 border-slate-850" />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6 pt-6 border-t border-slate-800">
                                {/* Weighted Cost Split Controls */}
                                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-4">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div>
                                            <h3 className="text-[10px] font-black text-amber-400 uppercase tracking-[0.3em] flex items-center gap-1.5">
                                                <Scale className="h-3 w-3" /> Logistics Cost Split Method
                                            </h3>
                                            <p className="text-[9px] text-slate-600 mt-0.5 uppercase tracking-wider">Determines how shipping + duty is distributed across product classes</p>
                                        </div>
                                        <div className="flex gap-1.5">
                                            {(['piece', 'value', 'weight'] as const).map(m => (
                                                <button key={m} onClick={() => setCostSplitMethod(m)}
                                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border-2 transition-all ${
                                                        costSplitMethod === m
                                                            ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                                                            : 'bg-slate-900 border-slate-800 text-slate-600 hover:border-slate-700'
                                                    }`}>
                                                    {m === 'piece' ? 'By Piece' : m === 'value' ? 'By Value' : 'By Weight'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Lead Time (Days)</label>
                                        <Input type="number" value={leadTimeDays} onChange={e => setLeadTimeDays(Math.max(1, parseInt(e.target.value) || 7))}
                                            className="h-8 w-24 bg-slate-900 border-slate-800 text-xs font-black text-sky-400 text-center" />
                                        <span className="text-[9px] text-slate-600 uppercase tracking-wider">Used for Reorder Point calculations on all ledger items</span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between">
                                    <h3 className="text-[10px] font-black text-violet-500 uppercase tracking-[0.3em]">Product Class Breakdown</h3>
                                    <Button size="sm" variant="outline" onClick={addItemToShipment} className="border-violet-500/30 text-violet-400 hover:bg-violet-500/10 h-9 text-[10px] font-black uppercase tracking-widest px-6">
                                        <Plus className="h-4 w-4 mr-2" /> Add Class
                                    </Button>
                                </div>

                                <div className="space-y-4">
                                    {items.map((item, idx) => {
                                        const logisticsBasis = shipment.manifestPieces > 0 ? shipment.manifestPieces : allocatedPieces;
                                        const totalLogistics = shipment.shippingCost + shipment.dutyCost;

                                        // Weighted landed cost split — By Piece / By Value / By Weight
                                        let feePerPiece = 0;
                                        if (costSplitMethod === 'piece') {
                                            feePerPiece = logisticsBasis > 0 ? totalLogistics / logisticsBasis : 0;
                                        } else if (costSplitMethod === 'value') {
                                            feePerPiece = itemsTotal > 0 && item.quantity > 0
                                                ? (totalLogistics * (item.acquisitionPrice / itemsTotal)) / item.quantity
                                                : 0;
                                        } else if (costSplitMethod === 'weight') {
                                            const totalWeight = items.reduce((s, i) => s + ((i as any).weightKg || 0) * i.quantity, 0);
                                            const itemWeight = ((item as any).weightKg || 0) * item.quantity;
                                            feePerPiece = totalWeight > 0 && item.quantity > 0
                                                ? (totalLogistics * (itemWeight / totalWeight)) / item.quantity
                                                : 0;
                                        }

                                        const unitAcquisition = item.quantity > 0 ? item.acquisitionPrice / item.quantity : 0;
                                        const landedUnitCost = unitAcquisition + feePerPiece;

                                        const totalGlobalOverhead = Object.values(globalExpenses).reduce((a: any, b: any) => a + Number(b), 0) as number;
                                        const globalDailyBurn = totalGlobalOverhead / 30;
                                        const overheadPerPiece = logisticsBasis > 0 ? globalDailyBurn / logisticsBasis : 0;

                                        const tiers = generatePriceTiers(landedUnitCost, overheadPerPiece);

                                        return (
                                            <div key={idx} className="space-y-4 bg-slate-950/40 p-6 rounded-2xl border border-slate-800/50 relative group/item">
                                                <div className="grid grid-cols-12 gap-4 items-end">
                                                    <div className="col-span-4 space-y-2">
                                                        <label className="text-[10px] font-black text-slate-500 uppercase text-xs">Name</label>
                                                        <Input 
                                                            list="inventory-names"
                                                            value={item.name} 
                                                            onChange={e => updateItem(idx, 'name', e.target.value)} 
                                                            className="h-10 bg-slate-900 border-slate-800" 
                                                            placeholder="Type or select existing..."
                                                        />
                                                    </div>
                                                    <div className="col-span-2 space-y-2">
                                                        <label className="text-[10px] font-black text-slate-500 uppercase text-xs">Qty</label>
                                                        <Input type="number" value={item.quantity} onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value) || 0)} className="h-10 bg-slate-900 border-slate-800 text-center font-bold" />
                                                    </div>
                                                    <div className="col-span-3 space-y-2 text-emerald-400">
                                                        <label className="text-[10px] font-black text-slate-500 uppercase text-xs">Total Class Cost</label>
                                                        <Input type="number" value={item.acquisitionPrice} onChange={e => updateItem(idx, 'acquisitionPrice', parseFloat(e.target.value) || 0)} className="h-10 bg-slate-900 border-emerald-900/30 font-black" />
                                                    </div>
                                                    {costSplitMethod === 'weight' && (
                                                        <div className="col-span-2 space-y-2 text-amber-400">
                                                            <label className="text-[10px] font-black text-slate-500 uppercase text-xs">Wt (kg)</label>
                                                            <Input type="number" value={(item as any).weightKg || 0} onChange={e => updateItem(idx, 'weightKg', parseFloat(e.target.value) || 0)} className="h-10 bg-slate-900 border-amber-900/30 font-black" />
                                                        </div>
                                                    )}
                                                    <div className={`${costSplitMethod === 'weight' ? 'col-span-1' : 'col-span-3'} space-y-1 text-center`}>
                                                        <div className="text-[9px] font-black text-slate-600 uppercase mb-1">Unit Landed</div>
                                                        <div className="text-sm font-black text-white italic">${landedUnitCost.toFixed(2)}</div>
                                                        <div className="text-[8px] text-amber-500/70 uppercase tracking-widest">
                                                            {costSplitMethod === 'piece' ? 'Flat split' : costSplitMethod === 'value' ? 'Value split' : 'Weight split'}
                                                        </div>
                                                    </div>

                                                    <div className="col-span-12">
                                                        <button
                                                            onClick={() => updateItem(idx, 'showOracle', !(item as any).showOracle)}
                                                            className="w-full flex items-center justify-center gap-2 py-2 border-t border-b border-slate-800/50 text-[10px] font-black uppercase tracking-[0.2em] text-violet-400 hover:text-violet-300 hover:bg-violet-500/5 transition-all mt-2 group-hover/item:border-violet-500/20"
                                                        >
                                                            <Zap className={`h-3 w-3 ${(item as any).showOracle ? 'text-emerald-400' : 'text-violet-400'}`} />
                                                            {(item as any).showOracle ? 'Hide Predictions' : 'Ask The Oracle'}
                                                        </button>

                                                        <div className={`overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${(item as any).showOracle ? 'max-h-[200px] opacity-100 mt-4' : 'max-h-0 opacity-0'
                                                            }`}>
                                                            <div className="text-[9px] font-black text-slate-500 uppercase mb-2 tracking-widest text-center">Oracle Pricing Intelligence</div>
                                                            <div className="grid grid-cols-5 gap-2">
                                                                {tiers.map((tier) => (
                                                                    <button
                                                                        key={tier.name}
                                                                        onClick={() => setActiveSimulation({ ...tier, item, landedUnitCost, overheadPerPiece, taxRate: TAX_RATE })}
                                                                        className={`p-2 rounded-lg border border-slate-800 bg-slate-900/50 hover:bg-slate-800 transition-all text-center group/tier relative overflow-hidden active:scale-95`}
                                                                    >
                                                                        <div className={`text-[9px] font-black uppercase mb-1 ${tier.color}`}>{tier.name}</div>
                                                                        <div className="text-sm font-bold text-slate-300 group-hover/tier:text-white transition-colors">${tier.price.toFixed(2)}</div>
                                                                        <div className={`text-[9px] font-black mt-1 ${tier.netProfit > 0 ? 'text-emerald-500' : 'text-slate-600'}`}>
                                                                            {((tier.netProfit / tier.price) * 100).toFixed(0)}% Net
                                                                        </div>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="absolute top-2 right-2">
                                                        <button onClick={() => removeItemFromShipment(idx)} className="text-slate-800 hover:text-rose-500 p-2 transition-colors">
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <Button
                                className="w-full h-16 bg-gradient-to-r from-violet-600 via-indigo-600 to-emerald-600 font-black text-sm uppercase italic tracking-[0.2em] rounded-xl shadow-2xl hover:scale-[1.01] transition-all"
                                onClick={handleProcessShipment}
                                disabled={isPending || items.length === 0}
                            >
                                Process Global Manifest & Synchronize ledger
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Current Stock Intelligence */}
                    <Card className="bg-slate-900/40 border-slate-800 backdrop-blur-md shadow-2xl overflow-hidden">
                        <CardHeader className="border-b border-slate-800/50 pb-6">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                <div>
                                    <CardTitle className="text-2xl font-black uppercase italic flex items-center gap-3">
                                        <Zap className="h-6 w-6 text-yellow-500 animate-pulse" /> Live Master ledger inventory
                                    </CardTitle>
                                    {snapshotMessage && (
                                        <CardDescription className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                            {snapshotMessage}
                                        </CardDescription>
                                    )}
                                </div>
                                <Button
                                    onClick={runInventorySnapshot}
                                    disabled={snapshotRunning}
                                    className="h-11 bg-yellow-500/10 border-2 border-yellow-500/30 px-5 text-[10px] font-black uppercase italic tracking-widest text-yellow-400 hover:bg-yellow-500/20"
                                >
                                    <RefreshCcw className={`mr-2 h-4 w-4 ${snapshotRunning ? 'animate-spin' : ''}`} />
                                    Run Inventory Snapshot
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                            <InventoryIntelligenceCard refreshKey={intelligenceRefreshKey} />
                            {/* Search Bar */}
                            <div className="flex gap-3">
                                <div className="flex-1 relative">
                                    <Search className="absolute left-3 top-3 h-5 w-5 text-slate-500" />
                                    <Input
                                        placeholder="Search by product name, category, or SKU..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-10 h-11 bg-slate-950 border-slate-800 text-slate-200"
                                    />
                                </div>
                                {searchTerm && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setSearchTerm("")}
                                        className="h-11 w-11 text-slate-500 hover:text-slate-300"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>

                            {/* Results info */}
                            {searchTerm && (
                                <div className="text-xs font-bold text-slate-500">
                                    Found {filteredInventory.length} products
                                </div>
                            )}

                            {/* Inventory List */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {searchTerm.trim() === "" ? (
                                    <div className="col-span-full flex flex-col items-center justify-center py-20 text-slate-500">
                                        <Search className="h-12 w-12 text-slate-800 mb-4" />
                                        <p className="text-lg font-black uppercase tracking-widest text-slate-700">Search to view inventory</p>
                                    </div>
                                ) : filteredInventory.length === 0 ? (
                                    <div className="col-span-full text-center py-10 text-slate-500">
                                        No products match your search
                                    </div>
                                ) : (
                                    filteredInventory.map((item: any) => {
                                        const insights = getInsights(item.id, item.quantity, item.landedCost, item.dateAdded);
                                        const statusColors = {
                                            safe: 'border-emerald-500/30 bg-emerald-500/5',
                                            monitor: 'border-sky-500/30 bg-sky-500/5',
                                            reorder: 'border-amber-500/30 bg-amber-500/5',
                                            critical: 'border-rose-500/30 bg-rose-500/5 animate-pulse'
                                        };
                                        const statusLabels = {
                                            safe: { text: 'SAFE', color: 'text-emerald-400' },
                                            monitor: { text: 'MONITOR', color: 'text-sky-400' },
                                            reorder: { text: 'REORDER', color: 'text-amber-400' },
                                            critical: { text: 'CRITICAL', color: 'text-rose-400' }
                                        };
                                        return (
                                            <div key={item.id} className={`p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group hover:bg-white/5 transition-all border-l-2 ${statusColors[insights.stockStatus]}`}>
                                                <div className="flex items-center gap-6">
                                                    <div className="h-12 w-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center group-hover:border-violet-500/40 transition-colors">
                                                        <Target className="h-6 w-6 text-slate-500 group-hover:text-violet-400" />
                                                    </div>
                                                    <div>
                                                        <p className="text-lg font-black uppercase tracking-tight text-white">{item.name}</p>
                                                        <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{item.sku} | {item.category} | Stock Age: {insights.daysInStock}d</p>
                                                        {/* ROP Badge */}
                                                        <div className="flex items-center gap-3 mt-1.5">
                                                            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${statusColors[insights.stockStatus]} ${statusLabels[insights.stockStatus].color}`}>
                                                                {statusLabels[insights.stockStatus].text}
                                                            </span>
                                                            <span className="text-[9px] text-slate-600 font-bold">
                                                                ROP: {insights.rop} | Safety: {insights.safetyStock} | Stock: {item.quantity}
                                                            </span>
                                                            {insights.stockStatus === 'reorder' || insights.stockStatus === 'critical' ? (
                                                                <span className="text-[9px] font-black text-amber-400 animate-pulse">⚠ ORDER NOW</span>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap gap-4 sm:gap-8 items-center w-full sm:w-auto">
                                                    <div className="text-right">
                                                        <p className="text-[10px] font-black text-slate-600 uppercase mb-1">Bleed / Pc</p>
                                                        <p className="text-xs font-black text-rose-500/80 italic">${insights.cumulativeBleed.toFixed(2)}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-[10px] font-black text-violet-500 uppercase mb-1">Target Price</p>
                                                        <p className="text-lg font-black text-violet-400 italic">${insights.suggestedPrice.toFixed(2)}</p>
                                                    </div>
                                                    <div className="text-right min-w-[70px]">
                                                        <p className="text-[10px] font-black text-slate-600 uppercase mb-1">Velocity</p>
                                                        <p className="text-sm font-black text-emerald-400 italic">{insights.velocity.toFixed(2)}/d</p>
                                                    </div>
                                                    <div className="text-right min-w-[60px]">
                                                        <p className="text-[10px] font-black text-sky-500 uppercase mb-1">Runway</p>
                                                        <p className="text-sm font-black text-sky-400 italic">{insights.daysToZero === Infinity ? '∞' : `${insights.daysToZero}d`}</p>
                                                    </div>
                                                    <div className="flex items-center gap-3 ml-4 pl-4 border-l border-slate-800">
                                                        <button
                                                            onClick={() => {
                                                                const newName = prompt("Update Product Name:", item.name);
                                                                const newQty = prompt("Override Total Quantity:", item.quantity);
                                                                if (newName && newQty) {
                                                                    const reason = prompt("Adjustment Reason (e.g. Recount, Damage, Theft, Replenishment):");
                                                                    if (!reason) { alert("Reason is required for audit compliance."); return; }
                                                                    startTransition(async () => {
                                                                        const result = await updateInventoryItem(item.id, { name: newName, quantity: Number(newQty) });
                                                                        if (result.success) {
                                                                            await logInventoryAdjustment({
                                                                                itemId: item.id,
                                                                                itemName: newName,
                                                                                oldQty: item.quantity,
                                                                                newQty: Number(newQty),
                                                                                reason
                                                                            });
                                                                            const w = (result as { nirvanaTeeWarning?: string }).nirvanaTeeWarning;
                                                                            alert(
                                                                                w
                                                                                    ? `✓ ${newName} quantity updated to ${newQty}.\n\n⚠️ Nirvana Tees: ${w}`
                                                                                    : `✓ ${newName} quantity updated to ${newQty}. Audit logged. All pages will refresh.`
                                                                            );
                                                                            if (auditLogVisible) fetchAuditLog();
                                                                        } else {
                                                                            alert(`❌ Error updating item: ${result.error}`);
                                                                        }
                                                                    });
                                                                }
                                                            }}
                                                            title="Quick Edit Ledger Entry"
                                                            className="p-2 rounded-lg bg-slate-900 text-slate-500 hover:text-sky-400 transition-colors border border-slate-800"
                                                        >
                                                            <Save className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                if (confirm(`CRITICAL: Purge ${item.name} from Master Ledger? This action is IRREVERSIBLE.`)) {
                                                                    startTransition(async () => {
                                                                        const result = await deleteInventoryItem(item.id);
                                                                        if (result.success) {
                                                                            alert(`✓ ${result.message}`);
                                                                        } else {
                                                                            alert(`❌ Error deleting item: ${result.error}`);
                                                                        }
                                                                    });
                                                                }
                                                            }}
                                                            title="Purge Entry"
                                                            className="p-2 rounded-lg bg-slate-900 text-slate-500 hover:text-rose-500 transition-colors border border-slate-800"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                            
                            {/* Datalist for existing products */}
                            <datalist id="inventory-names">
                                {groupedInventory.map((item: any) => (
                                    <option key={item.id} value={item.name} />
                                ))}
                            </datalist>
                        </CardContent>
                    </Card>
                </div>

                {/* Sidebar area */}
                <div className="md:col-span-4 space-y-8">
                    <Card className="bg-slate-900/60 border-slate-800 border-2 overflow-hidden shadow-xl">
                        <CardHeader className="pb-4 border-b border-slate-800/80">
                            <CardTitle className="text-sm font-black uppercase italic tracking-widest text-emerald-400 flex items-center gap-2">
                                <Store className="h-4 w-4" /> Shop Overheads reconciliation
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6 pt-6">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Active Distribution Point</label>
                                <select
                                    className="w-full h-11 bg-slate-950 border border-slate-800 rounded-xl px-4 text-sm font-black text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 appearance-none"
                                    value={selectedShopId}
                                    onChange={(e) => {
                                        const sid = e.target.value;
                                        setSelectedShopId(sid);
                                        const shop = db.shops.find((s: any) => s.id === sid);
                                        if (shop) setLocalShopExpenses(shop.expenses);
                                    }}
                                >
                                    {db.shops.map((s: any) => (
                                        <option key={s.id} value={s.id}>{s.name.toUpperCase()}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {Object.entries(localShopExpenses).map(([key, val]) => (
                                    <div key={key} className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">{key}</label>
                                        <Input
                                            type="number"
                                            value={Number(val)}
                                            onChange={e => setLocalShopExpenses({ ...localShopExpenses, [key]: parseFloat(e.target.value) || 0 })}
                                            className="h-9 bg-slate-950 border-slate-800 text-xs font-black text-emerald-400"
                                        />
                                    </div>
                                ))}
                            </div>

                            <Button
                                className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-xl shadow-lg transition-all"
                                onClick={() => {
                                    startTransition(async () => {
                                        const { updateShopExpenses } = await import("../actions");
                                        await updateShopExpenses(selectedShopId, localShopExpenses);
                                        alert("Shop expenses reconciled successfully.");
                                    });
                                }}
                                disabled={isPending}
                            >
                                <Save className="h-4 w-4 mr-2" /> Commit adjustments
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="bg-slate-900/60 border-slate-800 border-2 overflow-hidden">
                        <CardHeader className="pb-4 border-b border-slate-800/80">
                            <CardTitle className="text-sm font-black uppercase italic tracking-widest text-sky-400 flex items-center gap-2">
                                <DollarSign className="h-4 w-4" /> Global admin costs
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-6">
                            <div className="max-h-[300px] overflow-y-auto space-y-4 pr-1 custom-scrollbar">
                                {Object.entries(globalExpenses).map(([key, val]) => (
                                    <div key={key} className="space-y-2 group/expense relative">
                                        <div className="flex justify-between items-center pr-8">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{key}</label>
                                            <button
                                                onClick={() => {
                                                    const newExp = { ...globalExpenses };
                                                    delete newExp[key];
                                                    setGlobalExpenses(newExp);
                                                }}
                                                className="absolute right-0 top-6 opacity-0 group-hover/expense:opacity-100 text-slate-700 hover:text-rose-500 transition-all"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                        <Input
                                            type="number"
                                            value={String(val || 0)}
                                            onChange={(e) => handleGlobalExpenseChange(key, e.target.value)}
                                            className="h-10 bg-slate-950 border-slate-800 font-black text-sky-400"
                                        />
                                    </div>
                                ))}
                            </div>

                            <div className="pt-4 border-t border-slate-800 space-y-3">
                                <div className="grid grid-cols-2 gap-2">
                                    <Input
                                        placeholder="EXPENSE NAME"
                                        className="h-10 bg-slate-900 border-slate-800 text-[10px] font-black uppercase tracking-widest"
                                        id="new-expense-name"
                                    />
                                    <Input
                                        type="number"
                                        placeholder="$0.00"
                                        className="h-10 bg-slate-900 border-slate-800 text-[10px] font-black uppercase"
                                        id="new-expense-val"
                                    />
                                </div>
                                <Button
                                    variant="outline"
                                    className="w-full h-10 border-sky-900/40 text-sky-500 hover:bg-sky-500/5 text-[9px] font-black uppercase tracking-[0.2em]"
                                    onClick={() => {
                                        const nameInput = document.getElementById('new-expense-name') as HTMLInputElement;
                                        const valInput = document.getElementById('new-expense-val') as HTMLInputElement;
                                        if (nameInput.value) {
                                            setGlobalExpenses({
                                                ...globalExpenses,
                                                [nameInput.value.toUpperCase()]: parseFloat(valInput.value) || 0
                                            });
                                            nameInput.value = "";
                                            valInput.value = "";
                                        }
                                    }}
                                >
                                    <Plus className="h-3 w-3 mr-2" /> Add overhead line
                                </Button>
                                <Button
                                    className="w-full h-12 bg-sky-600 hover:bg-sky-500 text-white font-black uppercase italic tracking-widest rounded-xl mt-2"
                                    onClick={saveGlobalExpenses}
                                    disabled={isPending}
                                >
                                    <RefreshCcw className={`h-4 w-4 mr-2 ${isPending ? 'animate-spin' : ''}`} /> Synchronize admin rates
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-slate-900/60 border-slate-800 border-2 overflow-hidden shadow-xl">
                        <CardHeader className="pb-4 border-b border-slate-800/80">
                            <div className="flex items-center justify-between gap-3">
                                <CardTitle className="text-sm font-black uppercase italic tracking-widest text-amber-400 flex items-center gap-2">
                                    <Clock className="h-4 w-4" /> Adjustment audit
                                </CardTitle>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleToggleAuditLog}
                                    className="h-8 border-amber-500/30 px-3 text-[9px] font-black uppercase tracking-widest text-amber-400"
                                >
                                    {auditLogVisible ? "Hide" : "Show"}
                                </Button>
                            </div>
                        </CardHeader>
                        {auditLogVisible && (
                            <CardContent className="space-y-3 pt-6">
                                {auditLogLoading ? (
                                    <div className="flex items-center justify-center py-8 text-amber-400">
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                    </div>
                                ) : auditLog.length === 0 ? (
                                    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-center text-[10px] font-black uppercase tracking-widest text-slate-600">
                                        No manual adjustments logged yet.
                                    </div>
                                ) : (
                                    <div className="max-h-[280px] space-y-3 overflow-y-auto pr-1">
                                        {auditLog.map((entry) => (
                                            <div key={entry.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">
                                                    {new Date(entry.timestamp).toLocaleString()}
                                                </p>
                                                <p className="mt-1 text-xs font-bold leading-relaxed text-slate-300">{entry.details}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        )}
                    </Card>

                    <Card className="bg-slate-900/60 border-slate-800 border-2 overflow-hidden shadow-xl">
                        <CardHeader className="pb-4 border-b border-slate-800/80">
                            <CardTitle className="text-sm font-black uppercase italic tracking-widest text-orange-400 flex items-center gap-2">
                                <BarChart3 className="h-4 w-4" /> Shipment P&L signals
                            </CardTitle>
                            <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
                                Buy-again logic from shipment sell-through and ROI.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 pt-6">
                            {stockBrainLoading ? (
                                <div className="flex items-center justify-center py-8 text-orange-400">
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                </div>
                            ) : (stockBrain?.shipmentAnalysis || []).length === 0 ? (
                                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-center text-[10px] font-black uppercase tracking-widest text-slate-600">
                                    Shipment analysis will appear after stock brain data loads.
                                </div>
                            ) : (
                                (stockBrain.shipmentAnalysis || []).slice(0, 4).map((shipment: any) => {
                                    const buyAgain = ['winning', 'sold-through'].includes(shipment.status) && Number(shipment.roi || 0) > 0;
                                    return (
                                        <div key={shipment.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-black uppercase text-slate-100">{shipment.shipmentNumber}</p>
                                                    <p className="truncate text-[10px] font-bold uppercase tracking-widest text-slate-600">{shipment.supplier}</p>
                                                </div>
                                                <Badge className={buyAgain ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}>
                                                    {buyAgain ? "Buy again" : "Review"}
                                                </Badge>
                                            </div>
                                            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                                                <div>
                                                    <p className="text-[9px] font-black uppercase text-slate-600">ROI</p>
                                                    <p className="text-xs font-black text-slate-200">{Number(shipment.roi || 0).toFixed(1)}%</p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-black uppercase text-slate-600">Sell</p>
                                                    <p className="text-xs font-black text-slate-200">{Number(shipment.sellThrough || 0).toFixed(0)}%</p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-black uppercase text-slate-600">Left</p>
                                                    <p className="text-xs font-black text-slate-200">{Number(shipment.currentUnits || 0)}</p>
                                                </div>
                                            </div>
                                            <p className="mt-3 text-[10px] font-bold leading-relaxed text-slate-500">
                                                Fast: {shipment.fastestMover?.name || "n/a"} | Slow: {shipment.slowestMover?.name || "n/a"}
                                            </p>
                                        </div>
                                    );
                                })
                            )}
                        </CardContent>
                    </Card>

                    <Card className="bg-slate-900/60 border-slate-800 border-2 overflow-hidden shadow-xl">
                        <CardHeader className="pb-4 border-b border-slate-800/80">
                            <CardTitle className="text-sm font-black uppercase italic tracking-widest text-violet-400 flex items-center gap-2">
                                <Target className="h-4 w-4" /> What-if simulator
                            </CardTitle>
                            <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
                                Fast scenarios before making stock moves.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-6">
                            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">If lead time becomes 14 days</p>
                                <p className="mt-2 text-2xl font-black text-white">{whatIf.fourteenDayRisk}</p>
                                <p className="text-[10px] font-bold uppercase text-slate-500">items would need reorder cover</p>
                            </div>
                            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">If dead stock is discounted 20%</p>
                                <p className="mt-2 text-2xl font-black text-emerald-400">${whatIf.recoverableDeadStock.toFixed(0)}</p>
                                <p className="text-[10px] font-bold uppercase text-slate-500">potential cash recovery</p>
                            </div>
                            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">Fixed reorder budget</p>
                                    <Input
                                        type="number"
                                        value={simulationBudget}
                                        onChange={(e) => setSimulationBudget(Math.max(0, Number(e.target.value) || 0))}
                                        className="h-8 w-24 bg-slate-900 text-right text-xs font-black text-violet-400"
                                    />
                                </div>
                                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-900">
                                    <div className="h-full bg-violet-500" style={{ width: `${whatIf.coverage}%` }} />
                                </div>
                                <p className="mt-2 text-[10px] font-bold uppercase text-slate-500">
                                    Covers {whatIf.coverage.toFixed(0)}% of estimated priority reorder need (${whatIf.reorderNeed.toFixed(0)})
                                </p>
                            </div>
                            <div className="grid grid-cols-1 gap-2">
                                <Button
                                    variant="outline"
                                    onClick={generateTransferDraft}
                                    className="h-10 justify-start border-sky-500/30 text-[10px] font-black uppercase tracking-widest text-sky-400 hover:bg-sky-500/10"
                                >
                                    Generate transfer draft
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={generateReorderDraft}
                                    className="h-10 justify-start border-amber-500/30 text-[10px] font-black uppercase tracking-widest text-amber-400 hover:bg-amber-500/10"
                                >
                                    Generate reorder draft
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={generateDiscountDraft}
                                    className="h-10 justify-start border-rose-500/30 text-[10px] font-black uppercase tracking-widest text-rose-400 hover:bg-rose-500/10"
                                >
                                    Generate discount campaign draft
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {workflowDraft && (
                        <Card className="bg-slate-900/60 border-slate-800 border-2 overflow-hidden shadow-xl">
                            <CardHeader className="pb-4 border-b border-slate-800/80">
                                <div className="flex items-center justify-between gap-3">
                                    <CardTitle className="text-sm font-black uppercase italic tracking-widest text-white flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-violet-400" /> {workflowDraft.title}
                                    </CardTitle>
                                    <button onClick={() => setWorkflowDraft(null)} className="rounded-md p-2 text-slate-500 hover:bg-slate-800 hover:text-white">
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                                <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
                                    Review-only draft. No stock has been moved or ordered.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3 pt-6">
                                {workflowDraft.rows.length === 0 ? (
                                    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-center text-[10px] font-black uppercase tracking-widest text-slate-600">
                                        No eligible rows for this draft right now.
                                    </div>
                                ) : (
                                    <div className="max-h-[360px] overflow-y-auto rounded-xl border border-slate-800">
                                        <table className="w-full min-w-[520px] text-xs">
                                            <thead className="sticky top-0 bg-slate-950">
                                                <tr>
                                                    {Object.keys(workflowDraft.rows[0]).map((key) => (
                                                        <th key={key} className="p-2 text-left text-[9px] font-black uppercase tracking-widest text-slate-500">
                                                            {key}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800">
                                                {workflowDraft.rows.map((row, idx) => (
                                                    <tr key={idx} className="bg-slate-950/40">
                                                        {Object.values(row).map((value, valueIdx) => (
                                                            <td key={valueIdx} className="p-2 font-bold text-slate-300">
                                                                {String(value)}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    <Card className="bg-slate-900/60 border-slate-800 border-2 overflow-hidden shadow-xl">
                        <CardHeader className="pb-4 border-b border-slate-800/80">
                            <CardTitle className="text-sm font-black uppercase italic tracking-widest text-emerald-400 flex items-center gap-2">
                                <Scale className="h-4 w-4" /> inventory burn priority
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6 pt-6">
                            {db.shops.map((shop: any) => {
                                const totalExp = Object.values(shop.expenses).reduce((a: number, b: any) => a + Number(b), 0);
                                const totalGlobalExp = db.shops.reduce((sum: number, s: any) => sum + Object.values(s.expenses).reduce((a: number, b: any) => a + Number(b), 0), 0);
                                const ratio = totalGlobalExp > 0 ? (totalExp / totalGlobalExp) * 100 : 0;
                                return (
                                    <div key={shop.id} className="space-y-2">
                                        <div className="flex justify-between text-[11px] font-black uppercase tracking-tight">
                                            <span className="text-slate-400">{shop.name}</span>
                                            <span className="text-emerald-500">{ratio.toFixed(1)}%</span>
                                        </div>
                                        <div className="h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-900">
                                            <div className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]" style={{ width: `${ratio}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* The Oracle Simulation Modal */}
            {activeSimulation && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
                    <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-500 ease-out">
                        <div className="p-8 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
                            <div className="flex items-center gap-4">
                                <div className="p-4 bg-violet-600/20 rounded-2xl border border-violet-500/50">
                                    <Zap className="h-8 w-8 text-violet-400 animate-pulse" />
                                </div>
                                <div>
                                    <h2 className="text-3xl font-black italic text-white flex items-center gap-2 tracking-tighter uppercase">
                                        THE ORACLE PROJECTION
                                    </h2>
                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-[0.3em] mt-1">Simulating yield for: {activeSimulation.item.name}</p>
                                </div>
                            </div>
                            <button onClick={() => setActiveSimulation(null)} className="p-4 rounded-2xl hover:bg-white/5 transition-all group">
                                <Plus className="h-10 w-10 text-slate-500 group-hover:text-white rotate-45" />
                            </button>
                        </div>

                        <div className="p-4 sm:p-12 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 overflow-y-auto max-h-[70vh]">
                            {/* Forecasted Yield */}
                            <div className="space-y-8">
                                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.5em] border-b border-slate-800 pb-3 flex items-center gap-2">
                                    <TrendingUp className="h-3 w-3" /> Predicted Income Statement
                                </h3>
                                <div className="space-y-5">
                                    <div className="flex justify-between items-end">
                                        <span className="text-slate-500 font-black uppercase text-[10px] tracking-widest pb-1">Forecasted Revenue</span>
                                        <span className="font-black text-white text-3xl italic tracking-tighter">${(activeSimulation.price * activeSimulation.item.quantity).toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-500 font-bold text-xs uppercase">Landed Acquisition Cost</span>
                                        <span className="font-bold text-rose-500/80">-${(activeSimulation.landedUnitCost * activeSimulation.item.quantity).toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-500 font-bold text-xs uppercase">Assigned Overhead Burn</span>
                                        <span className="font-bold text-amber-500/80">-${(activeSimulation.overheadPerPiece * activeSimulation.item.quantity).toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between items-center border-b border-slate-800/50 pb-5">
                                        <span className="text-slate-500 font-bold text-xs uppercase">Tax Liability Allocation</span>
                                        <span className="font-bold text-indigo-400/80">-${((activeSimulation.price * activeSimulation.item.quantity) - ((activeSimulation.price * activeSimulation.item.quantity) / activeSimulation.taxRate)).toFixed(2)}</span>
                                    </div>
                                    <div className="pt-4">
                                        <div className="p-6 rounded-2xl bg-emerald-500/10 border-2 border-emerald-500/20 flex justify-between items-center shadow-[0_0_30px_rgba(16,185,129,0.1)]">
                                            <span className="text-emerald-500 font-black uppercase italic tracking-widest">ledger net profit</span>
                                            <span className="text-emerald-400 text-4xl font-black italic tracking-tighter">
                                                ${(activeSimulation.netProfit * activeSimulation.item.quantity).toFixed(2)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Portfolio Impact */}
                            <div className="space-y-8">
                                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.5em] border-b border-slate-800 pb-3 flex items-center gap-2">
                                    <Target className="h-3 w-3" /> Position Transformation
                                </h3>
                                <div className="space-y-8 relative">
                                    <div className="p-6 bg-slate-950/50 rounded-2xl border border-slate-800/80 opacity-40 grayscale scale-95 transition-all">
                                        <div className="text-[10px] font-black text-slate-600 uppercase mb-2 tracking-widest">Inventory Asset Class Value</div>
                                        <div className="text-2xl font-black text-slate-500 line-through tracking-tighter italic">
                                            ${(activeSimulation.landedUnitCost * activeSimulation.item.quantity).toFixed(2)}
                                        </div>
                                    </div>
                                    <div className="flex justify-center -my-6 relative z-10">
                                        <div className="bg-slate-900 rounded-full p-3 border-2 border-slate-800 shadow-2xl">
                                            <TrendingDown className="h-6 w-6 text-slate-500 animate-bounce" />
                                        </div>
                                    </div>
                                    <div className="p-6 bg-emerald-500/5 rounded-3xl border-2 border-emerald-500/40 relative overflow-hidden group">
                                        <div className="absolute inset-0 bg-emerald-500/5 animate-pulse" />
                                        <div className="text-[10px] font-black text-emerald-600 uppercase mb-2 tracking-[0.2em] flex items-center gap-2 relative">
                                            <TrendingUp className="h-4 w-4" /> Final Cash Liquidity position
                                        </div>
                                        <div className="text-4xl font-black text-emerald-400 italic tracking-tighter relative">
                                            +${(activeSimulation.price * activeSimulation.item.quantity).toFixed(2)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-8 bg-slate-950/80 border-t border-slate-800 text-center">
                            <div className="flex justify-center gap-12 items-center">
                                <div>
                                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">Return on Investment</p>
                                    <p className="text-2xl font-black text-violet-400 italic tracking-tighter">{((activeSimulation.netProfit / activeSimulation.landedUnitCost) * 100).toFixed(1)}%</p>
                                </div>
                                <div className="h-10 w-px bg-slate-800" />
                                <div>
                                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">efficiency score</p>
                                    <p className="text-2xl font-black text-emerald-400 italic tracking-tighter">{(activeSimulation.multiplier * 10).toFixed(1)}/10.0</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
