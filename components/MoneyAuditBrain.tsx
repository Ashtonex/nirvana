"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@/components/ui";
import { 
  Brain, AlertTriangle, TrendingUp, TrendingDown, DollarSign, RefreshCw,
  ChevronDown, ChevronUp, Loader2, Scale, Target, Lightbulb, Calculator,
  PiggyBank, Landmark, Clock, CheckCircle, XCircle, MessageSquare, BookOpen,
  Plus, Trash2, Edit, Save, X, MapPin, Users, LineChart,
  ArrowRight, Sparkles, GraduationCap, BarChart3, ArrowDownLeft, ArrowUpRight,
  HelpCircle, Zap, Eye, EyeOff, ArrowLeftRight
} from "lucide-react";
import { cn } from "@/components/ui";

type Props = {
  shops: { id: string; name: string }[];
};

type BrainRule = {
  id: string;
  rule_type: string;
  match_pattern: string;
  match_field: string;
  action: string;
  action_value?: string;
  category?: string;
  priority: number;
  is_active: boolean;
  times_triggered: number;
  notes?: string;
  created_at: string;
};

type ExpansionNode = {
  id: string;
  node_name: string;
  location?: string;
  location_type: string;
  status: string;
  rent_budget: number;
  employees_planned: number;
  avg_salary: number;
  initial_investment: number;
  projected_revenue: number;
  monthly_overhead: number;
  break_even_months?: number;
  feasibility_score?: number;
  risk_level: string;
  notes?: string;
  created_at: string;
};

type ExpenseExample = {
  id: string;
  source: string;
  title: string;
  amount: number;
  classification: string;
  isFiltered: boolean;
};

export function MoneyAuditBrain({ shops }: Props) {
  const [auditData, setAuditData] = useState<any>(null);
  const [realExpenseData, setRealExpenseData] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    overview: true,
    health: false,
    findings: true,
    recommendations: true,
    insights: false,
    tax: false,
    forecast: false,
    expenses: true,
    learn: false,
    expand: false
  });
  const [auditCycle, setAuditCycle] = useState(0);
  const [typingLines, setTypingLines] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "expenses" | "learn" | "expand">("overview");
  
  const [rules, setRules] = useState<BrainRule[]>([]);
  const [expansions, setExpansions] = useState<ExpansionNode[]>([]);
  const [newRule, setNewRule] = useState({ pattern: "", action: "classify", category: "", type: "expense_filter" });
  const [newExpansion, setNewExpansion] = useState({
    name: "", location: "", rent: 0, employees: 0, avgSalary: 0, investment: 0, revenue: 0
  });
  const [showAddRule, setShowAddRule] = useState(false);
  const [showAddExpansion, setShowAddExpansion] = useState(false);
  
  const [teachMode, setTeachMode] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseExample | null>(null);
  const [expenseExamples, setExpenseExamples] = useState<ExpenseExample[]>([]);
  const [patternSuggestions, setPatternSuggestions] = useState<string[]>([]);
  const [showBusinessFlow, setShowBusinessFlow] = useState(true);

  const runAudit = useCallback(async () => {
    setIsRunning(true);
    setTypingLines([]);
    
    const typingSteps = [
      "Initializing financial intelligence protocols...",
      "Analyzing sales patterns and revenue streams...",
      "Scanning POS and Operations ledgers...",
      "Evaluating inventory efficiency and dead stock...",
      "Calculating overhead contributions...",
      "Computing financial health score...",
      "Filtering internal transfers from real expenses...",
      "Building cash flow forecast models...",
      "Identifying optimization opportunities...",
      "Cross-referencing historical patterns...",
      "Audit complete. Reviewing results..."
    ];
    
    for (let i = 0; i < typingSteps.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 200));
      setTypingLines(prev => [...prev, typingSteps[i]]);
    }
    
    try {
      const [auditRes, expenseRes] = await Promise.all([
        fetch('/api/audit/financial-intelligence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ daysBack: 30 })
        }),
        fetch('/api/brain/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ daysBack: 30 })
        })
      ]);
      
      if (auditRes.ok && expenseRes.ok) {
        const audit = await auditRes.json();
        const expenses = await expenseRes.json();
        setAuditData(audit);
        setRealExpenseData(expenses);
        setAuditCycle(c => c + 1);
      }
    } catch (error) {
      console.error('Financial audit failed:', error);
    } finally {
      setIsRunning(false);
    }
  }, []);

  const loadBrainData = useCallback(async () => {
    try {
      const [rulesRes, expansionsRes, teachRes] = await Promise.all([
        fetch('/api/brain/rules'),
        fetch('/api/brain/expansion'),
        teachMode ? fetch('/api/brain/examples') : Promise.resolve({ ok: true, json: () => ({ examples: [] }) })
      ]);
      if (rulesRes.ok) {
        const data = await rulesRes.json();
        setRules(data.rules || []);
      }
      if (expansionsRes.ok) {
        const data = await expansionsRes.json();
        setExpansions(data.expansions || []);
      }
      if (teachRes.ok) {
        const data = await teachRes.json();
        setExpenseExamples(data.examples || []);
        setPatternSuggestions(data.suggestions || []);
      }
    } catch (e) {
      console.error('Failed to load brain data:', e);
    }
  }, [teachMode]);

  const loadTeachData = useCallback(async () => {
    try {
      const res = await fetch('/api/brain/examples');
      if (res.ok) {
        const data = await res.json();
        setExpenseExamples(data.examples || []);
        setPatternSuggestions(data.suggestions || []);
      }
    } catch (e) {
      console.error('Failed to load teach data:', e);
    }
  }, []);

  const selectExpenseForTeaching = (expense: ExpenseExample) => {
    setSelectedExpense(expense);
    setNewRule({ 
      pattern: expense.title.toLowerCase().split(' ').slice(0, 3).join(' '),
      action: expense.isFiltered ? 'filter' : expense.classification,
      category: expense.classification,
      type: 'expense_filter'
    });
  };

  const applyTeachingFromExample = async () => {
    if (!selectedExpense || !newRule.pattern) return;
    await saveRule();
    setSelectedExpense(null);
    loadTeachData();
  };

  useEffect(() => {
    if (!auditData) {
      runAudit();
    }
    loadBrainData();
    if (teachMode) {
      loadTeachData();
    }
  }, [teachMode]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const saveRule = async () => {
    if (!newRule.pattern) return;
    try {
      const res = await fetch('/api/brain/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rule_type: newRule.type,
          match_pattern: newRule.pattern,
          match_field: 'title',
          action: newRule.action,
          action_value: newRule.action,
          category: newRule.category,
          priority: 50
        })
      });
      const result = await res.json();
      if (!res.ok) {
        console.error('Failed to save rule:', result);
        alert(`Unable to save rule: ${result.error || 'unknown error'}`);
        return;
      }
      setShowAddRule(false);
      setNewRule({ pattern: "", action: "classify", category: "", type: "expense_filter" });
      loadBrainData();
    } catch (e) {
      console.error('Failed to save rule:', e);
      alert('Unable to save rule: network or server error. Check console for details.');
    }
  };

  const deleteRule = async (id: string) => {
    if (!confirm("Delete this rule?")) return;
    try {
      const res = await fetch(`/api/brain/rules?id=${id}`, { method: 'DELETE' });
      if (res.ok) loadBrainData();
    } catch (e) {
      console.error('Failed to delete rule:', e);
    }
  };

  const saveExpansion = async () => {
    if (!newExpansion.name) return;
    try {
      const res = await fetch('/api/brain/expansion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          node_name: newExpansion.name,
          location: newExpansion.location,
          location_type: 'new_location',
          rent_budget: newExpansion.rent,
          employees_planned: newExpansion.employees,
          avg_salary: newExpansion.avgSalary,
          initial_investment: newExpansion.investment,
          projected_revenue: newExpansion.revenue
        })
      });
      if (res.ok) {
        setShowAddExpansion(false);
        setNewExpansion({ name: "", location: "", rent: 0, employees: 0, avgSalary: 0, investment: 0, revenue: 0 });
        loadBrainData();
      }
    } catch (e) {
      console.error('Failed to save expansion:', e);
    }
  };

  const updateExpansionStatus = async (id: string, status: string) => {
    try {
      const res = await fetch('/api/brain/expansion', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status })
      });
      if (res.ok) loadBrainData();
    } catch (e) {
      console.error('Failed to update expansion:', e);
    }
  };

  if (!auditData && (isRunning || typingLines.length > 0)) {
    return (
      <Card className="bg-gradient-to-br from-indigo-950/60 via-slate-950 to-violet-950/40 border-indigo-500/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
            <Brain className="h-5 w-5 text-indigo-400 animate-pulse" />
            Financial Intelligence Brain
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-mono text-xs text-emerald-400/90 space-y-1 min-h-[300px] bg-slate-950/50 rounded-lg p-4 border border-slate-800">
            {typingLines.map((line, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-slate-600">{'>'}</span>
                <span className={line.startsWith('Audit') ? 'text-emerald-400' : 'text-slate-400'}>{line}</span>
              </div>
            ))}
            {isRunning && <span className="animate-pulse text-indigo-400">▋</span>}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!auditData) {
    return (
      <Card className="bg-gradient-to-br from-indigo-950/60 via-slate-950 to-violet-950/40 border-indigo-500/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
            <Brain className="h-5 w-5 text-indigo-400" />
            Financial Intelligence Brain
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <p className="text-slate-400 text-sm mb-4">Run deep financial analysis to understand your business</p>
          <Button onClick={runAudit} disabled={isRunning} className="bg-indigo-600 hover:bg-indigo-500">
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Brain className="h-4 w-4 mr-2" />}
            Run Intelligence Audit
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { audit, healthScore, recommendations, learningInsights, taxOptimizations } = auditData;
  const criticalCount = audit.findings.filter((f: any) => f.severity === 'critical').length;
  const warningCount = audit.findings.filter((f: any) => f.severity === 'warning').length;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Brain },
    { id: 'expenses', label: 'Expenses', icon: DollarSign },
    { id: 'learn', label: 'Learn', icon: GraduationCap },
    { id: 'expand', label: 'Expand', icon: MapPin }
  ] as const;

  return (
    <div className="space-y-4">
      {/* Header with Tabs */}
      <Card className="bg-gradient-to-br from-indigo-950/60 via-slate-950 to-violet-950/40 border-indigo-500/30">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
              <Brain className="h-5 w-5 text-indigo-400 animate-pulse" />
              Financial Intelligence Brain
              {auditCycle > 0 && <Badge className="bg-indigo-500/20 text-indigo-400 ml-2">Cycle {auditCycle}</Badge>}
            </CardTitle>
            <Button onClick={runAudit} disabled={isRunning} size="sm" className="bg-indigo-600 hover:bg-indigo-500">
              {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
          <CardDescription className="text-[10px] font-bold uppercase">
            Period: {audit.period.start} to {audit.period.end}
          </CardDescription>
          
          {/* Tabs */}
          <div className="flex gap-1 mt-2">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1 px-3 py-1 text-xs font-black uppercase italic rounded-t-lg transition-colors",
                  activeTab === tab.id 
                    ? "bg-indigo-500/20 text-indigo-400 border-b-2 border-indigo-400" 
                    : "text-slate-500 hover:text-slate-300"
                )}
              >
                <tab.icon className="h-3 w-3" />
                {tab.label}
              </button>
            ))}
          </div>
        </CardHeader>
      </Card>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <>
          <CardContent className="space-y-4">
            {/* Financial Health Score Grid */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <div className={cn(
                "rounded-xl p-4 text-center border-2",
                healthScore.overall >= 70 ? "bg-emerald-950/40 border-emerald-500/50" :
                healthScore.overall >= 40 ? "bg-amber-950/40 border-amber-500/50" :
                "bg-rose-950/40 border-rose-500/50"
              )}>
                <div className="text-[10px] font-black uppercase text-slate-400 mb-1">Overall Score</div>
                <div className="text-3xl font-black">{healthScore.overall}</div>
                <div className="text-[10px] text-slate-500">/100</div>
              </div>
              <div className="bg-sky-950/30 rounded-xl p-4 text-center border border-sky-900/50">
                <div className="text-[10px] font-black uppercase text-sky-400 mb-1">Liquidity</div>
                <div className="text-2xl font-black text-sky-400">{healthScore.liquidity}</div>
              </div>
              <div className="bg-emerald-950/30 rounded-xl p-4 text-center border border-emerald-900/50">
                <div className="text-[10px] font-black uppercase text-emerald-400 mb-1">Profitability</div>
                <div className="text-2xl font-black text-emerald-400">{healthScore.profitability}</div>
              </div>
              <div className="bg-violet-950/30 rounded-xl p-4 text-center border border-violet-900/50">
                <div className="text-[10px] font-black uppercase text-violet-400 mb-1">Efficiency</div>
                <div className="text-2xl font-black text-violet-400">{healthScore.efficiency}</div>
              </div>
              <div className="bg-amber-950/30 rounded-xl p-4 text-center border border-amber-900/50">
                <div className="text-[10px] font-black uppercase text-amber-400 mb-1">Growth</div>
                <div className="text-2xl font-black text-amber-400">{healthScore.growth}</div>
              </div>
              <div className="bg-rose-950/30 rounded-xl p-4 text-center border border-rose-900/50">
                <div className="text-[10px] font-black uppercase text-rose-400 mb-1">Tax Compliance</div>
                <div className="text-2xl font-black text-rose-400">{healthScore.taxCompliance}</div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-emerald-950/20 rounded-lg p-3 border border-emerald-900/30">
                <div className="text-[10px] font-black uppercase text-emerald-500">Total Sales</div>
                <div className="text-xl font-black text-emerald-400">${audit.summary.totalSales.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              </div>
              <div className="bg-rose-950/20 rounded-lg p-3 border border-rose-900/30">
                <div className="text-[10px] font-black uppercase text-rose-500">Total Expenses</div>
                <div className="text-xl font-black text-rose-400">${audit.summary.totalExpenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              </div>
              <div className={cn(
                "rounded-lg p-3 border",
                audit.summary.netFlow >= 0 ? "bg-emerald-950/20 border-emerald-900/30" : "bg-rose-950/20 border-rose-900/30"
              )}>
                <div className="text-[10px] font-black uppercase">Net Flow</div>
                <div className={cn("text-xl font-black", audit.summary.netFlow >= 0 ? "text-emerald-400" : "text-rose-400")}>
                  {audit.summary.netFlow >= 0 ? '+' : ''}${audit.summary.netFlow.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
              <div className={cn(
                "rounded-lg p-3 border",
                audit.summary.vaultDrift === 0 ? "bg-emerald-950/20 border-emerald-900/30" : "bg-amber-950/20 border-amber-900/30"
              )}>
                <div className="text-[10px] font-black uppercase text-amber-500">Vault Status</div>
                <div className={cn("text-xl font-black", audit.summary.vaultDrift === 0 ? "text-emerald-400" : "text-amber-400")}>
                  {audit.summary.vaultDrift === 0 ? 'BALANCED' : `$${Math.abs(audit.summary.vaultDrift).toFixed(0)} Drift`}
                </div>
              </div>
            </div>

            {/* Capital at Risk Warning */}
            {audit.summary.missingMoney && audit.summary.missingMoney > 100 && (
              <div className="bg-gradient-to-r from-rose-950/50 to-amber-950/50 rounded-lg p-4 border border-rose-500/30">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-5 w-5 text-rose-400 animate-pulse" />
                  <span className="text-lg font-black text-rose-400">CAPITAL AT RISK</span>
                </div>
                <div className="text-3xl font-black text-white font-mono mb-1">
                  ${audit.summary.missingMoney.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <p className="text-xs text-slate-400">Vault drift + Dead stock value requiring immediate attention</p>
              </div>
            )}
          </CardContent>

          {/* Recommendations Section */}
          {recommendations.length > 0 && (
            <Card className="bg-slate-950/60 border-emerald-500/20">
              <CardHeader 
                className="pb-2 cursor-pointer hover:bg-slate-900/30 transition-colors"
                onClick={() => toggleSection('recommendations')}
              >
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-emerald-400" />
                    Money Recommendations ({recommendations.length})
                  </CardTitle>
                  {expandedSections.recommendations ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </CardHeader>
              {expandedSections.recommendations && (
                <CardContent className="space-y-3">
                  {recommendations.map((rec: any) => (
                    <div key={rec.id} className={cn(
                      "rounded-lg border p-4",
                      rec.priority === 'urgent' ? "bg-rose-950/20 border-rose-500/50" :
                      rec.priority === 'high' ? "bg-amber-950/20 border-amber-500/50" :
                      rec.priority === 'medium' ? "bg-sky-950/20 border-sky-500/50" :
                      "bg-slate-900/40 border-slate-700"
                    )}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={cn(
                              "text-[8px]",
                              rec.priority === 'urgent' ? "bg-rose-500/30 text-rose-400" :
                              rec.priority === 'high' ? "bg-amber-500/30 text-amber-400" :
                              rec.priority === 'medium' ? "bg-sky-500/30 text-sky-400" :
                              "bg-slate-700 text-slate-300"
                            )}>{rec.priority.toUpperCase()}</Badge>
                            <Badge className={cn(
                              "text-[8px]",
                              rec.type === 'investment' ? "bg-emerald-500/30 text-emerald-400" :
                              rec.type === 'growth' ? "bg-violet-500/30 text-violet-400" :
                              rec.type === 'savings' ? "bg-amber-500/30 text-amber-400" :
                              "bg-slate-700 text-slate-300"
                            )}>{rec.type}</Badge>
                            <span className="text-xs font-mono text-white">${rec.potentialImpact.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                          </div>
                          <h4 className="font-black text-white text-sm">{rec.title}</h4>
                          <p className="text-xs text-slate-400 mt-1">{rec.description}</p>
                          <div className="mt-2 space-y-1">
                            <p className="text-[10px] font-black text-slate-500 uppercase">Action Steps:</p>
                            {rec.actionSteps.map((step: string, i: number) => (
                              <div key={i} className="flex items-center gap-2 text-xs text-slate-300">
                                <span className="text-emerald-400">{i + 1}.</span> {step}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          )}

          {/* Findings Section */}
          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader 
              className="pb-2 cursor-pointer hover:bg-slate-900/30 transition-colors"
              onClick={() => toggleSection('findings')}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
                  <AlertTriangle className={cn("h-4 w-4", criticalCount > 0 ? "text-rose-400" : warningCount > 0 ? "text-amber-400" : "text-emerald-400")} />
                  Audit Findings ({audit.findings.length})
                  {criticalCount > 0 && <Badge className="bg-rose-500/20 text-rose-400">{criticalCount} Critical</Badge>}
                  {warningCount > 0 && <Badge className="bg-amber-500/20 text-amber-400">{warningCount} Warning</Badge>}
                </CardTitle>
                {expandedSections.findings ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </CardHeader>
            {expandedSections.findings && (
              <CardContent className="space-y-3">
                {audit.findings.length === 0 ? (
                  <div className="text-center py-6 text-emerald-400">
                    <CheckCircle className="h-8 w-8 mx-auto mb-2" />
                    <p className="font-black">ALL CLEAR</p>
                    <p className="text-xs text-slate-500">No discrepancies found</p>
                  </div>
                ) : (
                  audit.findings.map((finding: any) => (
                    <div key={finding.id} className={cn(
                      "rounded-lg border p-4",
                      finding.severity === 'critical' ? "bg-rose-950/20 border-rose-900/50" :
                      finding.severity === 'warning' ? "bg-amber-950/20 border-amber-900/50" :
                      "bg-sky-950/20 border-sky-900/50"
                    )}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={cn(
                              "text-[8px]",
                              finding.severity === 'critical' ? "bg-rose-500/30 text-rose-400" :
                              finding.severity === 'warning' ? "bg-amber-500/30 text-amber-400" :
                              "bg-sky-500/30 text-sky-400"
                            )}>{finding.severity.toUpperCase()}</Badge>
                            <Badge className="bg-slate-800 text-slate-400 text-[8px]">{finding.category}</Badge>
                            {finding.amount && <span className="text-sm font-mono text-white">${finding.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>}
                          </div>
                          <h4 className="font-black text-white text-sm">{finding.title}</h4>
                          <p className="text-xs text-slate-400 mt-1">{finding.description}</p>
                          <p className="text-xs text-emerald-400/80 mt-2 italic">{finding.recommendation}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            )}
          </Card>

          {/* Learning Insights */}
          {learningInsights.length > 0 && (
            <Card className="bg-slate-950/60 border-violet-500/20">
              <CardHeader 
                className="pb-2 cursor-pointer hover:bg-slate-900/30 transition-colors"
                onClick={() => toggleSection('insights')}
              >
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
                    <Brain className="h-4 w-4 text-violet-400" />
                    Learned Patterns & Predictions
                  </CardTitle>
                  {expandedSections.insights ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </CardHeader>
              {expandedSections.insights && (
                <CardContent className="space-y-3">
                  {learningInsights.map((insight: any, i: number) => (
                    <div key={i} className="bg-violet-950/20 rounded-lg p-4 border border-violet-900/50">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-black text-violet-300 text-sm">{insight.pattern}</h4>
                        <Badge className={cn(
                          "text-[8px]",
                          insight.trend === 'improving' ? "bg-emerald-500/30 text-emerald-400" :
                          insight.trend === 'declining' ? "bg-rose-500/30 text-rose-400" :
                          "bg-slate-700 text-slate-300"
                        )}>
                          {insight.trend === 'improving' ? 'IMPROVING' : insight.trend === 'declining' ? 'DECLINING' : 'STABLE'}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-300">{insight.prediction}</p>
                      <div className="flex items-center gap-4 mt-2 text-[10px] text-slate-500">
                        <span>Confidence: {(insight.confidence * 100).toFixed(0)}%</span>
                        <span>Historical Avg: ${insight.historicalData.toFixed(2)}/day</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          )}

          {/* Difficult Questions */}
          {audit.difficultQuestions.length > 0 && (
            <Card className="bg-gradient-to-br from-rose-950/30 to-slate-950 border-rose-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-rose-400" />
                  Difficult Questions ({audit.difficultQuestions.length})
                </CardTitle>
                <CardDescription className="text-[10px]">Questions that need answers for business health</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {audit.difficultQuestions.map((q: any, i: number) => (
                  <div key={i} className={cn(
                    "rounded-lg border p-3",
                    q.severity === 'high' ? "bg-rose-950/20 border-rose-900/50" :
                    q.severity === 'medium' ? "bg-amber-950/20 border-amber-900/50" :
                    "bg-slate-900/40 border-slate-800"
                  )}>
                    <h4 className={cn(
                      "font-black text-sm",
                      q.severity === 'high' ? "text-rose-300" :
                      q.severity === 'medium' ? "text-amber-300" :
                      "text-slate-300"
                    )}>
                      {q.question}
                    </h4>
                    <p className="text-[10px] text-slate-500 mt-1">{q.context}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Expenses Tab */}
      {activeTab === 'expenses' && realExpenseData && (
        <Card className="bg-slate-950/60 border-slate-800">
          <CardHeader>
            <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-emerald-400" />
              Expense Intelligence
              <Badge className="bg-emerald-500/20 text-emerald-400 ml-2">{rules.length} Rules Active</Badge>
            </CardTitle>
            <CardDescription className="text-[10px]">
              Smart filtering: separates internal transfers, personal, and TRUE business expenses
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* What was Filtered vs What Remains */}
            <div className="bg-slate-900/40 rounded-lg p-4 border border-slate-800">
              <h4 className="text-xs font-black uppercase text-slate-400 mb-3">What's Being Filtered Out</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
                  <div className="text-[10px] font-black uppercase text-slate-400">Internal Transfers</div>
                  <div className="text-xl font-black text-slate-400">${realExpenseData.internalTransfers?.toFixed(2) || "0.00"}</div>
                  <div className="text-[10px] text-slate-500 mt-1">Invest/Savings/Perfume deposits</div>
                </div>
                <div className="bg-rose-950/30 rounded-lg p-3 border border-rose-900/50">
                  <div className="text-[10px] font-black uppercase text-rose-400">Personal/Household</div>
                  <div className="text-xl font-black text-rose-400">${realExpenseData.personalExpenses?.toFixed(2) || "0.00"}</div>
                  <div className="text-[10px] text-rose-400/70 mt-1">Groceries for home, personal</div>
                </div>
                <div className="bg-emerald-950/30 rounded-lg p-3 border border-emerald-900/50">
                  <div className="text-[10px] font-black uppercase text-emerald-500">Real Business Expenses</div>
                  <div className="text-2xl font-black text-emerald-400">${realExpenseData.realBusinessExpenses?.toFixed(2) || "0.00"}</div>
                </div>
              </div>
            </div>

            {/* Business Expense Breakdown */}
            <div>
              <h4 className="text-xs font-black uppercase text-emerald-400 mb-3">Business Expense Breakdown</h4>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-sky-950/30 rounded-lg p-3 border border-sky-900/50">
                  <div className="text-[10px] font-black uppercase text-sky-400">Overhead</div>
                  <div className="text-lg font-black text-sky-300">${realExpenseData.overheadExpenses?.toFixed(2) || "0.00"}</div>
                  <div className="text-[10px] text-sky-400/70">Rent, utilities, salaries</div>
                </div>
                <div className="bg-violet-950/30 rounded-lg p-3 border border-violet-900/50">
                  <div className="text-[10px] font-black uppercase text-violet-400">Stock</div>
                  <div className="text-lg font-black text-violet-300">${realExpenseData.stockExpenses?.toFixed(2) || "0.00"}</div>
                  <div className="text-[10px] text-violet-400/70">Inventory, purchases</div>
                </div>
                <div className="bg-amber-950/30 rounded-lg p-3 border border-amber-900/50">
                  <div className="text-[10px] font-black uppercase text-amber-400">Transport</div>
                  <div className="text-lg font-black text-amber-300">${realExpenseData.transportExpenses?.toFixed(2) || "0.00"}</div>
                  <div className="text-[10px] text-amber-400/70">Fuel, transport</div>
                </div>
                <div className="bg-rose-950/30 rounded-lg p-3 border border-rose-900/50">
                  <div className="text-[10px] font-black uppercase text-rose-400">Groceries</div>
                  <div className="text-lg font-black text-rose-300">${realExpenseData.groceryExpenses?.toFixed(2) || "0.00"}</div>
                  <div className="text-[10px] text-rose-400/70">Groceries from POS</div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
                  <div className="text-[10px] font-black uppercase text-slate-400">Operational</div>
                  <div className="text-lg font-black text-slate-300">${realExpenseData.operationalExpenses?.toFixed(2) || "0.00"}</div>
                  <div className="text-[10px] text-slate-400/70">Airtime, data, misc</div>
                </div>
              </div>
            </div>

            {/* Expense Breakdown by Type */}
            {realExpenseData.expenseBreakdown && Object.keys(realExpenseData.expenseBreakdown).length > 0 && (
              <div className="bg-slate-900/40 rounded-lg p-4 border border-slate-800">
                <h4 className="text-xs font-black uppercase text-slate-400 mb-3">Detailed Breakdown</h4>
                <div className="space-y-2">
                  {Object.entries(realExpenseData.expenseBreakdown).map(([type, data]: [string, any]) => (
                    <div key={type} className="flex items-center justify-between p-2 bg-slate-800/50 rounded">
                      <div className="flex items-center gap-3">
                        <Badge className={cn(
                          "text-[8px]",
                          type === 'overhead' ? "bg-sky-500/30 text-sky-400" :
                          type === 'stock' ? "bg-violet-500/30 text-violet-400" :
                          type === 'transport' ? "bg-amber-500/30 text-amber-400" :
                          type === 'groceries' ? "bg-rose-500/30 text-rose-400" :
                          type === 'operational' ? "bg-emerald-500/30 text-emerald-400" :
                          "bg-slate-600 text-slate-300"
                        )}>{type}</Badge>
                        <span className="text-xs text-slate-400">{data.count} items</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-mono text-white">${data.total.toFixed(2)}</span>
                        <span className="text-[10px] text-slate-500 ml-2">avg ${data.avg.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Oracle Insights */}
            {realExpenseData.oracleInsights && realExpenseData.oracleInsights.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-black uppercase text-indigo-400 flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  Oracle Insights
                </h4>
                {realExpenseData.oracleInsights.map((insight: any, i: number) => (
                  <div key={i} className={cn(
                    "rounded-lg p-3 border",
                    insight.includes("Warning") ? "bg-rose-950/20 border-rose-900/50" :
                    insight.includes("Healthy") ? "bg-emerald-950/20 border-emerald-900/50" :
                    "bg-slate-900/40 border-slate-800"
                  )}>
                    <p className="text-xs text-slate-300">{insight}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Anomaly Alerts */}
            {realExpenseData.anomalyAlerts && realExpenseData.anomalyAlerts.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-black uppercase text-amber-400 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Alerts ({realExpenseData.anomalyAlerts.length})
                </h4>
                {realExpenseData.anomalyAlerts.map((alert: any, i: number) => (
                  <div key={i} className={cn(
                    "rounded-lg p-3 border",
                    alert.severity === 'warning' ? "bg-amber-950/20 border-amber-900/50" :
                    "bg-slate-900/40 border-slate-800"
                  )}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-black text-white">{alert.title}</p>
                        <p className="text-[10px] text-slate-400 mt-1">{alert.message}</p>
                      </div>
                      {alert.total && (
                        <span className="text-lg font-black text-amber-400">${alert.total.toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Learn Tab */}
      {activeTab === 'learn' && (
        <div className="space-y-4">
          {/* Business Flow Understanding */}
          <Card className="bg-gradient-to-br from-indigo-950/40 to-slate-950 border-indigo-500/30">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
                  <Zap className="h-4 w-4 text-indigo-400" />
                  How Your Business Money Flows
                </CardTitle>
                <Button size="sm" variant="ghost" onClick={() => setShowBusinessFlow(!showBusinessFlow)}>
                  {showBusinessFlow ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </CardHeader>
            {showBusinessFlow && (
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-emerald-950/30 rounded-lg p-4 border border-emerald-900/50">
                    <div className="flex items-center gap-2 mb-2">
                      <ArrowDownLeft className="h-4 w-4 text-emerald-400" />
                      <span className="text-xs font-black uppercase text-emerald-400">POS Sales</span>
                    </div>
                    <p className="text-[10px] text-slate-400">Daily sales come in from all shops. This is your revenue source.</p>
                  </div>
                  <div className="bg-amber-950/30 rounded-lg p-4 border border-amber-900/50">
                    <div className="flex items-center gap-2 mb-2">
                      <ArrowLeftRight className="h-4 w-4 text-amber-400" />
                      <span className="text-xs font-black uppercase text-amber-400">Internal Transfers</span>
                    </div>
                    <p className="text-[10px] text-slate-400">POS → Invest/Savings/EOD/Blackbox. This is NOT an expense - money just moved.</p>
                  </div>
                  <div className="bg-sky-950/30 rounded-lg p-4 border border-sky-900/50">
                    <div className="flex items-center gap-2 mb-2">
                      <ArrowUpRight className="h-4 w-4 text-sky-400" />
                      <span className="text-xs font-black uppercase text-sky-400">Operations</span>
                    </div>
                    <p className="text-[10px] text-slate-400">Central hub where rent, utilities, salaries are paid from. TRUE overhead lives here.</p>
                  </div>
                </div>
                <div className="mt-4 p-3 bg-slate-900/40 rounded-lg border border-slate-800">
                  <p className="text-[10px] font-black text-slate-300 mb-2">KEY DISTINCTION:</p>
                  <div className="grid grid-cols-2 gap-4 text-[10px]">
                    <div className="text-emerald-400">✓ Real Expense: Rent paid from Operations, Stock purchased, Transport costs</div>
                    <div className="text-slate-500">✗ Internal: POS deposits to Invest, EOD cash to Savings</div>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Teach from Examples */}
          <Card className="bg-slate-950/60 border-violet-500/20">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-violet-400" />
                    Teach from Examples
                  </CardTitle>
                  <CardDescription className="text-[10px]">
                    Click any expense below to teach the brain how to classify it
                  </CardDescription>
                </div>
                <Button 
                  size="sm" 
                  onClick={() => {
                    setTeachMode(!teachMode);
                    if (!teachMode) loadTeachData();
                  }}
                  className={cn(
                    "bg-violet-600 hover:bg-violet-500",
                    teachMode && "bg-rose-600 hover:bg-rose-500"
                  )}
                >
                  {teachMode ? <X className="h-4 w-4 mr-1" /> : <GraduationCap className="h-4 w-4 mr-1" />}
                  {teachMode ? "Exit Teach Mode" : "Start Teaching"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Pattern Suggestions */}
              {patternSuggestions.length > 0 && !selectedExpense && (
                <div className="bg-indigo-950/30 rounded-lg p-3 border border-indigo-900/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-4 w-4 text-indigo-400" />
                    <span className="text-xs font-black uppercase text-indigo-400">Brain Suggestions</span>
                  </div>
                  <div className="space-y-1">
                    {patternSuggestions.map((suggestion, i) => (
                      <p key={i} className="text-[10px] text-slate-300">{suggestion}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Selected Expense for Teaching */}
              {selectedExpense && (
                <div className="bg-violet-950/30 rounded-lg p-4 border border-violet-900/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <HelpCircle className="h-4 w-4 text-violet-400" />
                      <span className="text-sm font-black text-violet-300">Teaching: "{selectedExpense.title}"</span>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedExpense(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="bg-slate-900/60 rounded p-3 border border-slate-800">
                    <div className="text-[10px] text-slate-500 mb-1">Current classification: <span className={cn(
                      "font-black",
                      selectedExpense.isFiltered ? "text-amber-400" : "text-emerald-400"
                    )}>{selectedExpense.isFiltered ? "INTERNAL TRANSFER (filtered)" : selectedExpense.classification}</span></div>
                    <div className="text-lg font-black text-white">${selectedExpense.amount.toFixed(2)}</div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400">Pattern to Match</label>
                      <Input
                        value={newRule.pattern}
                        onChange={(e) => setNewRule({...newRule, pattern: e.target.value})}
                        placeholder="e.g. groceries for home"
                        className="border-violet-900/50"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400">Classify As</label>
                      <select
                        value={newRule.action}
                        onChange={(e) => setNewRule({...newRule, action: e.target.value})}
                        className="w-full bg-slate-900 border border-slate-800 text-white px-3 py-2 rounded-md"
                      >
                        <option value="personal">Personal/Household</option>
                        <option value="overhead">Overhead (Rent/Utilities)</option>
                        <option value="stock">Stock/Inventory</option>
                        <option value="filter">Internal Transfer (Filter)</option>
                        <option value="operational">Operational Expense</option>
                        <option value="classify">Custom Category</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400">Custom Category</label>
                      <Input
                        value={newRule.category}
                        onChange={(e) => setNewRule({...newRule, category: e.target.value})}
                        placeholder="optional"
                        className="border-violet-900/50"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={applyTeachingFromExample} className="bg-emerald-600 hover:bg-emerald-500">
                      <Save className="h-4 w-4 mr-1" />
                      Teach This Rule
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedExpense(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* Expense Examples List */}
              {teachMode && (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                    <div className="bg-slate-900/60 rounded-lg p-2 border border-slate-800 text-center">
                      <div className="text-lg font-black text-white">{expenseExamples.length}</div>
                      <div className="text-[8px] text-slate-500 uppercase">Total</div>
                    </div>
                    <div className="bg-amber-950/30 rounded-lg p-2 border border-amber-900/50 text-center">
                      <div className="text-lg font-black text-amber-400">{expenseExamples.filter(e => e.isFiltered).length}</div>
                      <div className="text-[8px] text-amber-500 uppercase">Filtered</div>
                    </div>
                    <div className="bg-rose-950/30 rounded-lg p-2 border border-rose-900/50 text-center">
                      <div className="text-lg font-black text-rose-400">{expenseExamples.filter(e => e.classification === 'personal').length}</div>
                      <div className="text-[8px] text-rose-500 uppercase">Personal</div>
                    </div>
                    <div className="bg-emerald-950/30 rounded-lg p-2 border border-emerald-900/50 text-center">
                      <div className="text-lg font-black text-emerald-400">{expenseExamples.filter(e => e.classification === 'other').length}</div>
                      <div className="text-[8px] text-emerald-500 uppercase">Unclassified</div>
                    </div>
                  </div>
                  {expenseExamples.slice(0, 30).map(expense => (
                    <button
                      key={expense.id}
                      onClick={() => selectExpenseForTeaching(expense)}
                      className={cn(
                        "w-full flex items-center justify-between p-3 rounded-lg border transition-all hover:scale-[1.01]",
                        expense.isFiltered ? "bg-slate-900/40 border-slate-800/50 hover:border-amber-500/50" :
                        expense.classification === 'personal' ? "bg-rose-950/20 border-rose-900/50 hover:border-rose-500/50" :
                        "bg-slate-900/60 border-slate-800 hover:border-violet-500/50"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Badge className={cn(
                          "text-[8px]",
                          expense.isFiltered ? "bg-amber-500/30 text-amber-400" :
                          expense.classification === 'personal' ? "bg-rose-500/30 text-rose-400" :
                          expense.classification === 'other' ? "bg-violet-500/30 text-violet-400" :
                          "bg-emerald-500/30 text-emerald-400"
                        )}>
                          {expense.isFiltered ? "FILTERED" : expense.classification.toUpperCase()}
                        </Badge>
                        <span className="text-xs text-white truncate max-w-[200px]">{expense.title}</span>
                      </div>
                      <span className="text-sm font-black text-white ml-2">${expense.amount.toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              )}

              {!teachMode && !selectedExpense && (
                <div className="text-center py-8 text-slate-500">
                  <GraduationCap className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Click "Start Teaching" to see examples and teach the brain</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Manual Rule Creation */}
          <Card className="bg-slate-950/60 border-slate-700/50">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
                    <Plus className="h-4 w-4 text-slate-400" />
                    Manual Rule Creation
                  </CardTitle>
                  <CardDescription className="text-[10px]">
                    Create rules manually without selecting from examples
                  </CardDescription>
                </div>
                <Button 
                  size="sm" 
                  onClick={() => setShowAddRule(!showAddRule)}
                  className="bg-slate-600 hover:bg-slate-500"
                >
                  {showAddRule ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4 mr-1" />}
                  {showAddRule ? "Cancel" : "Add Rule"}
                </Button>
              </div>
            </CardHeader>
            {showAddRule && (
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Pattern to Match</label>
                    <Input
                      value={newRule.pattern}
                      onChange={(e) => setNewRule({...newRule, pattern: e.target.value})}
                      placeholder="e.g. groceries for home"
                      className="border-slate-800"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Classify As</label>
                    <select
                      value={newRule.action}
                      onChange={(e) => setNewRule({...newRule, action: e.target.value})}
                      className="w-full bg-slate-900 border border-slate-800 text-white px-3 py-2 rounded-md"
                    >
                      <option value="personal">Personal/Household</option>
                      <option value="overhead">Overhead (Rent/Utilities)</option>
                      <option value="stock">Stock/Inventory</option>
                      <option value="filter">Internal Transfer (Filter)</option>
                      <option value="operational">Operational Expense</option>
                      <option value="classify">Custom Category</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Custom Category (optional)</label>
                    <Input
                      value={newRule.category}
                      onChange={(e) => setNewRule({...newRule, category: e.target.value})}
                      placeholder="e.g. travel, marketing"
                      className="border-slate-800"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveRule} className="bg-emerald-600 hover:bg-emerald-500">
                    <Save className="h-4 w-4 mr-1" />
                    Create Rule
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowAddRule(false)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Existing Rules */}
          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-black uppercase text-slate-400">
                Learned Rules ({rules.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {rules.length === 0 ? (
                <div className="text-center py-6 text-slate-600">
                  <p className="text-sm">No rules yet. The brain is learning from your teaching.</p>
                </div>
              ) : (
                rules.map(rule => (
                  <div key={rule.id} className="bg-slate-900/40 rounded-lg p-3 border border-slate-800">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge className={cn(
                            "text-[8px]",
                            rule.action === 'personal' ? "bg-rose-500/30 text-rose-400" :
                            rule.action === 'overhead' ? "bg-sky-500/30 text-sky-400" :
                            rule.action === 'stock' ? "bg-violet-500/30 text-violet-400" :
                            rule.action === 'filter' ? "bg-amber-500/30 text-amber-400" :
                            "bg-emerald-500/30 text-emerald-400"
                          )}>{rule.action === 'classify' ? rule.category || 'custom' : rule.action}</Badge>
                          <span className="text-[10px] text-slate-500">{rule.times_triggered || 0}x triggered</span>
                        </div>
                        <p className="text-sm font-mono text-white mt-1">"{rule.match_pattern}"</p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => deleteRule(rule.id)} className="text-rose-400 hover:text-rose-300">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Quick Reference */}
          <Card className="bg-slate-900/40 border-slate-800">
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[10px]">
                <div>
                  <p className="font-black text-rose-400 mb-1">PERSONAL:</p>
                  <p className="text-slate-400">"groceries for home", "抽钱", "family"</p>
                </div>
                <div>
                  <p className="font-black text-sky-400 mb-1">OVERHEAD:</p>
                  <p className="text-slate-400">"rent", "electric", "water", "salary"</p>
                </div>
                <div>
                  <p className="font-black text-violet-400 mb-1">STOCK:</p>
                  <p className="text-slate-400">"inventory", "bulk order", "wholesale"</p>
                </div>
                <div>
                  <p className="font-black text-amber-400 mb-1">FILTER:</p>
                  <p className="text-slate-400">"invest", "perfume deposit", "savings"</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Expand Tab */}
      {activeTab === 'expand' && (
        <Card className="bg-slate-950/60 border-emerald-500/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-emerald-400" />
                  Expansion Planner
                </CardTitle>
                <CardDescription className="text-[10px]">
                  Plan new nodes with feasibility analysis based on Oracle data
                </CardDescription>
              </div>
              <Button 
                size="sm" 
                onClick={() => setShowAddExpansion(!showAddExpansion)}
                className="bg-emerald-600 hover:bg-emerald-500"
              >
                <Plus className="h-4 w-4 mr-1" />
                New Node
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Add Expansion Form */}
            {showAddExpansion && (
              <div className="bg-emerald-950/30 rounded-lg p-4 border border-emerald-900/50 space-y-3">
                <h4 className="text-sm font-black text-emerald-300">Plan New Node</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Node Name</label>
                    <Input
                      value={newExpansion.name}
                      onChange={(e) => setNewExpansion({...newExpansion, name: e.target.value})}
                      placeholder="e.g. Chitungwiza Shop"
                      className="border-emerald-900/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Location</label>
                    <Input
                      value={newExpansion.location}
                      onChange={(e) => setNewExpansion({...newExpansion, location: e.target.value})}
                      placeholder="e.g. Chitungwiza"
                      className="border-emerald-900/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Monthly Rent</label>
                    <Input
                      type="number"
                      value={newExpansion.rent}
                      onChange={(e) => setNewExpansion({...newExpansion, rent: Number(e.target.value)})}
                      placeholder="0"
                      className="border-emerald-900/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Employees</label>
                    <Input
                      type="number"
                      value={newExpansion.employees}
                      onChange={(e) => setNewExpansion({...newExpansion, employees: Number(e.target.value)})}
                      placeholder="0"
                      className="border-emerald-900/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Avg Salary</label>
                    <Input
                      type="number"
                      value={newExpansion.avgSalary}
                      onChange={(e) => setNewExpansion({...newExpansion, avgSalary: Number(e.target.value)})}
                      placeholder="0"
                      className="border-emerald-900/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Initial Investment</label>
                    <Input
                      type="number"
                      value={newExpansion.investment}
                      onChange={(e) => setNewExpansion({...newExpansion, investment: Number(e.target.value)})}
                      placeholder="0"
                      className="border-emerald-900/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Projected Revenue/Mo</label>
                    <Input
                      type="number"
                      value={newExpansion.revenue}
                      onChange={(e) => setNewExpansion({...newExpansion, revenue: Number(e.target.value)})}
                      placeholder="0"
                      className="border-emerald-900/50"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveExpansion} className="bg-emerald-600 hover:bg-emerald-500">
                    <Target className="h-4 w-4 mr-1" />
                    Analyze Feasibility
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowAddExpansion(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Expansion Nodes */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase text-slate-400">Planned Nodes ({expansions.length})</h4>
              {expansions.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No expansion plans yet. Start by adding your first node.</p>
                </div>
              ) : (
                expansions.map(node => (
                  <div key={node.id} className={cn(
                    "rounded-lg p-4 border",
                    node.status === 'approved' ? "bg-emerald-950/20 border-emerald-900/50" :
                    node.status === 'rejected' ? "bg-rose-950/20 border-rose-900/50" :
                    node.status === 'active' ? "bg-sky-950/20 border-sky-900/50" :
                    "bg-slate-900/40 border-slate-800"
                  )}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={cn(
                            "text-[8px]",
                            node.status === 'approved' ? "bg-emerald-500/30 text-emerald-400" :
                            node.status === 'rejected' ? "bg-rose-500/30 text-rose-400" :
                            node.status === 'active' ? "bg-sky-500/30 text-sky-400" :
                            "bg-amber-500/30 text-amber-400"
                          )}>{node.status.toUpperCase()}</Badge>
                          {node.feasibility_score && (
                            <Badge className={cn(
                              "text-[8px]",
                              node.feasibility_score >= 70 ? "bg-emerald-500/30 text-emerald-400" :
                              node.feasibility_score >= 50 ? "bg-amber-500/30 text-amber-400" :
                              "bg-rose-500/30 text-rose-400"
                            )}>
                              Score: {node.feasibility_score}
                            </Badge>
                          )}
                          <Badge className={cn(
                            "text-[8px]",
                            node.risk_level === 'low' ? "bg-emerald-500/30 text-emerald-400" :
                            node.risk_level === 'medium' ? "bg-amber-500/30 text-amber-400" :
                            "bg-rose-500/30 text-rose-400"
                          )}>{node.risk_level.toUpperCase()} RISK</Badge>
                        </div>
                        <h4 className="font-black text-white text-lg">{node.node_name}</h4>
                        {node.location && <p className="text-xs text-slate-400">{node.location}</p>}
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                          <div>
                            <div className="text-[10px] text-slate-500 uppercase">Rent</div>
                            <div className="text-sm font-mono text-white">${node.rent_budget?.toFixed(0) || 0}/mo</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-500 uppercase">Staff</div>
                            <div className="text-sm font-mono text-white">{node.employees_planned || 0} × ${node.avg_salary?.toFixed(0) || 0}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-500 uppercase">Investment</div>
                            <div className="text-sm font-mono text-white">${node.initial_investment?.toFixed(0) || 0}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-500 uppercase">Projected</div>
                            <div className="text-sm font-mono text-emerald-400">${node.projected_revenue?.toFixed(0) || 0}/mo</div>
                          </div>
                        </div>
                        
                        {node.break_even_months && (
                          <div className="mt-2 text-xs">
                            <span className="text-slate-500">Break-even: </span>
                            <span className="text-emerald-400 font-black">{node.break_even_months} months</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex flex-col gap-2">
                        {node.status === 'planning' && (
                          <>
                            <Button size="sm" onClick={() => updateExpansionStatus(node.id, 'approved')} className="bg-emerald-600 hover:bg-emerald-500">
                              Approve
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => updateExpansionStatus(node.id, 'rejected')} className="text-rose-400">
                              Reject
                            </Button>
                          </>
                        )}
                        {node.status === 'feasibility' && (
                          <Button size="sm" onClick={() => updateExpansionStatus(node.id, 'approved')} className="bg-emerald-600 hover:bg-emerald-500">
                            Approve
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Expansion Tips */}
            <div className="bg-sky-950/30 rounded-lg p-4 border border-sky-900/50">
              <h4 className="text-xs font-black uppercase text-sky-400 mb-2 flex items-center gap-2">
                <LineChart className="h-4 w-4" />
                Feasibility Guidelines
              </h4>
              <div className="space-y-1 text-xs text-slate-300">
                <p>• Rent should be &lt;35% of projected revenue</p>
                <p>• Labor costs should be &lt;40% of projected revenue</p>
                <p>• Break-even should be within 12 months</p>
                <p>• Target feasibility score of 70+ for low risk</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
