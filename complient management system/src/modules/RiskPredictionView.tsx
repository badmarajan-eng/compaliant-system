import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Download,
  Info,
  Loader2,
  Printer,
  Sparkles,
} from 'lucide-react';
import {
  PredictiveEntityDetailModal,
  type PredictiveDetailSelection,
} from '../components/PredictiveEntityDetailModal';
import { PredictiveForecastPanel } from '../components/PredictiveForecastPanel';
import { PredictiveGovernancePanels } from '../components/PredictiveGovernancePanels';
import { RiskTierText } from '../components/StatusText';
import { usePredictiveStore } from '../hooks/usePredictiveStore';
import { requestPredictiveInsights } from '../services/aiClient';
import type {
  AIPredictiveInsight,
  BatchAssessmentStatus,
  CAPARecord,
  ComplaintRecord,
  ForecastMethodId,
  ModuleId,
} from '../types/qms';
import { detectRecurringDefects } from '../utils/patternAnalytics';
import {
  computeMonthlyComplaintForecast,
  exportPredictiveQualityReportCsv,
} from '../utils/predictiveEngine';

interface RiskPredictionViewProps {
  complaints: ComplaintRecord[];
  capaRecords?: CAPARecord[];
  predictiveStore: ReturnType<typeof usePredictiveStore>;
  onNavigate?: (module: ModuleId, complaintId?: string) => void;
}

type PredictiveTabId =
  | 'products'
  | 'processes-batches'
  | 'forecast-history'
  | 'scoring'
  | 'alerts'
  | 'preventive'
  | 'ai-reports';

export function RiskPredictionView({
  complaints,
  predictiveStore,
  onNavigate,
}: RiskPredictionViewProps) {
  const {
    weights,
    setWeights,
    resetWeights,
    productRisks,
    processRisks,
    batchRisks,
    alerts,
    updateAlert,
    preventivePlans,
    updatePreventivePlan,
    predictionHistory,
    addPredictionSnapshot,
  } = predictiveStore;

  const [activeTab, setActiveTab] = useState<PredictiveTabId>('products');
  const [forecastMethod, setForecastMethod] = useState<ForecastMethodId>('exponential_smoothing');
  const [batchFilter, setBatchFilter] = useState<'ALL' | 'NEEDS_INSPECTION' | BatchAssessmentStatus>(
    'ALL'
  );
  const [detailSelection, setDetailSelection] = useState<PredictiveDetailSelection | null>(null);

  const [aiInsight, setAiInsight] = useState<AIPredictiveInsight | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const forecast = useMemo(
    () => computeMonthlyComplaintForecast(complaints, forecastMethod),
    [complaints, forecastMethod]
  );

  // Module 1 KPI metrics calculated strictly from live predictions
  const kpis = useMemo(() => {
    const totalProductsAnalyzed = productRisks.length;
    const highRiskProducts = productRisks.filter((p) => p.riskLevel === 'HIGH').length;
    const mediumRiskProducts = productRisks.filter((p) => p.riskLevel === 'MEDIUM').length;
    const highRiskProcesses = processRisks.filter((p) => p.riskLevel === 'HIGH').length;
    const batchesRequiringInspection = batchRisks.filter(
      (b) =>
        b.assessmentStatus === 'Confirmed Defect History' ||
        b.assessmentStatus === 'Estimated Elevated Risk' ||
        b.riskLevel === 'HIGH'
    ).length;
    const nextMonthForecast = forecast.horizons.find((h) => h.horizonLabel === 'Next Month');

    return {
      totalProductsAnalyzed,
      highRiskProducts,
      mediumRiskProducts,
      highRiskProcesses,
      batchesRequiringInspection,
      predictedTrend: forecast.trendDirection,
      nextMonthCount: nextMonthForecast?.predictedTotal ?? null,
    };
  }, [productRisks, processRisks, batchRisks, forecast]);

  const filteredBatches = useMemo(() => {
    if (batchFilter === 'ALL') return batchRisks;
    if (batchFilter === 'NEEDS_INSPECTION') {
      return batchRisks.filter(
        (b) =>
          b.assessmentStatus === 'Confirmed Defect History' ||
          b.assessmentStatus === 'Estimated Elevated Risk' ||
          b.riskLevel === 'HIGH'
      );
    }
    return batchRisks.filter((b) => b.assessmentStatus === batchFilter);
  }, [batchRisks, batchFilter]);

  const scoredProcessesForChart = useMemo(
    () =>
      processRisks.map((pr) => ({
        processName: pr.processName,
        riskScore: pr.riskScore ?? 0,
        riskLevel: pr.riskLevel,
        complaintCount: pr.complaintCount,
      })),
    [processRisks]
  );

  const openAlertsCount = useMemo(
    () => alerts.filter((a) => a.status !== 'Resolved').length,
    [alerts]
  );
  const activePlansCount = useMemo(
    () => preventivePlans.filter((p) => p.status !== 'Rejected').length,
    [preventivePlans]
  );

  const handleGenerateAiInsights = async () => {
    setAiLoading(true);
    setAiError(null);
    setActiveTab('ai-reports');
    try {
      const patterns = detectRecurringDefects(complaints, {
        observationDays: 365,
        chronicThreshold: 3,
      }).filter((p) => p.classification !== 'New Problem');

      const summary = {
        totalComplaintsAnalyzed: complaints.length,
        totalProductsAnalyzed: kpis.totalProductsAnalyzed,
        productRiskScores: productRisks.map((p) => ({
          productId: p.productId,
          productName: p.productName,
          riskScore: p.riskScore,
          riskLevel: p.riskLevel,
          totalComplaints: p.totalComplaints,
          recent90DayComplaints: p.recent90DayComplaints,
          criticalComplaints: p.criticalComplaints,
          unresolvedCriticalComplaints: p.unresolvedCriticalComplaints,
          recurringDefectsCount: p.recurringDefectsCount,
          verifiedRootCauses: p.verifiedRootCauses,
          possibleFutureCategories: p.possibleFutureCategories,
        })),
        processRiskScores: processRisks.map((pr) => ({
          processName: pr.processName,
          riskScore: pr.riskScore,
          riskLevel: pr.riskLevel,
          complaintCount: pr.complaintCount,
          criticalComplaints: pr.criticalComplaints,
          trendDirection: pr.trendDirection,
          verifiedRootCauses: pr.verifiedRootCauses,
        })),
        forecastSummary: {
          sufficientData: forecast.sufficientData,
          methodLabel: forecast.methodLabel,
          trendDirection: forecast.trendDirection,
          trendSlopePerMonth: forecast.trendSlopePerMonth,
          horizons: forecast.horizons,
          recentMonths: forecast.timeline.filter((t) => !t.isForecast).slice(-6),
        },
        recurringDefectPatterns: patterns.slice(0, 8).map((pt) => ({
          patternTitle: pt.patternTitle,
          classification: pt.classification,
          occurrences: pt.occurrences,
          affectedProducts: pt.affectedProducts,
          verifiedRootCauses: pt.verifiedRootCauses,
        })),
        activeAlertsCount: openAlertsCount,
      };

      const insight = await requestPredictiveInsights(summary);
      setAiInsight(insight);
    } catch (err) {
      setAiError(
        err instanceof Error
          ? err.message
          : 'Failed to generate AI predictive explanation.'
      );
    } finally {
      setAiLoading(false);
    }
  };

  const handleExportReportCsv = () => {
    exportPredictiveQualityReportCsv({
      products: productRisks,
      processes: processRisks,
      batches: batchRisks,
      forecast,
      alerts,
      preventivePlans,
    });
  };

  const handlePrintReport = () => {
    setActiveTab('ai-reports');
    window.setTimeout(() => window.print(), 150);
  };

  return (
    <div className="space-y-6">
      {/* Decision-Support Governance Banner */}
      <div className="bg-[#0B1426] text-slate-100 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1 text-xs leading-relaxed">
            <p className="text-sm font-semibold text-white">
              Predictive Quality Intelligence Engine (Decision-Support System)
            </p>
            <p className="text-slate-300 max-w-3xl">
              Risk scores (0–100), batch inspection priorities, and time-series forecasts are computed deterministically from your live complaint records, CAPA verification history, and configurable scoring weights. Predictions support Quality Management prioritization and do not replace physical inspection or human engineering verification.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 print:hidden">
          <button
            type="button"
            onClick={handleExportReportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md whitespace-nowrap transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
            <span>Export Risk CSV</span>
          </button>
          <button
            type="button"
            onClick={handlePrintReport}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md whitespace-nowrap transition-colors"
          >
            <Printer className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
            <span>Print Report</span>
          </button>
          <button
            type="button"
            onClick={handleGenerateAiInsights}
            disabled={aiLoading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-cyan-700 hover:bg-cyan-600 disabled:opacity-60 rounded-md whitespace-nowrap transition-colors"
          >
            {aiLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>{aiLoading ? 'Analyzing...' : 'Explain with Gemini AI'}</span>
          </button>
        </div>
      </div>

      {/* Module 1: 6 Predictive Quality Dashboard KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <button
          type="button"
          onClick={() => setActiveTab('products')}
          className="text-left bg-white border border-slate-200 hover:border-cyan-600 rounded-lg p-4 transition-colors"
        >
          <p className="text-xs text-slate-500">Products Analyzed</p>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            {kpis.totalProductsAnalyzed}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Across {complaints.length} complaints</p>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('products')}
          className="text-left bg-white border border-slate-200 hover:border-red-500 rounded-lg p-4 transition-colors"
        >
          <p className="text-xs text-slate-500">High-Risk Products</p>
          <p className="text-2xl font-bold text-red-700 font-mono tabular-nums mt-1">
            {kpis.highRiskProducts}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Score 70–100 threshold</p>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('products')}
          className="text-left bg-white border border-slate-200 hover:border-amber-500 rounded-lg p-4 transition-colors"
        >
          <p className="text-xs text-slate-500">Medium-Risk Products</p>
          <p className="text-2xl font-bold text-amber-700 font-mono tabular-nums mt-1">
            {kpis.mediumRiskProducts}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Score 40–69 threshold</p>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('processes-batches')}
          className="text-left bg-white border border-slate-200 hover:border-red-500 rounded-lg p-4 transition-colors"
        >
          <p className="text-xs text-slate-500">High-Risk Processes</p>
          <p className="text-2xl font-bold text-red-700 font-mono tabular-nums mt-1">
            {kpis.highRiskProcesses}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Associated process risk 70+</p>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('processes-batches');
            setBatchFilter('NEEDS_INSPECTION');
          }}
          className="text-left bg-white border border-slate-200 hover:border-cyan-600 rounded-lg p-4 transition-colors"
        >
          <p className="text-xs text-slate-500">Batches Needing Inspection</p>
          <p className="text-2xl font-bold text-cyan-800 font-mono tabular-nums mt-1">
            {kpis.batchesRequiringInspection}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Confirmed or elevated risk</p>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('forecast-history')}
          className="text-left bg-white border border-slate-200 hover:border-cyan-600 rounded-lg p-4 transition-colors"
        >
          <p className="text-xs text-slate-500">Predicted Complaint Trend</p>
          <p
            className={`text-lg font-bold mt-1.5 ${
              kpis.predictedTrend === 'Increasing'
                ? 'text-red-700'
                : kpis.predictedTrend === 'Decreasing'
                  ? 'text-emerald-700'
                  : 'text-slate-900'
            }`}
          >
            {kpis.predictedTrend}
          </p>
          <p className="text-[11px] text-slate-500 font-mono tabular-nums mt-1">
            {kpis.nextMonthCount !== null
              ? `Next mo est: ${kpis.nextMonthCount}`
              : 'Need >= 3 months'}
          </p>
        </button>
      </div>

      {/* Workspace Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200 print:hidden">
        {(
          [
            { id: 'products', label: `Product Risk (${productRisks.length})` },
            { id: 'processes-batches', label: `Process & Batch Risk` },
            { id: 'forecast-history', label: `Forecast & History` },
            { id: 'scoring', label: `Risk Scoring Engine` },
            { id: 'alerts', label: `Alert Center (${openAlertsCount})` },
            { id: 'preventive', label: `Preventive Actions (${activePlansCount})` },
            { id: 'ai-reports', label: `AI Insights & Risk Report` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: MODULE 2 — PRODUCT RISK PREDICTION */}
      {activeTab === 'products' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Product Predictive Risk Ranking (0–100 Index)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                LOW (0–39) · MEDIUM (40–69) · HIGH (70–100). Click any bar or product row to open its full risk analysis.
              </p>
            </div>

            {productRisks.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">
                No product complaint records available to analyze.
              </p>
            ) : (
              <>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={productRisks}
                      layout="vertical"
                      margin={{ top: 4, right: 24, left: 10, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis
                        type="category"
                        dataKey="productName"
                        width={210}
                        tick={{ fontSize: 11, fill: '#334155' }}
                      />
                      <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '6px' }} />
                      <Bar
                        dataKey="riskScore"
                        name="Product Risk Score"
                        radius={[0, 4, 4, 0]}
                        className="cursor-pointer"
                        onClick={(entry) => {
                          const name = (entry as { payload?: { productName?: string } })?.payload
                            ?.productName;
                          const matched = productRisks.find((p) => p.productName === name);
                          if (matched) setDetailSelection({ kind: 'Product', data: matched });
                        }}
                      >
                        {productRisks.map((entry, idx) => (
                          <Cell
                            key={idx}
                            fill={
                              entry.riskLevel === 'HIGH'
                                ? '#dc2626'
                                : entry.riskLevel === 'MEDIUM'
                                  ? '#d97706'
                                  : '#0891b2'
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="overflow-x-auto pt-2 border-t border-slate-100">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-3 font-medium">Product ID</th>
                        <th className="py-2 pr-3 font-medium">Product Name</th>
                        <th className="py-2 pr-3 font-medium text-right">Historical</th>
                        <th className="py-2 pr-3 font-medium text-right">Recent 90d</th>
                        <th className="py-2 pr-3 font-medium text-right">Critical</th>
                        <th className="py-2 pr-3 font-medium text-right">Recurring</th>
                        <th className="py-2 pr-3 font-medium text-right">Risk Score</th>
                        <th className="py-2 pr-3 font-medium">Main Risk Factors</th>
                        <th className="py-2 font-medium">Recommended Preventive Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {productRisks.map((p) => (
                        <tr
                          key={p.productName}
                          onClick={() => setDetailSelection({ kind: 'Product', data: p })}
                          className="cursor-pointer hover:bg-slate-50 transition-colors"
                        >
                          <td className="py-2.5 pr-3 font-mono text-slate-600 whitespace-nowrap">
                            {p.productId}
                          </td>
                          <td className="py-2.5 pr-3 font-medium text-slate-900">
                            <p>{p.productName}</p>
                            <p className="text-[11px] text-slate-500">
                              {p.affectedBatchesCount} batch(es) · {p.verifiedRootCauses.length} verified RC
                            </p>
                          </td>
                          <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                            {p.totalComplaints}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                            {p.recent90DayComplaints}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-red-700 font-semibold">
                            {p.criticalComplaints}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                            {p.recurringDefectsCount}
                          </td>
                          <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                            <RiskTierText tier={p.riskLevel} score={p.riskScore} />
                          </td>
                          <td className="py-2.5 pr-3 text-slate-600 max-w-[230px]">
                            {p.mainRiskFactors.slice(0, 2).join(' · ')}
                          </td>
                          <td className="py-2.5 text-slate-700 max-w-[250px]">
                            {p.recommendedPreventiveAction}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: MODULE 3 & MODULE 4 — PROCESS RISK & BATCH RISK ASSESSMENT */}
      {activeTab === 'processes-batches' && (
        <div className="space-y-6">
          {/* Module 3: Manufacturing Process Risk */}
          <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="pb-3 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-900">
                Manufacturing Process Risk Assessment (7 Core Process Families)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Important: Associating complaints with a manufacturing process does not prove causation. Physical inspection and verified root cause confirmation remain mandatory.
              </p>
            </div>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={scoredProcessesForChart}
                  layout="vertical"
                  margin={{ top: 4, right: 24, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis
                    type="category"
                    dataKey="processName"
                    width={140}
                    tick={{ fontSize: 11, fill: '#334155' }}
                  />
                  <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '6px' }} />
                  <Bar
                    dataKey="riskScore"
                    name="Process Risk Score"
                    radius={[0, 4, 4, 0]}
                    className="cursor-pointer"
                    onClick={(entry) => {
                      const name = (entry as { payload?: { processName?: string } })?.payload
                        ?.processName;
                      const matched = processRisks.find((p) => p.processName === name);
                      if (matched) setDetailSelection({ kind: 'Process', data: matched });
                    }}
                  >
                    {scoredProcessesForChart.map((entry, idx) => (
                      <Cell
                        key={idx}
                        fill={
                          entry.riskLevel === 'HIGH'
                            ? '#dc2626'
                            : entry.riskLevel === 'MEDIUM'
                              ? '#d97706'
                              : entry.riskLevel === 'LOW'
                                ? '#0891b2'
                                : '#cbd5e1'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3 font-medium">Process Name</th>
                    <th className="py-2 pr-3 font-medium text-right">Complaints</th>
                    <th className="py-2 pr-3 font-medium text-right">Critical</th>
                    <th className="py-2 pr-3 font-medium text-right">Recurring</th>
                    <th className="py-2 pr-3 font-medium text-right">Verified RC</th>
                    <th className="py-2 pr-3 font-medium text-right">Risk Score</th>
                    <th className="py-2 font-medium">Suggested Preventive Measures</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {processRisks.map((pr) => (
                    <tr
                      key={pr.processName}
                      onClick={() => setDetailSelection({ kind: 'Process', data: pr })}
                      className="cursor-pointer hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-2.5 pr-3">
                        <p className="font-medium text-slate-900">{pr.processName}</p>
                        <p className="text-[11px] text-slate-500">
                          {pr.observedShopProcesses.length > 0
                            ? pr.observedShopProcesses.join(', ')
                            : 'No shop-floor complaints linked'}
                        </p>
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                        {pr.complaintCount}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-red-700 font-semibold">
                        {pr.criticalComplaints}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                        {pr.recurringDefectsCount}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                        {pr.verifiedRootCauses.length}
                      </td>
                      <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                        {pr.riskScore !== null && pr.riskLevel !== 'INSUFFICIENT DATA' ? (
                          <RiskTierText tier={pr.riskLevel} score={pr.riskScore} />
                        ) : (
                          <span className="text-slate-500 font-medium">Insufficient Data</span>
                        )}
                      </td>
                      <td className="py-2.5 text-slate-700 max-w-[280px]">
                        {pr.suggestedPreventiveMeasures[0]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Module 4: Batch Risk Assessment */}
          <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Batch Risk Assessment & Inspection Prioritization ({filteredBatches.length})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Explicitly separates Confirmed Defect History from Estimated Elevated Risk. Batches lacking sufficient manufacturing/inspection records are flagged as Insufficient Batch Information rather than guessed.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md self-start">
                {(
                  [
                    { id: 'ALL', label: 'All Batches' },
                    { id: 'NEEDS_INSPECTION', label: 'Needs Inspection' },
                    { id: 'Confirmed Defect History', label: 'Confirmed Defect' },
                    { id: 'Estimated Elevated Risk', label: 'Estimated Risk' },
                    { id: 'Insufficient Batch Information', label: 'Insufficient Info' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setBatchFilter(opt.id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap transition-colors ${
                      batchFilter === opt.id
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3 font-medium">Batch Number</th>
                    <th className="py-2 pr-3 font-medium">Product</th>
                    <th className="py-2 pr-3 font-medium">Manufacturing Process</th>
                    <th className="py-2 pr-3 font-medium">Distinction</th>
                    <th className="py-2 pr-3 font-medium text-right">Risk Score</th>
                    <th className="py-2 pr-3 font-medium">Risk Factors</th>
                    <th className="py-2 font-medium">Recommended Inspection</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBatches.map((b) => (
                    <tr
                      key={`${b.batchNumber}-${b.productId}`}
                      onClick={() => setDetailSelection({ kind: 'Batch', data: b })}
                      className="cursor-pointer hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-2.5 pr-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {b.batchNumber}
                      </td>
                      <td className="py-2.5 pr-3">
                        <p className="font-medium text-slate-900">{b.productName}</p>
                        <p className="text-[11px] font-mono text-slate-500">
                          {b.productId} · Mfg {b.manufacturingDate}
                        </p>
                      </td>
                      <td className="py-2.5 pr-3 text-slate-700">{b.processName}</td>
                      <td className="py-2.5 pr-3 whitespace-nowrap">
                        <span
                          className={`font-medium ${
                            b.assessmentStatus === 'Confirmed Defect History'
                              ? 'text-red-700'
                              : b.assessmentStatus === 'Estimated Elevated Risk'
                                ? 'text-amber-700'
                                : b.assessmentStatus === 'Insufficient Batch Information'
                                  ? 'text-slate-500'
                                  : 'text-cyan-800'
                          }`}
                        >
                          {b.assessmentStatus}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                        {b.riskScore !== null && b.riskLevel !== 'INSUFFICIENT DATA' ? (
                          <RiskTierText tier={b.riskLevel} score={b.riskScore} />
                        ) : (
                          <span className="text-slate-500">Insufficient Data</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-600 max-w-[220px]">
                        {b.riskFactors.slice(0, 2).join(' · ')}
                      </td>
                      <td className="py-2.5 text-slate-700 max-w-[260px]">
                        {b.recommendedInspection}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* TAB 3: MODULE 5 & MODULE 10 — FORECASTING & PREDICTION HISTORY */}
      {activeTab === 'forecast-history' && (
        <PredictiveForecastPanel
          forecast={forecast}
          method={forecastMethod}
          onMethodChange={setForecastMethod}
          predictionHistory={predictionHistory}
          productRisks={productRisks}
          onSaveSnapshot={addPredictionSnapshot}
        />
      )}

      {/* TAB 4: MODULE 6 — CONFIGURABLE RISK SCORING ENGINE */}
      {activeTab === 'scoring' && (
        <PredictiveGovernancePanels
          mode="scoring"
          weights={weights}
          onChangeWeights={setWeights}
          onResetWeights={resetWeights}
          productRisks={productRisks}
          processRisks={processRisks}
          alerts={alerts}
          onUpdateAlert={updateAlert}
          preventivePlans={preventivePlans}
          onUpdatePreventivePlan={updatePreventivePlan}
        />
      )}

      {/* TAB 5: MODULE 7 — PREDICTIVE ALERT SYSTEM */}
      {activeTab === 'alerts' && (
        <PredictiveGovernancePanels
          mode="alerts"
          weights={weights}
          onChangeWeights={setWeights}
          onResetWeights={resetWeights}
          productRisks={productRisks}
          processRisks={processRisks}
          alerts={alerts}
          onUpdateAlert={updateAlert}
          preventivePlans={preventivePlans}
          onUpdatePreventivePlan={updatePreventivePlan}
        />
      )}

      {/* TAB 6: MODULE 9 — PREVENTIVE ACTION RECOMMENDATIONS */}
      {activeTab === 'preventive' && (
        <PredictiveGovernancePanels
          mode="preventive"
          weights={weights}
          onChangeWeights={setWeights}
          onResetWeights={resetWeights}
          productRisks={productRisks}
          processRisks={processRisks}
          alerts={alerts}
          onUpdateAlert={updateAlert}
          preventivePlans={preventivePlans}
          onUpdatePreventivePlan={updatePreventivePlan}
        />
      )}

      {/* TAB 7: MODULE 8 (GEMINI EXPLANATION) & MODULE 11 (PRINTABLE/DOWNLOADABLE REPORT) */}
      {activeTab === 'ai-reports' && (
        <div className="space-y-6">
          {/* Module 8: Gemini Predictive Insights */}
          <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Gemini AI Predictive Quality Explanation
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Explains your already-calculated risk scores, process trends, forecasts, and verified root causes without inventing numbers
                </p>
              </div>
              <button
                type="button"
                onClick={handleGenerateAiInsights}
                disabled={aiLoading}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-cyan-700 hover:bg-cyan-800 disabled:opacity-60 rounded-md self-start print:hidden"
              >
                {aiLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span>{aiInsight ? 'Refresh AI Explanation' : 'Explain Calculated Predictions'}</span>
              </button>
            </div>

            {aiError && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 text-xs text-red-800">
                {aiError}
              </div>
            )}

            {!aiInsight && !aiLoading && !aiError && (
              <p className="text-xs text-slate-500 py-4">
                Click &ldquo;Explain Calculated Predictions&rdquo; to generate a structured Gemini briefing covering future quality concerns, high-risk products, processes requiring investigation, expected complaint categories, and preventive priorities.
              </p>
            )}

            {aiLoading && (
              <div className="py-6 text-xs text-slate-600 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-cyan-700" aria-hidden="true" />
                <span>Generating grounded predictive quality briefing with Gemini...</span>
              </div>
            )}

            {aiInsight && (
              <div className="space-y-5 text-xs">
                <div className="bg-slate-50 border border-slate-200 rounded-md p-4">
                  <p className="font-semibold text-slate-900 mb-1">Executive Summary</p>
                  <p className="text-slate-700 leading-relaxed">{aiInsight.executiveSummary}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-slate-200 rounded-md p-4 space-y-2">
                    <p className="font-semibold text-slate-900">Main Future Quality Concerns</p>
                    <ul className="list-disc pl-4 space-y-1 text-slate-700">
                      {aiInsight.mainFutureQualityConcerns.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="border border-slate-200 rounded-md p-4 space-y-2">
                    <p className="font-semibold text-slate-900">Products Requiring Attention</p>
                    <ul className="list-disc pl-4 space-y-1 text-slate-700">
                      {aiInsight.productsRequiringAttention.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="border border-slate-200 rounded-md p-4 space-y-2">
                    <p className="font-semibold text-slate-900">Processes Requiring Investigation</p>
                    <ul className="list-disc pl-4 space-y-1 text-slate-700">
                      {aiInsight.processesRequiringInvestigation.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="border border-slate-200 rounded-md p-4 space-y-2">
                    <p className="font-semibold text-slate-900">Possible Future Complaint Categories</p>
                    <ul className="list-disc pl-4 space-y-1 text-slate-700">
                      {aiInsight.possibleFutureComplaintCategories.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="border border-slate-200 rounded-md p-4 space-y-2">
                    <p className="font-semibold text-slate-900">Suggested Preventive Actions</p>
                    <ul className="list-disc pl-4 space-y-1 text-slate-700">
                      {aiInsight.suggestedPreventiveActions.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="border border-slate-200 rounded-md p-4 space-y-2">
                    <p className="font-semibold text-slate-900">Management Recommendations</p>
                    <ul className="list-disc pl-4 space-y-1 text-slate-700">
                      {aiInsight.managementRecommendations.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 border-t border-slate-200 pt-3">
                  {aiInsight.governanceLimitationNote} · Generated{' '}
                  <span className="font-mono tabular-nums">
                    {new Date(aiInsight.generatedAt).toLocaleString()}
                  </span>
                </p>
              </div>
            )}
          </section>

          {/* Module 11: Printable & Downloadable Predictive Quality Report */}
          <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Consolidated Predictive Quality Risk Report
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Downloadable CSV & print-ready summary covering products, processes, batches, forecasts, alerts, and preventive actions
                </p>
              </div>
              <div className="flex items-center gap-2 print:hidden">
                <button
                  type="button"
                  onClick={handleExportReportCsv}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Download CSV Report</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#0B1426] rounded-md hover:bg-slate-800"
                >
                  <Printer className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                  <span>Print / Save PDF</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              <div>
                <h3 className="font-semibold text-slate-900 mb-2">
                  High & Medium-Risk Products ({productRisks.filter((p) => p.riskLevel !== 'LOW').length})
                </h3>
                <ul className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                  {productRisks
                    .filter((p) => p.riskLevel !== 'LOW')
                    .map((p) => (
                      <li key={p.productId} className="p-2.5 flex items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-900">{p.productName}</p>
                          <p className="text-[11px] text-slate-500">
                            {p.mainRiskFactors[0]}
                          </p>
                        </div>
                        <RiskTierText tier={p.riskLevel} score={p.riskScore} />
                      </li>
                    ))}
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 mb-2">
                  Elevated Manufacturing Processes & Forecasts
                </h3>
                <ul className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                  {processRisks
                    .filter((pr) => pr.riskScore !== null && pr.riskScore >= 40)
                    .map((pr) => (
                      <li key={pr.processName} className="p-2.5 flex items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-900">{pr.processName}</p>
                          <p className="text-[11px] text-slate-500">
                            {pr.complaintCount} complaints · {pr.trendDirection}
                          </p>
                        </div>
                        <RiskTierText
                          tier={pr.riskLevel === 'INSUFFICIENT DATA' ? 'LOW' : pr.riskLevel}
                          score={pr.riskScore ?? 0}
                        />
                      </li>
                    ))}
                </ul>

                {forecast.sufficientData && (
                  <div className="mt-4 border border-slate-200 rounded-md p-3 space-y-1">
                    <p className="font-semibold text-slate-900">
                      Complaint Volume Forecast ({forecast.methodLabel})
                    </p>
                    {forecast.horizons.map((h) => (
                      <p key={h.horizonLabel} className="font-mono tabular-nums text-slate-700">
                        {h.horizonLabel}: <strong>{h.predictedTotal}</strong> complaints (Range{' '}
                        {h.lowerBoundTotal}–{h.upperBoundTotal})
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs pt-2 border-t border-slate-200">
              <div>
                <h3 className="font-semibold text-slate-900 mb-2">
                  Priority Batches Requiring Inspection ({batchRisks.filter((b) => b.riskLevel === 'HIGH' || b.assessmentStatus === 'Confirmed Defect History').length})
                </h3>
                <ul className="space-y-1.5 text-slate-700">
                  {batchRisks
                    .filter(
                      (b) =>
                        b.riskLevel === 'HIGH' || b.assessmentStatus === 'Confirmed Defect History'
                    )
                    .slice(0, 6)
                    .map((b) => (
                      <li key={`${b.batchNumber}-${b.productId}`}>
                        <span className="font-mono font-semibold">{b.batchNumber}</span> (
                        {b.productName}) — {b.assessmentStatus} ({b.riskScore ?? 'N/A'}/100)
                      </li>
                    ))}
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 mb-2">
                  Active Predictive Alerts ({openAlertsCount}) & Preventive Plans ({activePlansCount})
                </h3>
                <ul className="space-y-1.5 text-slate-700">
                  {alerts
                    .filter((a) => a.status !== 'Resolved')
                    .slice(0, 5)
                    .map((a) => (
                      <li key={a.id}>
                        <span className="font-mono font-semibold">{a.id}</span> [{a.alertType}] —{' '}
                        {a.targetEntity} ({a.status})
                      </li>
                    ))}
                </ul>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Drill-Down Detail Drawer */}
      <PredictiveEntityDetailModal
        selection={detailSelection}
        onClose={() => setDetailSelection(null)}
        onNavigate={onNavigate}
      />
    </div>
  );
}
