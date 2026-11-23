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
import { Filter, RotateCcw } from 'lucide-react';
import type { CAPARecord, ComplaintRecord } from '../types/qms';
import {
  computeEffectivenessAnalytics,
  DEFAULT_EFFECTIVENESS_FILTERS,
  filterEffectivenessData,
  type EffectivenessFilterState,
} from '../utils/effectivenessEngine';
import { ALL_CATEGORIES } from '../utils/qmsAnalytics';

interface EffectivenessAnalyticsPanelProps {
  complaints: ComplaintRecord[];
  capaRecords: CAPARecord[];
}

const PIE_COLORS: Record<string, string> = {
  Effective: '#059669',
  Ineffective: '#dc2626',
  Inconclusive: '#d97706',
  Pending: '#64748b',
};

export function EffectivenessAnalyticsPanel({
  complaints,
  capaRecords,
}: EffectivenessAnalyticsPanelProps) {
  const [filters, setFilters] = useState<EffectivenessFilterState>(DEFAULT_EFFECTIVENESS_FILTERS);

  const filterOptions = useMemo(() => {
    const products = Array.from(
      new Set([
        ...complaints.map((c) => c.productName),
        ...capaRecords.map((cp) => cp.productName),
      ])
    )
      .filter(Boolean)
      .sort();
    const processes = Array.from(
      new Set([
        ...complaints.map((c) => c.processName),
        ...capaRecords.map((cp) => cp.manufacturingProcess),
      ])
    )
      .filter(Boolean)
      .sort();
    const customers = Array.from(
      new Set([
        ...complaints.map((c) => c.customerName),
        ...capaRecords.map((cp) => cp.customerName),
      ])
    )
      .filter(Boolean)
      .sort();
    return { products, processes, customers };
  }, [complaints, capaRecords]);

  const { filteredComplaints, filteredCapas } = useMemo(
    () => filterEffectivenessData(complaints, capaRecords, filters),
    [complaints, capaRecords, filters]
  );

  const analytics = useMemo(
    () => computeEffectivenessAnalytics(filteredComplaints, filteredCapas),
    [filteredComplaints, filteredCapas]
  );

  const hasActiveFilters =
    filters.startDate !== '' ||
    filters.endDate !== '' ||
    filters.productName !== 'ALL' ||
    filters.processName !== 'ALL' ||
    filters.customerName !== 'ALL' ||
    filters.category !== 'ALL';

  return (
    <div className="space-y-6">
      {/* 5-Dimension Filter Bar */}
      <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
            <Filter className="w-3.5 h-3.5 text-cyan-700" aria-hidden="true" />
            <span>
              Quality Improvement Analytics Filters ({filteredComplaints.length} complaints ·{' '}
              {filteredCapas.length} CAPAs in scope)
            </span>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => setFilters(DEFAULT_EFFECTIVENESS_FILTERS)}
              className="inline-flex items-center gap-1 text-xs font-medium text-cyan-800 hover:text-cyan-950"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">Date From</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">Date To</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">Product</label>
            <select
              value={filters.productName}
              onChange={(e) => setFilters((f) => ({ ...f, productName: e.target.value }))}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white"
            >
              <option value="ALL">All Products</option>
              {filterOptions.products.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">Process</label>
            <select
              value={filters.processName}
              onChange={(e) => setFilters((f) => ({ ...f, processName: e.target.value }))}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white"
            >
              <option value="ALL">All Processes</option>
              {filterOptions.processes.map((pr) => (
                <option key={pr} value={pr}>
                  {pr}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">Customer</label>
            <select
              value={filters.customerName}
              onChange={(e) => setFilters((f) => ({ ...f, customerName: e.target.value }))}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white"
            >
              <option value="ALL">All Customers</option>
              {filterOptions.customers.map((cu) => (
                <option key={cu} value={cu}>
                  {cu}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">Category</label>
            <select
              value={filters.category}
              onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white"
            >
              <option value="ALL">All Categories</option>
              {ALL_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* 8 Recharts Visualizations (4 rows of 2) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Monthly Complaint Reduction Trend */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-slate-900">
            1. Monthly Complaint Reduction Trend
          </h3>
          <p className="text-xs text-slate-500 mb-3">
            Total vs. resolved vs. open complaints over observed calendar months
          </p>
          <div className="h-60 w-full">
            {analytics.monthlyTrends.length === 0 ? (
              <p className="text-xs text-slate-500 py-20 text-center">No matching monthly data.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analytics.monthlyTrends} margin={{ top: 4, right: 12, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '6px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Line type="monotone" dataKey="total" name="Total" stroke="#0f172a" strokeWidth={2} />
                  <Line type="monotone" dataKey="resolved" name="Resolved" stroke="#059669" strokeWidth={2} />
                  <Line type="monotone" dataKey="open" name="Unresolved" stroke="#d97706" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2: CAPA Effectiveness Percentage */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                2. CAPA Effectiveness Percentage
              </h3>
              <p className="text-xs text-slate-500">
                Verified effectiveness decisions across filtered CAPAs
              </p>
            </div>
            <span className="font-mono tabular-nums text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded">
              {analytics.effectiveRatePercent !== null
                ? `${analytics.effectiveRatePercent}% Effective`
                : 'No Evaluated CAPAs'}
            </span>
          </div>
          <div className="h-60 w-full">
            {filteredCapas.length === 0 ? (
              <p className="text-xs text-slate-500 py-20 text-center">No matching CAPA records.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={analytics.capaEffectivenessDistribution.filter((d) => d.count > 0)}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={82}
                    paddingAngle={2}
                  >
                    {analytics.capaEffectivenessDistribution
                      .filter((d) => d.count > 0)
                      .map((entry) => (
                        <Cell key={entry.name} fill={PIE_COLORS[entry.name] || '#64748b'} />
                      ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '6px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 3: Product Quality Improvement */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-slate-900">
            3. Product Quality Improvement (% Reduction)
          </h3>
          <p className="text-xs text-slate-500 mb-3">
            Comparable CAPA before-vs-after complaint change by product
          </p>
          <div className="h-60 w-full">
            {analytics.productImprovement.filter((p) => p.improvementPercent !== null).length === 0 ? (
              <p className="text-xs text-slate-500 py-20 text-center">
                No comparable post-CAPA product counts in current filter.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={analytics.productImprovement.filter((p) => p.improvementPercent !== null)}
                  layout="vertical"
                  margin={{ top: 4, right: 20, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" unit="%" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10, fill: '#334155' }} />
                  <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '6px' }} />
                  <Bar dataKey="improvementPercent" name="Reduction %" fill="#0891b2" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 4: Process-Wise Quality Improvement */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-slate-900">
            4. Process-Wise Quality Improvement (% Reduction)
          </h3>
          <p className="text-xs text-slate-500 mb-3">
            Comparable CAPA complaint reduction across manufacturing processes
          </p>
          <div className="h-60 w-full">
            {analytics.processImprovement.filter((p) => p.improvementPercent !== null).length === 0 ? (
              <p className="text-xs text-slate-500 py-20 text-center">
                No comparable post-CAPA process counts in current filter.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={analytics.processImprovement.filter((p) => p.improvementPercent !== null)}
                  layout="vertical"
                  margin={{ top: 4, right: 20, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" unit="%" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10, fill: '#334155' }} />
                  <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '6px' }} />
                  <Bar dataKey="improvementPercent" name="Reduction %" fill="#0f172a" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 5: Defect Category Improvement */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-slate-900">
            5. Defect Category Improvement (Before vs. After)
          </h3>
          <p className="text-xs text-slate-500 mb-3">
            Baseline vs. post-CAPA complaint volume grouped by defect category
          </p>
          <div className="h-60 w-full">
            {analytics.categoryImprovement.filter((c) => c.comparableCapas > 0).length === 0 ? (
              <p className="text-xs text-slate-500 py-20 text-center">
                No comparable category CAPAs in current filter.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={analytics.categoryImprovement.filter((c) => c.comparableCapas > 0)}
                  margin={{ top: 4, right: 12, left: -16, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#334155' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '6px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="before" name="Before CAPA" fill="#0f172a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="after" name="After CAPA" fill="#0891b2" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 6: Repeat Complaint Trend */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-slate-900">6. Repeat Complaint Trend</h3>
          <p className="text-xs text-slate-500 mb-3">
            Monthly volume of recurring product + category complaint occurrences
          </p>
          <div className="h-60 w-full">
            {analytics.monthlyTrends.length === 0 ? (
              <p className="text-xs text-slate-500 py-20 text-center">No matching monthly data.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.monthlyTrends} margin={{ top: 4, right: 12, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '6px' }} />
                  <Bar dataKey="recurring" name="Recurring Incidents" fill="#d97706" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 7: Root Cause Recurrence Analysis */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-slate-900">
            7. Root Cause Recurrence Analysis
          </h3>
          <p className="text-xs text-slate-500 mb-3">
            CAPA frequency and ineffective outcomes grouped by documented root cause
          </p>
          <div className="h-60 w-full">
            {analytics.rootCauseRecurrence.length === 0 ? (
              <p className="text-xs text-slate-500 py-20 text-center">No CAPA root causes in filter.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={analytics.rootCauseRecurrence.slice(0, 6)}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis type="category" dataKey="rootCause" width={160} tick={{ fontSize: 10, fill: '#334155' }} />
                  <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '6px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="count" name="CAPAs Linked" fill="#0f172a" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="ineffectiveCapas" name="Ineffective" fill="#dc2626" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 8: Before-and-After CAPA Comparison */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-slate-900">
            8. Before-and-After CAPA Comparison
          </h3>
          <p className="text-xs text-slate-500 mb-3">
            Individual CAPA pre-implementation baseline vs. post-CAPA complaint count
          </p>
          <div className="h-60 w-full">
            {analytics.beforeAfterBars.length === 0 ? (
              <p className="text-xs text-slate-500 py-20 text-center">
                No CAPAs with recorded post-implementation counts in filter.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={analytics.beforeAfterBars.slice(0, 10)}
                  margin={{ top: 4, right: 12, left: -16, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#334155' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '6px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="before" name="Before CAPA" fill="#0f172a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="after" name="After CAPA" fill="#059669" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
