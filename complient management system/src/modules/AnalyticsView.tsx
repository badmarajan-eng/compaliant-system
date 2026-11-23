import { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Download,
  FilterX,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AnalyticsCorrelationLab } from '../components/AnalyticsCorrelationLab';
import {
  AnalyticsDrilldownDrawer,
  type DrilldownContext,
} from '../components/AnalyticsDrilldownDrawer';
import { requestTrendExplanation } from '../services/aiClient';
import type { AITrendExplanation, ComplaintRecord, ModuleId } from '../types/qms';
import { ALL_CATEGORIES, ALL_SEVERITIES } from '../utils/qmsAnalytics';
import {
  applyAnalyticsFilters,
  computeAnalyticsDashboardKpis,
  computeBatchAnalytics,
  computeBeforeAfterCapaStats,
  computeCategoryTimeTrends,
  computeCustomerAnalytics,
  computeParameterCorrelations,
  computeParetoAnalysis,
  computeProcessAnalytics,
  computeProductAnalytics,
  computeProductTimeTrends,
  computeQualityHeatmap,
  computeTimeTrends,
  DEFAULT_ANALYTICS_FILTERS,
  detectRecurringDefects,
  exportAnalyticsDatasetCsv,
  STANDARD_PROCESS_FAMILIES,
  type AnalyticsFilterState,
  type DefectPatternClassification,
  type HeatmapMode,
} from '../utils/patternAnalytics';

interface AnalyticsViewProps {
  complaints: ComplaintRecord[];
  onNavigate?: (module: ModuleId, complaintId?: string) => void;
}

type AnalyticsTabId =
  | 'pareto'
  | 'entities'
  | 'process-heatmap'
  | 'recurring'
  | 'correlation'
  | 'time-trends'
  | 'ai-insights';

const SERIES_COLORS = ['#0f172a', '#0891b2', '#d97706', '#dc2626', '#0284c7', '#475569', '#059669'];

export function AnalyticsView({ complaints, onNavigate }: AnalyticsViewProps) {
  const [activeTab, setActiveTab] = useState<AnalyticsTabId>('pareto');
  const [filters, setFilters] = useState<AnalyticsFilterState>(DEFAULT_ANALYTICS_FILTERS);

  // Sub-controls
  const [paretoDim, setParetoDim] = useState<'category' | 'product' | 'process'>('category');
  const [batchRepeatedOnly, setBatchRepeatedOnly] = useState(false);
  const [batchSearch, setBatchSearch] = useState('');
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>('product-category');
  const [observationDays, setObservationDays] = useState<number | null>(null);
  const [chronicThreshold, setChronicThreshold] = useState<number>(3);
  const [patternClassFilter, setPatternClassFilter] = useState<
    'ALL' | DefectPatternClassification
  >('ALL');
  const [timeGranularity, setTimeGranularity] = useState<'monthly' | 'quarterly' | 'yearly'>(
    'monthly'
  );

  // Drill-down & AI state
  const [drilldown, setDrilldown] = useState<DrilldownContext | null>(null);
  const [aiInsights, setAiInsights] = useState<AITrendExplanation | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Filter dropdown options derived from full dataset
  const filterOptions = useMemo(() => {
    const products = Array.from(new Set(complaints.map((c) => c.productName))).sort();
    const customers = Array.from(new Set(complaints.map((c) => c.customerName))).sort();
    const batches = Array.from(new Set(complaints.map((c) => c.batchNumber))).sort();
    const processes = Array.from(new Set(complaints.map((c) => c.processName))).sort();
    return { products, customers, batches, processes };
  }, [complaints]);

  const filtered = useMemo(
    () => applyAnalyticsFilters(complaints, filters),
    [complaints, filters]
  );

  const recurringPatterns = useMemo(
    () =>
      detectRecurringDefects(filtered, {
        observationDays,
        chronicThreshold,
      }),
    [filtered, observationDays, chronicThreshold]
  );

  const recurringAndChronicCount = useMemo(
    () => recurringPatterns.filter((p) => p.classification !== 'New Problem').length,
    [recurringPatterns]
  );

  const kpis = useMemo(
    () => computeAnalyticsDashboardKpis(filtered, recurringAndChronicCount),
    [filtered, recurringAndChronicCount]
  );

  const productRows = useMemo(() => computeProductAnalytics(filtered), [filtered]);
  const batchRows = useMemo(() => computeBatchAnalytics(filtered), [filtered]);
  const customerRows = useMemo(() => computeCustomerAnalytics(filtered), [filtered]);
  const processRows = useMemo(() => computeProcessAnalytics(filtered), [filtered]);
  const paretoRows = useMemo(
    () => computeParetoAnalysis(filtered, paretoDim),
    [filtered, paretoDim]
  );
  const correlation = useMemo(() => computeParameterCorrelations(filtered), [filtered]);
  const heatmap = useMemo(
    () => computeQualityHeatmap(filtered, heatmapMode),
    [filtered, heatmapMode]
  );
  const timeTrends = useMemo(
    () => computeTimeTrends(filtered, timeGranularity),
    [filtered, timeGranularity]
  );
  const categoryTrends = useMemo(() => computeCategoryTimeTrends(filtered), [filtered]);
  const productTrends = useMemo(() => computeProductTimeTrends(filtered, 5), [filtered]);
  const beforeAfterCapas = useMemo(() => computeBeforeAfterCapaStats(filtered), [filtered]);

  const filteredBatchRows = useMemo(() => {
    const q = batchSearch.trim().toLowerCase();
    return batchRows.filter((b) => {
      if (batchRepeatedOnly && !b.isRepeated) return false;
      if (
        q &&
        !b.batchNumber.toLowerCase().includes(q) &&
        !b.productName.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [batchRows, batchRepeatedOnly, batchSearch]);

  const filteredPatterns = useMemo(() => {
    if (patternClassFilter === 'ALL') return recurringPatterns;
    return recurringPatterns.filter((p) => p.classification === patternClassFilter);
  }, [recurringPatterns, patternClassFilter]);

  const standardProcessCounts = useMemo(() => {
    return STANDARD_PROCESS_FAMILIES.map((family) => {
      const matching = processRows.filter((r) => r.standardFamily === family);
      return {
        family,
        count: matching.reduce((acc, r) => acc + r.complaintCount, 0),
        critical: matching.reduce((acc, r) => acc + r.criticalCount, 0),
      };
    });
  }, [processRows]);

  const hasActiveFilters = useMemo(() => {
    return (
      filters.startDate !== '' ||
      filters.endDate !== '' ||
      filters.productName !== 'ALL' ||
      filters.customerName !== 'ALL' ||
      filters.batchNumber !== 'ALL' ||
      filters.category !== 'ALL' ||
      filters.severity !== 'ALL' ||
      filters.processName !== 'ALL'
    );
  }, [filters]);

  const handleGenerateAiInsights = async () => {
    setAiLoading(true);
    setAiError(null);
    setActiveTab('ai-insights');
    try {
      const res = await requestTrendExplanation({
        filterScope: filters,
        kpis,
        paretoCategoryTop: computeParetoAnalysis(filtered, 'category'),
        topProducts: productRows.slice(0, 8).map((p) => ({
          productId: p.productId,
          productName: p.productName,
          totalComplaints: p.totalComplaints,
          criticalComplaints: p.criticalComplaints,
          mostCommonDefect: p.mostCommonDefect,
          trendDirection: p.trendDirection,
          riskLevel: p.riskLevel,
        })),
        processSummary: processRows.map((pr) => ({
          processName: pr.processName,
          standardFamily: pr.standardFamily,
          complaintCount: pr.complaintCount,
          criticalCount: pr.criticalCount,
          verifiedRootCauses: pr.verifiedRootCauses,
          riskTier: pr.riskTier,
        })),
        recurringAndChronicPatterns: recurringPatterns
          .filter((p) => p.classification !== 'New Problem')
          .slice(0, 12)
          .map((p) => ({
            patternTitle: p.patternTitle,
            classification: p.classification,
            occurrences: p.occurrences,
            firstOccurrence: p.firstOccurrence,
            mostRecentOccurrence: p.mostRecentOccurrence,
            relatedComplaintIds: p.relatedComplaintIds,
            verifiedRootCauses: p.verifiedRootCauses,
          })),
        correlationHighlights: correlation.severityCorrelations.map((c) => ({
          parameter: c.labelX,
          sampleSize: c.sampleSize,
          missingCount: c.missingCount,
          pearsonR: c.pearsonR,
          spearmanRho: c.spearmanRho,
          status: c.status,
          strengthLabel: c.strengthLabel,
        })),
        monthlyTrends: computeTimeTrends(filtered, 'monthly'),
        beforeAfterCapas: beforeAfterCapas.slice(0, 8),
      });
      setAiInsights(res);
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : 'Unable to generate AI analytical insights.'
      );
    } finally {
      setAiLoading(false);
    }
  };

  const handleExportCsv = () => {
    exportAnalyticsDatasetCsv(
      filtered,
      productRows,
      batchRows,
      processRows,
      paretoRows,
      recurringPatterns
    );
  };

  const TABS: Array<{ id: AnalyticsTabId; label: string }> = [
    { id: 'pareto', label: 'Pareto (80/20)' },
    { id: 'entities', label: 'Product · Batch · Customer' },
    { id: 'process-heatmap', label: 'Process & Heatmaps' },
    { id: 'recurring', label: 'Recurring & Chronic' },
    { id: 'correlation', label: 'Correlation Lab' },
    { id: 'time-trends', label: 'Time & CAPA Trends' },
    { id: 'ai-insights', label: 'AI Insights' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Action Header & Global 7-Dimension Filter Bar (Modules 1 & 12) */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-700" aria-hidden="true" />
              <h2 className="text-base font-bold text-slate-900">
                Quality Analytics — Historical Trend &amp; Pattern Engine
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Live analytical intelligence computed from {complaints.length} stored records · Showing{' '}
              <span className="font-mono tabular-nums font-semibold text-slate-800">
                {filtered.length}
              </span>{' '}
              matching complaint(s)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => setFilters(DEFAULT_ANALYTICS_FILTERS)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                <span>Reset Filters</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-cyan-700" aria-hidden="true" />
              <span>Export Analytics CSV</span>
            </button>

            <button
              type="button"
              onClick={handleGenerateAiInsights}
              disabled={aiLoading || filtered.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#0B1426] rounded-md hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
              <span>{aiLoading ? 'Synthesizing Insights...' : 'Generate AI Insights'}</span>
            </button>
          </div>
        </div>

        {/* 8-control Filter Matrix */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2.5 pt-3 border-t border-slate-100">
          <label className="text-[11px] text-slate-500 space-y-1">
            <span className="block font-medium text-slate-700">From Date</span>
            <input
              type="date"
              aria-label="Filter from date"
              value={filters.startDate}
              onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-800 font-mono"
            />
          </label>

          <label className="text-[11px] text-slate-500 space-y-1">
            <span className="block font-medium text-slate-700">To Date</span>
            <input
              type="date"
              aria-label="Filter to date"
              value={filters.endDate}
              onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-800 font-mono"
            />
          </label>

          <label className="text-[11px] text-slate-500 space-y-1">
            <span className="block font-medium text-slate-700">Product</span>
            <select
              aria-label="Filter by product"
              value={filters.productName}
              onChange={(e) => setFilters((f) => ({ ...f, productName: e.target.value }))}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-800"
            >
              <option value="ALL">All Products</option>
              {filterOptions.products.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <label className="text-[11px] text-slate-500 space-y-1">
            <span className="block font-medium text-slate-700">Customer</span>
            <select
              aria-label="Filter by customer"
              value={filters.customerName}
              onChange={(e) => setFilters((f) => ({ ...f, customerName: e.target.value }))}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-800"
            >
              <option value="ALL">All Customers</option>
              {filterOptions.customers.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="text-[11px] text-slate-500 space-y-1">
            <span className="block font-medium text-slate-700">Batch</span>
            <select
              aria-label="Filter by batch"
              value={filters.batchNumber}
              onChange={(e) => setFilters((f) => ({ ...f, batchNumber: e.target.value }))}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-800 font-mono"
            >
              <option value="ALL">All Batches</option>
              {filterOptions.batches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>

          <label className="text-[11px] text-slate-500 space-y-1">
            <span className="block font-medium text-slate-700">Category</span>
            <select
              aria-label="Filter by category"
              value={filters.category}
              onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-800"
            >
              <option value="ALL">All Categories</option>
              {ALL_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </label>

          <label className="text-[11px] text-slate-500 space-y-1">
            <span className="block font-medium text-slate-700">Severity</span>
            <select
              aria-label="Filter by severity"
              value={filters.severity}
              onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value }))}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-800"
            >
              <option value="ALL">All Severities</option>
              {ALL_SEVERITIES.map((sev) => (
                <option key={sev} value={sev}>
                  {sev}
                </option>
              ))}
            </select>
          </label>

          <label className="text-[11px] text-slate-500 space-y-1">
            <span className="block font-medium text-slate-700">Process</span>
            <select
              aria-label="Filter by manufacturing process"
              value={filters.processName}
              onChange={(e) => setFilters((f) => ({ ...f, processName: e.target.value }))}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-800"
            >
              <option value="ALL">All Processes</option>
              {filterOptions.processes.map((pr) => (
                <option key={pr} value={pr}>
                  {pr}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Module 1: 7 Dynamic Portfolio KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <p className="text-[11px] font-medium text-slate-500">Complaints Analyzed</p>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            {kpis.totalComplaints}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Filtered cohort</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <p className="text-[11px] font-medium text-slate-500">Products Affected</p>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            {kpis.productsAffected}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Distinct SKUs</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <p className="text-[11px] font-medium text-slate-500">Processes Affected</p>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            {kpis.processesAffected}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Manufacturing lines</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <p className="text-[11px] font-medium text-slate-500">Recurring Defects</p>
          <p className="text-2xl font-bold text-cyan-800 font-mono tabular-nums mt-1">
            {kpis.recurringDefectsCount}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Recurring + Chronic</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <p className="text-[11px] font-medium text-slate-500">Top Category</p>
          <p className="text-xs font-bold text-slate-900 mt-1.5 truncate" title={kpis.topComplaintCategory?.name}>
            {kpis.topComplaintCategory?.name ?? '—'}
          </p>
          <p className="text-[11px] font-mono tabular-nums text-cyan-800 mt-1">
            {kpis.topComplaintCategory ? `${kpis.topComplaintCategory.count} incident(s)` : 'No data'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <p className="text-[11px] font-medium text-slate-500">Most Affected Product</p>
          <p className="text-xs font-bold text-slate-900 mt-1.5 truncate" title={kpis.mostAffectedProduct?.name}>
            {kpis.mostAffectedProduct?.name ?? '—'}
          </p>
          <p className="text-[11px] font-mono tabular-nums text-cyan-800 mt-1">
            {kpis.mostAffectedProduct ? `${kpis.mostAffectedProduct.count} complaint(s)` : 'No data'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <p className="text-[11px] font-medium text-slate-500">Most Affected Process</p>
          <p className="text-xs font-bold text-slate-900 mt-1.5 truncate" title={kpis.mostAffectedProcess?.name}>
            {kpis.mostAffectedProcess?.name ?? '—'}
          </p>
          <p className="text-[11px] font-mono tabular-nums text-cyan-800 mt-1">
            {kpis.mostAffectedProcess ? `${kpis.mostAffectedProcess.count} associated` : 'No data'}
          </p>
        </div>
      </div>

      {/* Empty Filter State */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center space-y-3">
          <FilterX className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
          <h3 className="text-base font-semibold text-slate-900">
            No Complaints Match Selected Filters
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Adjust the date range or dimension filters above to inspect historical and live quality patterns.
          </p>
          <button
            type="button"
            onClick={() => setFilters(DEFAULT_ANALYTICS_FILTERS)}
            className="px-4 py-2 text-xs font-medium text-white bg-cyan-700 rounded-md hover:bg-cyan-800"
          >
            Reset All Filters
          </button>
        </div>
      ) : (
        <>
          {/* Workspace Sub-Navigation Tabs */}
          <div className="bg-white border border-slate-200 rounded-lg p-1.5 flex items-center gap-1 overflow-x-auto">
            {TABS.map((t) => {
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#0B1426] text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* TAB 1: PARETO ANALYSIS (80/20 RULE) */}
          {activeTab === 'pareto' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">
                      Pareto Analysis (80/20 Rule) — Major Complaint Contributors
                    </h3>
                    <p className="text-xs text-slate-500">
                      Sorted descending by actual complaint count with cumulative share curve and 80% threshold
                    </p>
                  </div>

                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
                    {(['category', 'product', 'process'] as const).map((dim) => (
                      <button
                        key={dim}
                        type="button"
                        onClick={() => setParetoDim(dim)}
                        className={`px-3 py-1 text-xs font-medium rounded capitalize transition-colors ${
                          paretoDim === dim
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        By {dim}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={paretoRows}
                      margin={{ top: 12, right: 16, left: -10, bottom: 28 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 10, fill: '#475569' }}
                        interval={0}
                        angle={-15}
                        textAnchor="end"
                        height={54}
                      />
                      <YAxis
                        yAxisId="left"
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: '#475569' }}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        domain={[0, 100]}
                        unit="%"
                        tick={{ fontSize: 11, fill: '#0891b2' }}
                      />
                      <Tooltip
                        contentStyle={{ fontSize: '12px', borderRadius: '6px' }}
                        formatter={(val, name) =>
                          name === 'Cumulative %' ? [`${val}%`, name] : [val, name]
                        }
                      />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <ReferenceLine
                        yAxisId="right"
                        y={80}
                        stroke="#dc2626"
                        strokeDasharray="4 4"
                        label={{
                          value: '80% Cutoff',
                          position: 'insideTopRight',
                          fill: '#dc2626',
                          fontSize: 11,
                        }}
                      />
                      <Bar
                        yAxisId="left"
                        dataKey="count"
                        name="Complaint Count"
                        radius={[4, 4, 0, 0]}
                      >
                        {paretoRows.map((entry, idx) => (
                          <Cell
                            key={idx}
                            fill={entry.isVitalFew80 ? '#0891b2' : '#94a3b8'}
                          />
                        ))}
                      </Bar>
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="cumulativePercent"
                        name="Cumulative %"
                        stroke="#0f172a"
                        strokeWidth={2.5}
                        dot={{ r: 3.5, fill: '#0f172a' }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-5 overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-3 font-medium">Rank</th>
                        <th className="py-2 pr-3 font-medium capitalize">{paretoDim}</th>
                        <th className="py-2 pr-3 font-medium text-right">Complaint Count</th>
                        <th className="py-2 pr-3 font-medium text-right">Contribution %</th>
                        <th className="py-2 pr-3 font-medium text-right">Cumulative %</th>
                        <th className="py-2 font-medium">Pareto Classification</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paretoRows.map((row, idx) => (
                        <tr
                          key={row.name}
                          className={row.isVitalFew80 ? 'bg-cyan-50/40' : undefined}
                        >
                          <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-500">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 pr-3 font-medium text-slate-900">{row.name}</td>
                          <td className="py-2.5 pr-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                            {row.count}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-slate-700">
                            {row.percentage}%
                          </td>
                          <td className="py-2.5 pr-3 text-right font-mono tabular-nums font-semibold text-cyan-800">
                            {row.cumulativePercent}%
                          </td>
                          <td className="py-2.5">
                            {row.isVitalFew80 ? (
                              <span className="font-semibold text-cyan-800">
                                Vital Few Contributor (≤80%)
                              </span>
                            ) : (
                              <span className="text-slate-500">Secondary Contributor</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PRODUCT, BATCH & CUSTOMER-WISE ANALYSIS (MODULES 2, 3, 4) */}
          {activeTab === 'entities' && (
            <div className="space-y-6">
              {/* Module 2: Top 10 Products Horizontal Bar Chart + Table */}
              <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">
                      Product-Wise Complaint Frequency (Top 10)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Click any product row below to inspect its complete complaint history
                    </p>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-slate-500">
                    {productRows.length} product(s) in cohort
                  </span>
                </div>

                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={productRows.slice(0, 10)}
                      layout="vertical"
                      margin={{ top: 4, right: 20, left: 10, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis
                        type="category"
                        dataKey="productName"
                        width={190}
                        tick={{ fontSize: 11, fill: '#334155' }}
                      />
                      <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '6px' }} />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Bar
                        dataKey="totalComplaints"
                        name="Total Complaints"
                        fill="#0891b2"
                        radius={[0, 4, 4, 0]}
                        onClick={(entry) => {
                          const data = (
                            entry as unknown as {
                              payload?: { productName?: string };
                              productName?: string;
                            }
                          );
                          const name = data?.payload?.productName ?? data?.productName;
                          if (name) {
                            const found = productRows.find((r) => r.productName === name);
                            if (found) {
                              setDrilldown({
                                title: `${found.productName} (${found.productId})`,
                                subtitle: `${found.totalComplaints} complaint(s) · Risk: ${found.riskLevel} (${found.riskScore}/100)`,
                                complaints: found.complaints,
                              });
                            }
                          }
                        }}
                        className="cursor-pointer"
                      />
                      <Bar
                        dataKey="criticalComplaints"
                        name="Critical"
                        fill="#dc2626"
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-3 font-medium">Product ID</th>
                        <th className="py-2 pr-3 font-medium">Product Name</th>
                        <th className="py-2 pr-3 font-medium text-right">Total</th>
                        <th className="py-2 pr-3 font-medium text-right">Critical</th>
                        <th className="py-2 pr-3 font-medium">Most Common Defect</th>
                        <th className="py-2 pr-3 font-medium text-right">Affected Batches</th>
                        <th className="py-2 pr-3 font-medium">Complaint Trend</th>
                        <th className="py-2 font-medium">Risk Level</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {productRows.map((p) => (
                        <tr
                          key={p.productName}
                          onClick={() =>
                            setDrilldown({
                              title: `${p.productName} (${p.productId})`,
                              subtitle: `${p.totalComplaints} complaint(s) · Most common: ${p.mostCommonDefect}`,
                              complaints: p.complaints,
                            })
                          }
                          className="hover:bg-cyan-50/50 cursor-pointer transition-colors"
                        >
                          <td className="py-2.5 pr-3 font-mono text-slate-600">{p.productId}</td>
                          <td className="py-2.5 pr-3 font-semibold text-cyan-900 underline decoration-cyan-200 underline-offset-2">
                            {p.productName}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-mono tabular-nums font-bold text-slate-900">
                            {p.totalComplaints}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-red-700 font-semibold">
                            {p.criticalComplaints}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-700">{p.mostCommonDefect}</td>
                          <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-slate-700">
                            {p.affectedBatchesCount}
                          </td>
                          <td className="py-2.5 pr-3">
                            <span
                              className={
                                p.trendDirection === 'Increasing'
                                  ? 'text-red-700 font-medium'
                                  : p.trendDirection === 'Improving'
                                    ? 'text-emerald-700 font-medium'
                                    : 'text-slate-600'
                              }
                            >
                              {p.trendDirection}
                            </span>
                            <span className="text-slate-400 ml-1 font-mono text-[11px]">
                              ({p.trendDetail})
                            </span>
                          </td>
                          <td className="py-2.5 font-mono font-semibold">
                            <span
                              className={
                                p.riskLevel === 'HIGH'
                                  ? 'text-red-700'
                                  : p.riskLevel === 'MEDIUM'
                                    ? 'text-amber-700'
                                    : 'text-emerald-700'
                              }
                            >
                              {p.riskLevel} ({p.riskScore})
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Module 3: Batch-Wise Analysis */}
              <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">
                      Batch-Wise Defect &amp; Recurrence Analysis
                    </h3>
                    <p className="text-xs text-slate-500">
                      Highlights manufacturing batches with repeated complaints; verified root causes are separated from unverified AI hypotheses
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={batchSearch}
                      onChange={(e) => setBatchSearch(e.target.value)}
                      placeholder="Filter batch or product..."
                      className="px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-800"
                    />
                    <button
                      type="button"
                      onClick={() => setBatchRepeatedOnly((v) => !v)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                        batchRepeatedOnly
                          ? 'bg-cyan-700 text-white border-cyan-700'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {batchRepeatedOnly ? 'Showing Repeated Batches (≥2)' : 'Repeated Batches Only'}
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-[380px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-3 font-medium">Batch Number</th>
                        <th className="py-2 pr-3 font-medium">Product</th>
                        <th className="py-2 pr-3 font-medium text-right">Total</th>
                        <th className="py-2 pr-3 font-medium">Defect Categories</th>
                        <th className="py-2 pr-3 font-medium">Mfg Date</th>
                        <th className="py-2 pr-3 font-medium">Process</th>
                        <th className="py-2 pr-3 font-medium">Recorded Root Causes</th>
                        <th className="py-2 font-medium text-right">Share</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredBatchRows.map((b) => (
                        <tr
                          key={b.batchNumber}
                          onClick={() =>
                            setDrilldown({
                              title: `Batch ${b.batchNumber}`,
                              subtitle: `${b.productName} · Mfg Date ${b.manufacturingDate} · ${b.processName}`,
                              complaints: b.complaints,
                            })
                          }
                          className={`cursor-pointer transition-colors ${
                            b.isRepeated
                              ? 'bg-amber-50/60 hover:bg-amber-100/60'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-2.5 pr-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {b.batchNumber}
                            {b.isRepeated && (
                              <span className="block text-[10px] font-sans font-semibold text-amber-800">
                                Repeated Batch
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-800">{b.productName}</td>
                          <td className="py-2.5 pr-3 text-right font-mono tabular-nums font-bold text-slate-900">
                            {b.totalComplaints}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-700">
                            {b.defectCategories.join(', ')}
                          </td>
                          <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                            {b.manufacturingDate}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-700">{b.processName}</td>
                          <td className="py-2.5 pr-3 max-w-xs">
                            {b.verifiedRootCauses.length > 0 ? (
                              <span className="text-emerald-800 font-medium">
                                Verified: {b.verifiedRootCauses.join('; ')}
                              </span>
                            ) : b.aiHypothesesOnlyCount > 0 ? (
                              <span className="text-slate-500">
                                {b.aiHypothesesOnlyCount} unverified AI lead(s) only
                              </span>
                            ) : (
                              <span className="text-slate-400">Not investigated</span>
                            )}
                          </td>
                          <td className="py-2.5 text-right font-mono tabular-nums text-slate-700">
                            {b.complaintFrequencyShare}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Module 4: Customer-Wise Analysis */}
              <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Customer-Wise Complaint Comparison
                  </h3>
                  <p className="text-xs text-slate-500">
                    Volume, critical share, affected SKUs, and monthly complaint frequency per OEM account
                  </p>
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={customerRows}
                      margin={{ top: 8, right: 16, left: -14, bottom: 28 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="customerName"
                        tick={{ fontSize: 10, fill: '#475569' }}
                        interval={0}
                        angle={-15}
                        textAnchor="end"
                        height={52}
                      />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                      <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '6px' }} />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Bar
                        dataKey="totalComplaints"
                        name="Total Complaints"
                        fill="#0f172a"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="criticalComplaints"
                        name="Critical"
                        fill="#dc2626"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-3 font-medium">Customer Name</th>
                        <th className="py-2 pr-3 font-medium text-right">Total</th>
                        <th className="py-2 pr-3 font-medium">Most Reported Defect</th>
                        <th className="py-2 pr-3 font-medium">Affected Products</th>
                        <th className="py-2 pr-3 font-medium text-right">Critical</th>
                        <th className="py-2 font-medium text-right">Monthly Freq.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {customerRows.map((c) => (
                        <tr
                          key={c.customerName}
                          onClick={() =>
                            setDrilldown({
                              title: c.customerName,
                              subtitle: `${c.totalComplaints} complaint(s) · ${c.monthlyFrequency}/month average`,
                              complaints: c.complaints,
                            })
                          }
                          className="hover:bg-cyan-50/40 cursor-pointer transition-colors"
                        >
                          <td className="py-2.5 pr-3 font-semibold text-cyan-900 underline decoration-cyan-200 underline-offset-2">
                            {c.customerName}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-mono tabular-nums font-bold text-slate-900">
                            {c.totalComplaints}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-700">{c.mostReportedDefect}</td>
                          <td className="py-2.5 pr-3 text-slate-600 max-w-xs truncate" title={c.affectedProducts.join(', ')}>
                            {c.affectedProducts.join(', ')}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-red-700 font-semibold">
                            {c.criticalComplaints}
                          </td>
                          <td className="py-2.5 text-right font-mono tabular-nums text-slate-800">
                            {c.monthlyFrequency} / mo
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PROCESS-WISE ANALYSIS & QUALITY HEATMAPS (MODULES 5 & 9) */}
          {activeTab === 'process-heatmap' && (
            <div className="space-y-6">
              {/* Non-causation guardrail */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3 text-xs text-amber-950">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="font-semibold">
                    Process Association Notice
                  </p>
                  <p className="text-amber-900 mt-0.5">
                    Complaints associated with a manufacturing process indicate where affected parts originated, not automatic proof that the process caused the defect. Always inspect Verified Root Causes separately from unverified AI hypotheses.
                  </p>
                </div>
              </div>

              {/* Process-Wise Comparison Chart & Standard Process Coverage */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-5">
                  <h3 className="text-base font-semibold text-slate-900">
                    Process-Wise Complaint Association
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">
                    Total and critical complaints associated with each manufacturing process
                  </p>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={processRows}
                        layout="vertical"
                        margin={{ top: 4, right: 20, left: 10, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                        <YAxis
                          type="category"
                          dataKey="processName"
                          width={185}
                          tick={{ fontSize: 11, fill: '#334155' }}
                        />
                        <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '6px' }} />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        <Bar dataKey="complaintCount" name="Associated Complaints" fill="#0f172a" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="criticalCount" name="Critical" fill="#dc2626" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-lg p-5">
                  <h3 className="text-base font-semibold text-slate-900">
                    Standard Process Family Mapping
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">
                    Coverage across the 7 core industrial process categories
                  </p>
                  <div className="divide-y divide-slate-100 text-xs">
                    {standardProcessCounts.map((sp) => (
                      <div key={sp.family} className="py-2.5 flex items-center justify-between">
                        <span className="font-medium text-slate-800">{sp.family}</span>
                        <span className="font-mono tabular-nums text-slate-700">
                          <strong className="text-slate-900">{sp.count}</strong> total
                          {sp.critical > 0 && (
                            <span className="text-red-700 ml-1.5">({sp.critical} crit)</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Detailed Process Table */}
              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <h3 className="text-base font-semibold text-slate-900 mb-3">
                  Process Association &amp; Verified Root Cause Breakdown
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-3 font-medium">Process Name</th>
                        <th className="py-2 pr-3 font-medium">Family</th>
                        <th className="py-2 pr-3 font-medium text-right">Count</th>
                        <th className="py-2 pr-3 font-medium">Defect Categories</th>
                        <th className="py-2 pr-3 font-medium">Affected Products</th>
                        <th className="py-2 pr-3 font-medium text-right">Batches</th>
                        <th className="py-2 pr-3 font-medium">Verified Root Causes</th>
                        <th className="py-2 font-medium">Risk Indicator</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {processRows.map((pr) => (
                        <tr
                          key={pr.processName}
                          onClick={() =>
                            setDrilldown({
                              title: pr.processName,
                              subtitle: `Process Family: ${pr.standardFamily} · ${pr.complaintCount} associated complaint(s)`,
                              complaints: pr.complaints,
                            })
                          }
                          className="hover:bg-cyan-50/40 cursor-pointer transition-colors"
                        >
                          <td className="py-2.5 pr-3 font-semibold text-cyan-900 underline decoration-cyan-200 underline-offset-2">
                            {pr.processName}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-600 whitespace-nowrap">
                            {pr.standardFamily}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-mono tabular-nums font-bold text-slate-900">
                            {pr.complaintCount}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-700">
                            {pr.defectCategories.join(', ')}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-600 max-w-[200px] truncate" title={pr.affectedProducts.join(', ')}>
                            {pr.affectedProducts.join(', ')}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-slate-700">
                            {pr.affectedBatches.length}
                          </td>
                          <td className="py-2.5 pr-3 max-w-xs">
                            {pr.verifiedRootCauses.length > 0 ? (
                              <span className="text-emerald-800 font-medium">
                                {pr.verifiedRootCauses.join('; ')}
                              </span>
                            ) : (
                              <span className="text-slate-400">
                                None verified ({pr.aiSuggestedCount} AI leads)
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 font-mono font-semibold whitespace-nowrap">
                            <span
                              className={
                                pr.riskTier === 'HIGH'
                                  ? 'text-red-700'
                                  : pr.riskTier === 'MEDIUM'
                                    ? 'text-amber-700'
                                    : 'text-emerald-700'
                              }
                            >
                              {pr.riskTier} ({pr.riskScore})
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Module 9: Multi-Mode Interactive Quality Heatmap */}
              <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">
                      Multi-Dimensional Quality Concentration Heatmap
                    </h3>
                    <p className="text-xs text-slate-500">
                      Cells with ≥ 2 repeated complaints are outlined · Click any populated cell to inspect matching complaints
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md">
                    {(
                      [
                        { id: 'product-category', label: 'Product × Category' },
                        { id: 'process-category', label: 'Process × Category' },
                        { id: 'batch-category', label: 'Batch × Category' },
                        { id: 'product-process', label: 'Product × Process' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setHeatmapMode(m.id)}
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                          heatmapMode === m.id
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums">
                  <span>Repeated Cluster Cells (≥ 2 incidents): {heatmap.repeatedClusterCount}</span>
                  <span>Peak Cell Count: {heatmap.maxCellCount}</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-600">
                        <th className="py-2 pr-4 text-left font-medium min-w-[190px]">
                          {heatmap.rowTitle}
                        </th>
                        {heatmap.colLabels.map((col) => (
                          <th
                            key={col}
                            className="py-2 px-2 text-center font-medium min-w-[105px]"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {heatmap.rows.map((row) => (
                        <tr key={row.rowLabel}>
                          <td className="py-2 pr-4 font-medium text-slate-900 whitespace-nowrap">
                            {row.rowLabel}
                          </td>
                          {row.cells.map((cell) => {
                            const ratio = cell.count / heatmap.maxCellCount;
                            const bgClass =
                              cell.count === 0
                                ? 'bg-slate-50 text-slate-300'
                                : ratio >= 0.75
                                  ? 'bg-cyan-800 text-white font-semibold'
                                  : ratio >= 0.45
                                    ? 'bg-cyan-600 text-white font-semibold'
                                    : ratio >= 0.2
                                      ? 'bg-cyan-200 text-cyan-950 font-medium'
                                      : 'bg-cyan-50 text-cyan-900';
                            const repeatedRing =
                              cell.count >= 2 ? 'ring-1 ring-amber-500' : '';

                            return (
                              <td key={cell.colLabel} className="p-1 text-center">
                                <button
                                  type="button"
                                  disabled={cell.count === 0}
                                  onClick={() => {
                                    const matched = filtered.filter((c) =>
                                      cell.complaintIds.includes(c.id)
                                    );
                                    setDrilldown({
                                      title: `${row.rowLabel} × ${cell.colLabel}`,
                                      subtitle: `${cell.count} complaint(s) · ${cell.criticalCount} critical`,
                                      complaints: matched,
                                    });
                                  }}
                                  className={`w-full py-2 rounded font-mono tabular-nums transition-colors ${bgClass} ${repeatedRing} ${
                                    cell.count > 0 ? 'cursor-pointer hover:opacity-90' : 'cursor-default'
                                  }`}
                                >
                                  {cell.count}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: RECURRING & CHRONIC DEFECT DETECTION (MODULE 7) */}
          {activeTab === 'recurring' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">
                      Recurring &amp; Chronic Defect Pattern Detection
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Transparent rules: 1 occurrence = New Problem · 2 to {chronicThreshold - 1} occurrences = Recurring Problem · ≥ {chronicThreshold} occurrences = Chronic Problem (single complaints are never marked chronic)
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <label className="text-xs text-slate-600 flex items-center gap-1.5">
                      <span>Observation Window:</span>
                      <select
                        aria-label="Observation window"
                        value={observationDays === null ? 'ALL' : String(observationDays)}
                        onChange={(e) =>
                          setObservationDays(
                            e.target.value === 'ALL' ? null : Number(e.target.value)
                          )
                        }
                        className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-800"
                      >
                        <option value="ALL">Full History</option>
                        <option value="90">Last 90 Days</option>
                        <option value="180">Last 180 Days</option>
                        <option value="365">Last 365 Days</option>
                      </select>
                    </label>

                    <label className="text-xs text-slate-600 flex items-center gap-1.5">
                      <span>Chronic Threshold (≥):</span>
                      <select
                        aria-label="Chronic threshold"
                        value={String(chronicThreshold)}
                        onChange={(e) => setChronicThreshold(Number(e.target.value))}
                        className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-800 font-mono"
                      >
                        <option value="2">2</option>
                        <option value="3">3 (Default)</option>
                        <option value="4">4</option>
                        <option value="5">5</option>
                      </select>
                    </label>
                  </div>
                </div>

                {/* Classification Filter Tabs */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                  {(
                    ['ALL', 'Chronic Problem', 'Recurring Problem', 'New Problem'] as const
                  ).map((cls) => {
                    const count =
                      cls === 'ALL'
                        ? recurringPatterns.length
                        : recurringPatterns.filter((p) => p.classification === cls).length;
                    return (
                      <button
                        key={cls}
                        type="button"
                        onClick={() => setPatternClassFilter(cls)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                          patternClassFilter === cls
                            ? 'bg-[#0B1426] text-white border-[#0B1426]'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {cls === 'ALL' ? 'All Patterns' : cls} ({count})
                      </button>
                    );
                  })}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-3 font-medium">Defect Pattern</th>
                        <th className="py-2 pr-3 font-medium">Classification</th>
                        <th className="py-2 pr-3 font-medium text-right">Occurrences</th>
                        <th className="py-2 pr-3 font-medium">First → Recent</th>
                        <th className="py-2 pr-3 font-medium">Related Complaint IDs</th>
                        <th className="py-2 pr-3 font-medium">Affected Products &amp; Processes</th>
                        <th className="py-2 font-medium">Previous Corrective Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredPatterns.map((pat) => (
                        <tr
                          key={pat.patternId}
                          onClick={() => {
                            const matched = filtered.filter((c) =>
                              pat.relatedComplaintIds.includes(c.id)
                            );
                            setDrilldown({
                              title: pat.patternTitle,
                              subtitle: `${pat.classification} · ${pat.occurrences} occurrence(s) · Basis: ${pat.matchingDimensions.join(', ')}`,
                              complaints: matched,
                            });
                          }}
                          className="hover:bg-slate-50 cursor-pointer transition-colors"
                        >
                          <td className="py-2.5 pr-3">
                            <p className="font-semibold text-slate-900">{pat.patternTitle}</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {pat.matchingDimensions.join(' · ')}
                            </p>
                          </td>
                          <td className="py-2.5 pr-3 whitespace-nowrap font-semibold">
                            <span
                              className={
                                pat.classification === 'Chronic Problem'
                                  ? 'text-red-700'
                                  : pat.classification === 'Recurring Problem'
                                    ? 'text-amber-700'
                                    : 'text-cyan-800'
                              }
                            >
                              {pat.classification}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3 text-right font-mono tabular-nums font-bold text-slate-900">
                            {pat.occurrences}
                          </td>
                          <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                            {pat.firstOccurrence} → {pat.mostRecentOccurrence}
                          </td>
                          <td className="py-2.5 pr-3 font-mono text-cyan-800 max-w-[180px]">
                            {pat.relatedComplaintIds.join(', ')}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-700 max-w-xs">
                            <p className="font-medium">{pat.affectedProducts.join(', ')}</p>
                            <p className="text-[11px] text-slate-500">
                              {pat.relatedProcesses.join(', ')}
                            </p>
                          </td>
                          <td className="py-2.5 text-slate-600 max-w-xs">
                            {pat.previousCorrectiveActions.length > 0 ? (
                              pat.previousCorrectiveActions.slice(0, 2).join('; ')
                            ) : (
                              <span className="text-slate-400">No CAPA linked yet</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: CORRELATION LAB (MODULE 8) */}
          {activeTab === 'correlation' && (
            <AnalyticsCorrelationLab correlation={correlation} />
          )}

          {/* TAB 6: TIME-BASED & BEFORE/AFTER CAPA TRENDS (MODULE 10) */}
          {activeTab === 'time-trends' && (
            <div className="space-y-6">
              {/* Monthly / Quarterly / Yearly Volume */}
              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">
                      Complaint Volume Trends (Monthly / Quarterly / Yearly)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Tracks total, closed, open, and critical complaint trends across the selected date range
                    </p>
                  </div>

                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
                    {(['monthly', 'quarterly', 'yearly'] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setTimeGranularity(g)}
                        className={`px-3 py-1 text-xs font-medium rounded capitalize transition-colors ${
                          timeGranularity === g
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={timeTrends}
                      margin={{ top: 8, right: 16, left: -16, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                      <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '6px' }} />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Line type="monotone" dataKey="total" name="Total" stroke="#0f172a" strokeWidth={2.5} />
                      <Line type="monotone" dataKey="closed" name="Closed" stroke="#0891b2" strokeWidth={2} />
                      <Line type="monotone" dataKey="open" name="Open" stroke="#d97706" strokeWidth={2} />
                      <Line type="monotone" dataKey="critical" name="Critical" stroke="#dc2626" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Category Trends & Product Trends */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-slate-200 rounded-lg p-5">
                  <h3 className="text-base font-semibold text-slate-900">
                    Complaint Category Trends Over Time
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">
                    Monthly trajectory per defect category
                  </p>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={categoryTrends.points}
                        margin={{ top: 8, right: 12, left: -18, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                        <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '6px' }} />
                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                        {categoryTrends.seriesKeys.map((key, idx) => (
                          <Line
                            key={key}
                            type="monotone"
                            dataKey={key}
                            stroke={SERIES_COLORS[idx % SERIES_COLORS.length]}
                            strokeWidth={2}
                            dot={{ r: 2.5 }}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-lg p-5">
                  <h3 className="text-base font-semibold text-slate-900">
                    Top-5 Product Trend Comparison
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">
                    Monthly complaint trajectories for highest-volume products
                  </p>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={productTrends.points}
                        margin={{ top: 8, right: 12, left: -18, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                        <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '6px' }} />
                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                        {productTrends.seriesKeys.map((key, idx) => (
                          <Line
                            key={key}
                            type="monotone"
                            dataKey={key}
                            stroke={SERIES_COLORS[idx % SERIES_COLORS.length]}
                            strokeWidth={2}
                            dot={{ r: 2.5 }}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Before-and-After Corrective Action Comparison */}
              <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Before-and-After Corrective Action (CAPA) Comparison
                  </h3>
                  <p className="text-xs text-slate-500">
                    Evaluated complaint counts prior to vs. following CAPA implementation
                  </p>
                </div>

                {beforeAfterCapas.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4">
                    No CAPAs with completed before/after verification measurements in the current filter scope.
                  </p>
                ) : (
                  <>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={beforeAfterCapas}
                          margin={{ top: 8, right: 16, left: -16, bottom: 16 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                          <XAxis dataKey="complaintId" tick={{ fontSize: 11, fill: '#475569' }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                          <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '6px' }} />
                          <Legend wrapperStyle={{ fontSize: '11px' }} />
                          <Bar dataKey="complaintsBefore" name="Before CAPA" fill="#0f172a" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="complaintsAfter" name="After CAPA" fill="#0891b2" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500">
                            <th className="py-2 pr-3 font-medium">Complaint</th>
                            <th className="py-2 pr-3 font-medium">Product &amp; CAPA Action</th>
                            <th className="py-2 pr-3 font-medium text-right">Before</th>
                            <th className="py-2 pr-3 font-medium text-right">After</th>
                            <th className="py-2 pr-3 font-medium text-right">Reduction</th>
                            <th className="py-2 font-medium">Effectiveness Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {beforeAfterCapas.map((row) => (
                            <tr key={row.capaId}>
                              <td className="py-2 pr-3 font-mono font-semibold text-slate-900">
                                {row.complaintId}
                              </td>
                              <td className="py-2 pr-3">
                                <p className="font-medium text-slate-900">{row.productName}</p>
                                <p className="text-slate-500">{row.actionTitle}</p>
                              </td>
                              <td className="py-2 pr-3 text-right font-mono tabular-nums text-slate-900">
                                {row.complaintsBefore}
                              </td>
                              <td className="py-2 pr-3 text-right font-mono tabular-nums text-cyan-800 font-semibold">
                                {row.complaintsAfter}
                              </td>
                              <td className="py-2 pr-3 text-right font-mono tabular-nums font-semibold text-emerald-700">
                                {row.reductionPercent !== null ? `${row.reductionPercent}%` : '—'}
                              </td>
                              <td className="py-2 font-medium text-slate-800">
                                {row.effectivenessStatus}
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

          {/* TAB 7: AI-GENERATED ANALYTICAL INSIGHTS (MODULE 11) */}
          {activeTab === 'ai-insights' && (
            <div className="space-y-4">
              {aiError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-2.5 text-xs text-red-800">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="font-semibold">AI Analytical Insights Unavailable</p>
                    <p className="mt-0.5">{aiError}</p>
                  </div>
                </div>
              )}

              {!aiInsights && !aiLoading && (
                <div className="bg-white border border-slate-200 rounded-lg p-8 text-center space-y-3">
                  <Sparkles className="w-7 h-7 text-cyan-700 mx-auto" aria-hidden="true" />
                  <h3 className="text-base font-semibold text-slate-900">
                    Synthesize Aggregated Findings with Gemini AI
                  </h3>
                  <p className="text-xs text-slate-500 max-w-xl mx-auto leading-relaxed">
                    Sends only the computed aggregates (Pareto counts, top affected products, process associations, recurring/chronic patterns, observed correlation metrics, and CAPA outcomes) to Gemini to summarize observations, investigation priorities, and preventive recommendations without fabricating figures.
                  </p>
                  <button
                    type="button"
                    onClick={handleGenerateAiInsights}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#0B1426] rounded-md hover:bg-slate-800"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                    <span>Generate AI Analytical Insights</span>
                  </button>
                </div>
              )}

              {aiLoading && (
                <div className="bg-white border border-slate-200 rounded-lg p-8 text-center space-y-2">
                  <p className="text-sm font-semibold text-slate-900">
                    Analyzing Aggregated Quality Findings via Gemini Backend...
                  </p>
                  <p className="text-xs text-slate-500">
                    Evaluating Pareto contributors, chronic patterns, and parameter observations across {filtered.length} records.
                  </p>
                </div>
              )}

              {aiInsights && (
                <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">
                        AI-Generated Quality Pattern &amp; Trend Brief
                      </h3>
                      <p className="text-xs text-slate-500">
                        Grounded strictly in supplied aggregate metrics ({filtered.length} filtered records)
                      </p>
                    </div>
                    <span className="text-xs font-mono tabular-nums text-slate-400">
                      {new Date(aiInsights.generatedAt).toLocaleString()}
                    </span>
                  </div>

                  <p className="text-sm text-slate-800 leading-relaxed">
                    {aiInsights.executiveSummary}
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
                    {[
                      {
                        title: '1. Major Quality Observations',
                        items: aiInsights.majorQualityObservations ?? aiInsights.keyDrivers,
                      },
                      {
                        title: '2. Frequently Recurring Defects',
                        items:
                          aiInsights.frequentlyRecurringDefects ?? aiInsights.chronicIssueHighlights,
                      },
                      {
                        title: '3. Most Affected Products',
                        items: aiInsights.mostAffectedProducts ?? [],
                      },
                      {
                        title: '4. Process-Related Patterns',
                        items: aiInsights.processRelatedPatterns ?? [],
                      },
                      {
                        title: '5. Possible Reasons for Complaint Trends',
                        items: aiInsights.possibleReasonsForTrends ?? [],
                      },
                      {
                        title: '6. Areas Requiring Quality Investigation',
                        items: aiInsights.areasRequiringInvestigation ?? aiInsights.emergingRisks,
                      },
                    ].map((section) => (
                      <div
                        key={section.title}
                        className="border border-slate-200 rounded-md p-4 bg-slate-50/70"
                      >
                        <p className="font-semibold text-slate-900 mb-2">{section.title}</p>
                        {section.items.length === 0 ? (
                          <p className="text-slate-500">No items reported for current filter scope.</p>
                        ) : (
                          <ul className="list-disc pl-4 space-y-1.5 text-slate-700 leading-relaxed">
                            {section.items.map((item, idx) => (
                              <li key={idx}>{item}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="border border-cyan-200 rounded-md p-4 bg-cyan-50/40 text-xs">
                    <p className="font-semibold text-slate-900 mb-2">
                      7. Suggested Preventive Measures
                    </p>
                    <ul className="list-disc pl-4 space-y-1.5 text-slate-800 leading-relaxed">
                      {(
                        aiInsights.suggestedPreventiveMeasures ??
                        aiInsights.recommendedFocusAreas
                      ).map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  {aiInsights.dataLimitationsNote && (
                    <div className="border border-amber-200 rounded-md p-3.5 bg-amber-50 text-xs text-amber-950">
                      <span className="font-semibold">Data Limitations &amp; Causation Note: </span>
                      {aiInsights.dataLimitationsNote}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Drill-down Slide-Over Drawer */}
      <AnalyticsDrilldownDrawer
        context={drilldown}
        onClose={() => setDrilldown(null)}
        onNavigate={onNavigate}
      />
    </div>
  );
}
