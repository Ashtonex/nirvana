"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { 
  Brain, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Search,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Loader2,
  Eye,
  Skull,
  MessageSquare,
  SearchCode,
  Scale
} from "lucide-react";
import { cn } from "@/components/ui";

type AuditFinding = {
  id: string;
  severity: "critical" | "warning" | "info";
  category: string;
  title: string;
  description: string;
  amount?: number;
  recommendation: string;
  autoAction?: "review" | "flag" | "investigate";
};

type MoneyAuditResult = {
  timestamp: string;
  period: { start: string; end: string };
  summary: {
    totalSales: number;
    totalExpenses: number;
    totalOpsIncome: number;
    totalOpsExpenses: number;
    netFlow: number;
    vaultDrift: number;
    missingMoney?: number;
  };
  findings: AuditFinding[];
  posOpsCorrelation: {
    matched: number;
    unmatched: number;
    discrepancies: { description: string; amount: number }[];
  };
  deadStockAnalysis: {
    deadStockValue: number;
    daysInStock: number;
    recoverySuggestions: string[];
  };
  overheadAnalysis: {
    contributed: number;
    paid: number;
    net: number;
    flaggedContributions: { shop: string; amount: number; reason: string }[];
  };
  difficultQuestions: {
    question: string;
    context: string;
    severity: "high" | "medium" | "low";
  }[];
};

type Props = {
  shops: { id: string; name: string }[];
};

export function MoneyAuditBrain({ shops }: Props) {
  const [auditResult, setAuditResult] = useState<MoneyAuditResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    findings: true,
    questions: true,
    summary: false,
    overhead: false,
    deadStock: false
  });
  const [auditCycle, setAuditCycle] = useState(0);
  const [typingLines, setTypingLines] = useState<string[]>([]);
  const [isTyping, setIsTyping] = useState(false);

  const runAudit = useCallback(async () => {
    setIsRunning(true);
    setIsTyping(true);
    setTypingLines([]);
    
    const typingSteps = [
      "Initializing money audit protocols...",
      "Scanning POS expense ledger...",
      "Cross-referencing Operations entries...",
      "Analyzing overhead contributions...",
      "Checking vault integrity...",
      "Hunting for dead stock value...",
      "Running discrepancy detection...",
      "Formulating difficult questions...",
      "Audit complete. Review findings below."
    ];
    
    for (let i = 0; i < typingSteps.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 300));
      setTypingLines(prev => [...prev, typingSteps[i]]);
    }
    
    try {
      const response = await fetch('/api/audit/money-brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysBack: 30 })
      });
      
      if (response.ok) {
        const data = await response.json();
        setAuditResult(data);
        setAuditCycle(c => c + 1);
      }
    } catch (error) {
      console.error('Money audit failed:', error);
    } finally {
      setIsRunning(false);
      setIsTyping(false);
    }
  }, []);

  useEffect(() => {
    if (!auditResult) {
      runAudit();
    }
  }, []);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  if (!auditResult && (isRunning || isTyping)) {
    return (
      <Card className="bg-gradient-to-br from-violet-950/40 to-slate-950 border-violet-500/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
            <Brain className="h-5 w-5 text-violet-400 animate-pulse" />
            Money Audit Brain
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-mono text-xs text-emerald-400/80 space-y-1 min-h-[200px]">
            {typingLines.map((line, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-slate-600">{'>'}</span>
                <span>{line}</span>
                {i === typingLines.length - 1 && isRunning && <span className="animate-pulse">▋</span>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!auditResult) {
    return (
      <Card className="bg-gradient-to-br from-violet-950/40 to-slate-950 border-violet-500/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
            <Brain className="h-5 w-5 text-violet-400" />
            Money Audit Brain
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <p className="text-slate-400 text-sm mb-4">Run a deep audit to find discrepancies and missing money</p>
          <Button onClick={runAudit} disabled={isRunning} className="bg-violet-600 hover:bg-violet-500">
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Brain className="h-4 w-4 mr-2" />}
            Run Audit
          </Button>
        </CardContent>
      </Card>
    );
  }

  const criticalCount = auditResult.findings.filter(f => f.severity === 'critical').length;
  const warningCount = auditResult.findings.filter(f => f.severity === 'warning').length;

  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-br from-violet-950/40 to-slate-950 border-violet-500/20">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
              <Brain className="h-5 w-5 text-violet-400 animate-pulse" />
              Money Audit Brain
              {auditCycle > 0 && <Badge className="bg-violet-500/20 text-violet-400 ml-2">Cycle {auditCycle}</Badge>}
            </CardTitle>
            <Button 
              onClick={runAudit} 
              disabled={isRunning} 
              size="sm"
              className="bg-violet-600 hover:bg-violet-500"
            >
              {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
          <CardDescription className="text-[10px] font-bold uppercase">
            Period: {auditResult.period.start} to {auditResult.period.end}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-emerald-950/30 rounded-lg p-3 border border-emerald-900/30">
              <div className="text-[10px] font-black uppercase text-emerald-500">Total Sales</div>
              <div className="text-lg font-black text-emerald-400 font-mono">${auditResult.summary.totalSales.toFixed(2)}</div>
            </div>
            <div className="bg-rose-950/30 rounded-lg p-3 border border-rose-900/30">
              <div className="text-[10px] font-black uppercase text-rose-500">Total Expenses</div>
              <div className="text-lg font-black text-rose-400 font-mono">${auditResult.summary.totalExpenses.toFixed(2)}</div>
            </div>
            <div className="bg-amber-950/30 rounded-lg p-3 border border-amber-900/30">
              <div className="text-[10px] font-black uppercase text-amber-500">Net Flow</div>
              <div className={`text-lg font-black font-mono ${auditResult.summary.netFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {auditResult.summary.netFlow >= 0 ? '+' : ''}${auditResult.summary.netFlow.toFixed(2)}
              </div>
            </div>
            <div className={cn(
              "rounded-lg p-3 border",
              auditResult.summary.vaultDrift === 0 
                ? "bg-emerald-950/30 border-emerald-900/30"
                : auditResult.summary.vaultDrift > 0
                  ? "bg-amber-950/30 border-amber-900/30"
                  : "bg-rose-950/30 border-rose-900/30"
            )}>
              <div className="text-[10px] font-black uppercase text-slate-400">Vault Drift</div>
              <div className={cn(
                "text-lg font-black font-mono",
                auditResult.summary.vaultDrift === 0 
                  ? "text-emerald-400"
                  : "text-amber-400"
              )}>
                {auditResult.summary.vaultDrift === 0 ? 'CLEAN' : `$${Math.abs(auditResult.summary.vaultDrift).toFixed(2)}`}
              </div>
            </div>
          </div>

          {auditResult.summary.missingMoney && auditResult.summary.missingMoney > 100 && (
            <div className="bg-gradient-to-r from-rose-950/50 to-amber-950/50 rounded-lg p-4 border border-rose-500/30">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-5 w-5 text-rose-400 animate-pulse" />
                <span className="text-lg font-black text-rose-400">CAPITAL AT RISK</span>
              </div>
              <div className="text-3xl font-black text-white font-mono mb-2">
                ${auditResult.summary.missingMoney.toFixed(2)}
              </div>
              <p className="text-xs text-slate-400">
                Vault drift + Dead stock value that needs investigation
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-slate-950/60 border-slate-800">
        <CardHeader 
          className="pb-2 cursor-pointer hover:bg-slate-900/30 transition-colors"
          onClick={() => toggleSection('findings')}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
              <AlertTriangle className={cn("h-4 w-4", criticalCount > 0 ? "text-rose-400" : warningCount > 0 ? "text-amber-400" : "text-emerald-400")} />
              Audit Findings ({auditResult.findings.length})
              {criticalCount > 0 && <Badge className="bg-rose-500/20 text-rose-400">{criticalCount} Critical</Badge>}
              {warningCount > 0 && <Badge className="bg-amber-500/20 text-amber-400">{warningCount} Warning</Badge>}
            </CardTitle>
            {expandedSections.findings ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </CardHeader>
        {expandedSections.findings && (
          <CardContent className="space-y-3">
            {auditResult.findings.length === 0 ? (
              <div className="text-center py-6 text-emerald-400">
                <Scale className="h-8 w-8 mx-auto mb-2" />
                <p className="font-black">ALL CLEAR</p>
                <p className="text-xs text-slate-500">No discrepancies found in this audit cycle</p>
              </div>
            ) : (
              auditResult.findings.map((finding) => (
                <div 
                  key={finding.id}
                  className={cn(
                    "rounded-lg border p-4",
                    finding.severity === 'critical' ? "bg-rose-950/20 border-rose-900/50" :
                    finding.severity === 'warning' ? "bg-amber-950/20 border-amber-900/50" :
                    "bg-sky-950/20 border-sky-900/50"
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={cn(
                          "text-[8px]",
                          finding.severity === 'critical' ? "bg-rose-500/30 text-rose-400" :
                          finding.severity === 'warning' ? "bg-amber-500/30 text-amber-400" :
                          "bg-sky-500/30 text-sky-400"
                        )}>
                          {finding.severity.toUpperCase()}
                        </Badge>
                        <Badge className="bg-slate-800 text-slate-400 text-[8px]">{finding.category}</Badge>
                        {finding.amount && (
                          <span className="text-sm font-mono text-white">${finding.amount.toFixed(2)}</span>
                        )}
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

      <Card className="bg-slate-950/60 border-slate-800">
        <CardHeader 
          className="pb-2 cursor-pointer hover:bg-slate-900/30 transition-colors"
          onClick={() => toggleSection('questions')}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-amber-400" />
              Difficult Questions ({auditResult.difficultQuestions.length})
            </CardTitle>
            {expandedSections.questions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </CardHeader>
        {expandedSections.questions && (
          <CardContent className="space-y-3">
            {auditResult.difficultQuestions.length === 0 ? (
              <div className="text-center py-6 text-slate-500">
                <SearchCode className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No difficult questions raised</p>
              </div>
            ) : (
              auditResult.difficultQuestions.map((q, i) => (
                <div 
                  key={i}
                  className={cn(
                    "rounded-lg border p-4",
                    q.severity === 'high' ? "bg-rose-950/20 border-rose-900/50" :
                    q.severity === 'medium' ? "bg-amber-950/20 border-amber-900/50" :
                    "bg-slate-900/40 border-slate-800"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Search className={cn(
                      "h-4 w-4 mt-1 flex-shrink-0",
                      q.severity === 'high' ? "text-rose-400" :
                      q.severity === 'medium' ? "text-amber-400" :
                      "text-slate-400"
                    )} />
                    <div>
                      <h4 className={cn(
                        "font-black text-sm",
                        q.severity === 'high' ? "text-rose-300" :
                        q.severity === 'medium' ? "text-amber-300" :
                        "text-slate-300"
                      )}>
                        {q.question}
                      </h4>
                      <p className="text-xs text-slate-500 mt-1">{q.context}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-slate-950/60 border-slate-800">
          <CardHeader 
            className="pb-2 cursor-pointer hover:bg-slate-900/30 transition-colors"
            onClick={() => toggleSection('overhead')}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
                <Scale className="h-4 w-4 text-amber-400" />
                Overhead Analysis
              </CardTitle>
              {expandedSections.overhead ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </CardHeader>
          {expandedSections.overhead && (
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-emerald-950/30 rounded p-2 text-center">
                  <div className="text-[10px] text-emerald-500 uppercase">Contributed</div>
                  <div className="text-sm font-black text-emerald-400 font-mono">${auditResult.overheadAnalysis.contributed.toFixed(2)}</div>
                </div>
                <div className="bg-rose-950/30 rounded p-2 text-center">
                  <div className="text-[10px] text-rose-500 uppercase">Paid</div>
                  <div className="text-sm font-black text-rose-400 font-mono">${auditResult.overheadAnalysis.paid.toFixed(2)}</div>
                </div>
                <div className="bg-sky-950/30 rounded p-2 text-center">
                  <div className="text-[10px] text-sky-500 uppercase">Net</div>
                  <div className={`text-sm font-black font-mono ${auditResult.overheadAnalysis.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    ${auditResult.overheadAnalysis.net.toFixed(2)}
                  </div>
                </div>
              </div>
              {auditResult.overheadAnalysis.flaggedContributions.length > 0 && (
                <div className="space-y-2 mt-3">
                  <h4 className="text-xs font-black text-amber-400 uppercase">Flagged</h4>
                  {auditResult.overheadAnalysis.flaggedContributions.map((fc, i) => (
                    <div key={i} className="bg-amber-950/20 rounded p-2 border border-amber-900/30">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-black text-amber-300">{fc.shop}</span>
                        <span className="text-sm font-mono text-white">${fc.amount.toFixed(2)}</span>
                      </div>
                      <p className="text-[10px] text-amber-500 mt-1">{fc.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          )}
        </Card>

        <Card className="bg-slate-950/60 border-slate-800">
          <CardHeader 
            className="pb-2 cursor-pointer hover:bg-slate-900/30 transition-colors"
            onClick={() => toggleSection('deadStock')}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
                <Skull className="h-4 w-4 text-slate-400" />
                Dead Stock Recovery
              </CardTitle>
              {expandedSections.deadStock ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </CardHeader>
          {expandedSections.deadStock && (
            <CardContent className="space-y-3">
              <div className="bg-slate-900/40 rounded p-3 text-center">
                <div className="text-2xl font-black text-slate-300 font-mono">${auditResult.deadStockAnalysis.deadStockValue.toFixed(2)}</div>
                <div className="text-[10px] text-slate-500 uppercase mt-1">Trapped in Dead Stock</div>
              </div>
              {auditResult.deadStockAnalysis.recoverySuggestions.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-black text-emerald-400 uppercase">Recovery Suggestions</h4>
                  {auditResult.deadStockAnalysis.recoverySuggestions.map((suggestion, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <TrendingUp className="h-3 w-3 text-emerald-400 mt-0.5" />
                      <span className="text-slate-300">{suggestion}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          )}
        </Card>
      </div>

      {auditResult.posOpsCorrelation.discrepancies.length > 0 && (
        <Card className="bg-slate-950/60 border-amber-800/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              POS-Ops Discrepancies
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {auditResult.posOpsCorrelation.discrepancies.map((d, i) => (
              <div key={i} className="bg-amber-950/20 rounded p-3 border border-amber-900/30">
                <p className="text-sm text-amber-300">{d.description}</p>
                <p className="text-xs text-slate-500 mt-1">Difference: ${d.amount.toFixed(2)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
