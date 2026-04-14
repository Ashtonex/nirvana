"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { 
  Brain, AlertTriangle, TrendingUp, TrendingDown, DollarSign, RefreshCw,
  ChevronDown, ChevronUp, Loader2, Scale, Target, Lightbulb, Calculator,
  PiggyBank, Landmark, Clock, CheckCircle, XCircle, MessageSquare
} from "lucide-react";
import { cn } from "@/components/ui";

type Props = {
  shops: { id: string; name: string }[];
};

export function MoneyAuditBrain({ shops }: Props) {
  const [auditData, setAuditData] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    overview: true,
    health: false,
    findings: true,
    recommendations: true,
    insights: false,
    tax: false,
    forecast: false
  });
  const [auditCycle, setAuditCycle] = useState(0);
  const [typingLines, setTypingLines] = useState<string[]>([]);

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
      "Building cash flow forecast models...",
      "Identifying optimization opportunities...",
      "Cross-referencing historical patterns...",
      "Audit complete. Reviewing results..."
    ];
    
    for (let i = 0; i < typingSteps.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 250));
      setTypingLines(prev => [...prev, typingSteps[i]]);
    }
    
    try {
      const response = await fetch('/api/audit/financial-intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysBack: 30 })
      });
      
      if (response.ok) {
        const data = await response.json();
        setAuditData(data);
        setAuditCycle(c => c + 1);
      }
    } catch (error) {
      console.error('Financial audit failed:', error);
    } finally {
      setIsRunning(false);
    }
  }, []);

  useEffect(() => {
    if (!auditData) {
      runAudit();
    }
  }, []);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
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

  const { audit, healthScore, recommendations, learningInsights, taxOptimizations, cashFlowForecast } = auditData;
  const criticalCount = audit.findings.filter((f: any) => f.severity === 'critical').length;
  const warningCount = audit.findings.filter((f: any) => f.severity === 'warning').length;

  return (
    <div className="space-y-4">
      {/* Header with Financial Health Score */}
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
        </CardHeader>
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
      </Card>

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

      {/* Tax Optimizations */}
      {taxOptimizations.length > 0 && (
        <Card className="bg-slate-950/60 border-amber-500/20">
          <CardHeader 
            className="pb-2 cursor-pointer hover:bg-slate-900/30 transition-colors"
            onClick={() => toggleSection('tax')}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
                <Calculator className="h-4 w-4 text-amber-400" />
                Tax Optimization Opportunities
              </CardTitle>
              {expandedSections.tax ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </CardHeader>
          {expandedSections.tax && (
            <CardContent className="space-y-3">
              {taxOptimizations.map((tax: any, i: number) => (
                <div key={i} className="bg-amber-950/20 rounded-lg p-4 border border-amber-900/50">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-black text-amber-300 text-sm">{tax.opportunity}</h4>
                    {tax.estimatedSavings > 0 && (
                      <Badge className="bg-emerald-500/30 text-emerald-400">Est. Savings: ${tax.estimatedSavings.toFixed(0)}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-300">{tax.action}</p>
                  <Badge className={cn(
                    "mt-2 text-[8px]",
                    tax.complianceRisk === 'low' ? "bg-emerald-500/30 text-emerald-400" :
                    tax.complianceRisk === 'medium' ? "bg-amber-500/30 text-amber-400" :
                    "bg-rose-500/30 text-rose-400"
                  )}>Risk: {tax.complianceRisk.toUpperCase()}</Badge>
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
    </div>
  );
}
