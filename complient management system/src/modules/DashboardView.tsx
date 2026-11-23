import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertCircle,
  ArrowRight,
  Eye,
  Plus,
  ShieldAlert,
  Sparkles,
  Upload,
} from 'lucide-react';
import { RiskTierText, SeverityText, StatusText } from '../components/StatusText';
import { requestTrendExplanation } from '../services/aiClient';
import type {
  AITrendExplanation,
  ComplaintRecord,
  ComplaintStatus,
  ModuleId,
  SeverityLevel,
} from '../types/qms';
import {
  computeDashboardKPIs,
  computeGroupDistribution,
  computeMonthlyTrends,
  computeProductRiskPredictions,
} from '../utils/qmsAnalytics';

export interface ComplaintPresetFilter {
  status?: 'ALL' | 'UNRESOLVED' | ComplaintStatus;
  severity?: 'ALL' | SeverityLevel;
}

interface DashboardViewProps {
  complaints: ComplaintRecord[];
  onNavigate: (
    module: ModuleId,
    selectedComplaintId?: string,
    presetFilter?: ComplaintPresetFilter
  ) => void;
  onOpenNewComplaint: () => void;
  onOpenCsvImport: () => void;
}

const CHART_COLORS = ['#0891b2', '#0f172a', '#0284c7', '#334155', '#06b6d4', '#64748b', '#94a3b8'];

const CORE_CATEGORIES = [
  'Product Quality',
  'Dimensional Defects',
  'Material Defects',
  'Performance Issues',
  'Delivery Issues',
  'Packaging Issues',
];

export function DashboardView({
  complaints,
  onNavigate,
  onOpenNewComplaint,
  onOpenCsvImport,
}: DashboardViewProps) {
  const [aiTrend, setAiTrend] = useState<AITrendExplanation | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const productRisks = useMemo(
    () => computeProductRiskPredictions(complaints),
    [complaints]
  );
  const kpis = useMemo(
    () => computeDashboardKPIs(complaints, productRisks),
    [complaints, productRisks]
  );
  const monthlyTrends = useMemo(() => computeMonthlyTrends(complaints), [complaints]);

  const categoryDist = useMemo(() => {
    const rawDist = computeGroupDistribution(complaints, (c) => c.category);
    const map = new Map(rawDist.map((d) => [d.name, d]));
    const total = complaints.length || 1;
    const core = CORE_CATEGORIES.map((name) => {
      const found = map.get(name);
      return (
        found ?? {
          name,
          count: 0,
          criticalCount: 0,
          openCount: 0,
          percentage: 0,
        }
      );
    });
    const other = map.get('Other');
    if (other && other.count > 0) {
      core.push(other);
    }
    return core.map((item) => ({
      ...item,
      percentage: Number(((item.count / total) * 100).toFixed(1)),
    }));
  }, [complaints]);

  const topFiveProducts = useMemo(
    () => computeGroupDistribution(complaints, (c) => c.productName).slice(0, 5),
    [complaints]
  );

  const recentComplaints = useMemo(
    () =>
      [...complaints]
        .sort((a, b) => b.complaintDate.localeCompare(a.complaintDate))
        .slice(0, 7),
    [complaints]
  );

  const highRiskTableRows = useMemo(
    () => productRisks.slice(0, 6),
    [productRisks]
  );

  const handleExplainTrends = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const summary = {
        kpis,
        monthlyTrends,
        categoryDistribution: categoryDist,
        topProducts: topFiveProducts,
        highestRiskProducts: highRiskTableRows.map((p) => ({
          productId: p.entityCode,
          product: p.entityName,
          score: p.riskScore,
          tier: p.riskTier,
          recent90Days: p.recent90DayCount,
        })),
      };
      const explanation = await requestTrendExplanation(summary);
      setAiTrend(explanation);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Unable to reach Gemini AI service.');
    } finally {
      setAiLoading(false);
    }
  };

  if (complaints.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-12 text-center space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">No Complaint Records Found</h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          Register a customer complaint, import historical CSV data, or restore the demo dataset to populate live quality analytics.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={onOpenNewComplaint}
            className="px-4 py-2 text-sm font-medium text-white bg-cyan-700 rounded-md hover:bg-cyan-800 transition-colors"
          >
            Register New Complaint
          </button>
          <button
            type="button"
            onClick={onOpenCsvImport}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
          >
            Import Historical Data
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Quick Actions Bar */}
      <section
        aria-label="Quick Actions"
        className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
      >
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Quality Operations Quick Actions</h2>
          <p className="text-xs text-slate-500">
            Jump directly to complaint intake, CSV batch import, Gemini AI triage, or predictive risk scoring
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenNewComplaint}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-cyan-700 rounded-md hover:bg-cyan-800 transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Register New Complaint</span>
          </button>
          <button
            type="button"
            onClick={onOpenCsvImport}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5 text-cyan-700" aria-hidden="true" />
            <span>Import Historical Data</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('classification')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
            <span>Run AI Analysis</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('risk-prediction')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-700" aria-hidden="true" />
            <span>View Risk Predictions</span>
          </button>
        </div>
      </section>

      {/* Six Interactive KPI Cards */}
      <section aria-label="Key quality metrics" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <button
          type="button"
          onClick={() => onNavigate('complaints', undefined, { status: 'ALL', severity: 'ALL' })}
          className="text-left bg-white border border-slate-200 rounded-lg p-4 hover:border-cyan-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 transition-colors"
        >
          <p className="text-xs font-medium text-slate-500">Total Complaints</p>
          <p className="text-2xl font-bold text-slate-900 mt-2 font-mono tabular-nums">
            {kpis.totalComplaints}
          </p>
          <p className="text-xs text-cyan-800 mt-1">View all records</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('complaints', undefined, { status: 'UNRESOLVED', severity: 'ALL' })}
          className="text-left bg-white border border-slate-200 rounded-lg p-4 hover:border-cyan-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 transition-colors"
        >
          <p className="text-xs font-medium text-slate-500">Open Complaints</p>
          <p className="text-2xl font-bold text-amber-700 mt-2 font-mono tabular-nums">
            {kpis.openComplaints}
          </p>
          <p className="text-xs text-slate-500 mt-1">Unresolved backlog</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('complaints', undefined, { status: 'Closed', severity: 'ALL' })}
          className="text-left bg-white border border-slate-200 rounded-lg p-4 hover:border-cyan-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 transition-colors"
        >
          <p className="text-xs font-medium text-slate-500">Closed Complaints</p>
          <p className="text-2xl font-bold text-emerald-700 mt-2 font-mono tabular-nums">
            {kpis.closedComplaints}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {kpis.avgResolutionDays !== null ? `Mean ${kpis.avgResolutionDays}d resolution` : 'Verified & closed'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('complaints', undefined, { status: 'ALL', severity: 'Critical' })}
          className="text-left bg-white border border-slate-200 rounded-lg p-4 hover:border-cyan-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 transition-colors"
        >
          <p className="text-xs font-medium text-slate-500">Critical Complaints</p>
          <p className="text-2xl font-bold text-red-700 mt-2 font-mono tabular-nums">
            {kpis.criticalComplaints}
          </p>
          <p className="text-xs text-slate-500 mt-1">Severe spec / safety impact</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('risk-prediction')}
          className="text-left bg-white border border-slate-200 rounded-lg p-4 hover:border-cyan-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 transition-colors"
        >
          <p className="text-xs font-medium text-slate-500">High-Risk Products</p>
          <p className="text-2xl font-bold text-cyan-800 mt-2 font-mono tabular-nums">
            {kpis.highRiskProductsCount}
          </p>
          <p className="text-xs text-slate-500 mt-1">Risk score 70–100</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('capa')}
          className="text-left bg-white border border-slate-200 rounded-lg p-4 hover:border-cyan-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 transition-colors"
        >
          <p className="text-xs font-medium text-slate-500">CAPA Pending</p>
          <p className="text-2xl font-bold text-slate-900 mt-2 font-mono tabular-nums">
            {kpis.capaPendingCount}
          </p>
          <p className="text-xs text-slate-500 mt-1">Awaiting action / closure</p>
        </button>
      </section>

      {/* AI Executive Trend Briefing */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              AI Quality Trend Briefing
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Synthesizes current complaint telemetry, recurring defect categories, and risk velocity using Gemini AI.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExplainTrends}
            disabled={aiLoading}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
            <span>{aiLoading ? 'Analyzing Trends...' : 'Explain Trends with AI'}</span>
          </button>
        </div>

        {aiError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2.5 text-xs text-red-800">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-semibold">AI Analysis Unavailable</p>
              <p className="mt-0.5">{aiError}</p>
            </div>
          </div>
        )}

        {aiTrend && (
          <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-1">
              <p className="text-xs font-semibold text-slate-700 mb-1.5">Executive Summary</p>
              <p className="text-sm text-slate-700 leading-relaxed">{aiTrend.executiveSummary}</p>
              <p className="text-xs text-slate-400 mt-2 font-mono tabular-nums">
                Generated {new Date(aiTrend.generatedAt).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-1.5">Key Drivers &amp; Chronic Highlights</p>
              <ul className="space-y-1.5 text-xs text-slate-600 list-disc pl-4">
                {aiTrend.keyDrivers.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
                {aiTrend.chronicIssueHighlights.map((c, i) => (
                  <li key={`c-${i}`}>{c}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-1.5">Emerging Risks &amp; Focus Areas</p>
              <ul className="space-y-1.5 text-xs text-slate-600 list-disc pl-4">
                {aiTrend.emergingRisks.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
                {aiTrend.recommendedFocusAreas.map((f, i) => (
                  <li key={`f-${i}`}>{f}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>

      {/* Primary Charts Row: Monthly Line Chart + Category Doughnut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Complaint Trend Analysis (Total, Resolved, Unresolved) */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Complaint Trend Analysis</h2>
              <p className="text-xs text-slate-500">
                Monthly total complaints, resolved complaints, and unresolved complaints
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('analytics')}
              className="text-xs font-medium text-cyan-700 hover:text-cyan-900 inline-flex items-center gap-1 whitespace-nowrap"
            >
              <span>Deep Analytics</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTrends} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{
                    fontSize: '12px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Total Complaints"
                  stroke="#0f172a"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="closed"
                  name="Resolved Complaints"
                  stroke="#0891b2"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="open"
                  name="Unresolved Complaints"
                  stroke="#d97706"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Complaint Category Analysis Doughnut */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h2 className="text-base font-semibold text-slate-900">Complaint Category Analysis</h2>
          <p className="text-xs text-slate-500 mb-3">Distribution across quality defect categories</p>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryDist}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={78}
                  paddingAngle={2}
                >
                  {categoryDist.map((_, idx) => (
                    <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    fontSize: '12px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1.5">
            {categoryDist.map((item, idx) => (
              <div key={item.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                  />
                  <span className="text-slate-700 truncate">{item.name}</span>
                </div>
                <span className="font-mono tabular-nums text-slate-900 font-medium shrink-0">
                  {item.count} ({item.percentage}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Defective Products + High-Risk Products Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5">
          <h2 className="text-base font-semibold text-slate-900">Top Defective Products</h2>
          <p className="text-xs text-slate-500 mb-4">Top five products with highest complaint volume</p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topFiveProducts}
                layout="vertical"
                margin={{ top: 4, right: 20, left: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={165}
                  tick={{ fontSize: 11, fill: '#334155' }}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: '12px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="count" name="Total Complaints" fill="#0f172a" radius={[0, 4, 4, 0]} />
                <Bar dataKey="criticalCount" name="Critical" fill="#0891b2" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">High-Risk Products</h2>
              <p className="text-xs text-slate-500">Transparent historical risk scoring across product lines</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('risk-prediction')}
              className="text-xs font-medium text-cyan-700 hover:text-cyan-900 inline-flex items-center gap-1 whitespace-nowrap"
            >
              <span>Full Risk Model</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2 pr-3 font-medium">Product ID</th>
                  <th className="py-2 pr-3 font-medium">Product Name</th>
                  <th className="py-2 pr-3 font-medium text-right">Total</th>
                  <th className="py-2 pr-3 font-medium text-right">Critical</th>
                  <th className="py-2 pr-3 font-medium text-right">Risk Score</th>
                  <th className="py-2 font-medium text-right">Risk Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {highRiskTableRows.map((item) => (
                  <tr
                    key={item.entityName}
                    onClick={() => onNavigate('risk-prediction')}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 pr-3 font-mono text-slate-600 whitespace-nowrap">
                      {item.entityCode ?? 'PRD'}
                    </td>
                    <td className="py-2.5 pr-3 font-medium text-slate-900">
                      {item.entityName}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-slate-800">
                      {item.totalComplaints}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-red-700 font-medium">
                      {item.criticalCount}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {item.riskScore}/100
                    </td>
                    <td className="py-2.5 text-right">
                      <RiskTierText tier={item.riskTier} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Recent Complaints Table */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Recent Complaints</h2>
            <p className="text-xs text-slate-500">Latest customer quality incidents across active batches</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('complaints', undefined, { status: 'ALL', severity: 'ALL' })}
            className="text-xs font-medium text-cyan-700 hover:text-cyan-900 inline-flex items-center gap-1 whitespace-nowrap"
          >
            <span>Manage All ({complaints.length})</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="py-2.5 pr-3 font-medium">Complaint ID</th>
                <th className="py-2.5 pr-3 font-medium">Customer</th>
                <th className="py-2.5 pr-3 font-medium">Product</th>
                <th className="py-2.5 pr-3 font-medium">Complaint Category</th>
                <th className="py-2.5 pr-3 font-medium">Severity</th>
                <th className="py-2.5 pr-3 font-medium">Complaint Date</th>
                <th className="py-2.5 pr-3 font-medium">Status</th>
                <th className="py-2.5 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {recentComplaints.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-2.5 pr-3 font-mono tabular-nums font-medium text-cyan-800 whitespace-nowrap">
                    {c.id}
                  </td>
                  <td className="py-2.5 pr-3 text-slate-900 font-medium">{c.customerName}</td>
                  <td className="py-2.5 pr-3 text-slate-800">{c.productName}</td>
                  <td className="py-2.5 pr-3 text-slate-700">{c.category}</td>
                  <td className="py-2.5 pr-3">
                    <SeverityText severity={c.severity} />
                  </td>
                  <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                    {c.complaintDate}
                  </td>
                  <td className="py-2.5 pr-3">
                    <StatusText status={c.status} />
                  </td>
                  <td className="py-2.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onNavigate('complaints', c.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-cyan-800 bg-cyan-50 border border-cyan-200 rounded hover:bg-cyan-100 transition-colors"
                    >
                      <Eye className="w-3 h-3" aria-hidden="true" />
                      <span>View Details</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
