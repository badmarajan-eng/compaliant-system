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
import { RotateCcw } from 'lucide-react';
import type { CAPARecord, ComplaintRecord } from '../types/qms';
import {
  computeCapaAnalytics,
  DEFAULT_CAPA_FILTERS,
  filterCapaRecords,
  type CapaFilterState,
} from '../utils/capaUtils';

interface CapaAnalyticsPanelProps {
  capas: CAPARecord[];
  complaints: ComplaintRecord[];
}

const EFF_COLORS: Record<string, string> = {
  Effective: '#059669',
  Ineffective: '#dc2626',
  Inconclusive: '#d97706',
  Pending: '#64748b',
};

export function CapaAnalyticsPanel({ capas, complaints }: CapaAnalyticsPanelProps) {
  const [filters, setFilters] = useState<CapaFilterState>(DEFAULT_CAPA_FILTERS);

  const options = useMemo(() => {
    const uniq = (vals: string[]) => Array.from(new Set(vals.filter(Boolean))).sort();
    return {
      products: uniq(capas.map((c) => c.productName)),
      processes: uniq(capas.map((c) => c.manufacturingProcess)),
      departments: uniq(capas.map((c) => c.responsibleDepartment)),
      owners: uniq(capas.map((c) => c.owner)),
      statuses: [
        'New',
        'Assigned',
        'In Progress',
        'Pending Verification',
        'Overdue',
        'Effective',
        'Ineffective',
        'Closed',
      ],
      priorities: ['Low', 'Normal', 'High', 'Urgent'],
    };
  }, [capas]);

  const filteredCapas = useMemo(() => filterCapaRecords(capas, filters), [capas, filters]);

  const analytics = useMemo(
    () => computeCapaAnalytics(filteredCapas, complaints),
    [filteredCapas, complaints]
  );

  return (
    <div className="space-y-6">
      {/* 7-Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              CAPA Performance &amp; Governance Analytics
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Showing{' '}
              <span className="font-mono font-semibold text-slate-800">
                {filteredCapas.length}
              </span>{' '}
              of{' '}
              <span className="font-mono font-semibold text-slate-800">{capas.length}</span> CAPA
              record(s) across all 8 analytics views
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFilters(DEFAULT_CAPA_FILTERS)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 self-start"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Reset Filters</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 text-xs">
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">From Date</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
              className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white tabular-nums"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 mb-1">To Date</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
              className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white tabular-nums"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 mb-1">Product</label>
            <select
              value={filters.productName}
              onChange={(e) => setFilters((f) => ({ ...f, productName: e.target.value }))}
              className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white"
            >
              <option value="ALL">All Products</option>
              {options.products.map((p) => (
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
              className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white"
            >
              <option value="ALL">All Processes</option>
              {options.processes.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 mb-1">Department</label>
            <select
              value={filters.department}
              onChange={(e) => setFilters((f) => ({ ...f, department: e.target.value }))}
              className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white"
            >
              <option value="ALL">All Departments</option>
              {options.departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 mb-1">Owner</label>
            <select
              value={filters.owner}
              onChange={(e) => setFilters((f) => ({ ...f, owner: e.target.value }))}
              className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white"
            >
              <option value="ALL">All Owners</option>
              {options.owners.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white"
            >
              <option value="ALL">All Statuses</option>
              {options.statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 mb-1">Priority</label>
            <select
              value={filters.priority}
              onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}
              className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white"
            >
              <option value="ALL">All Priorities</option>
              {options.priorities.map((pr) => (
                <option key={pr} value={pr}>
                  {pr}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {filteredCapas.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-10 text-center text-xs text-slate-500">
          No CAPA records match the selected filters. Adjust or reset filters above.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 1. CAPA by Defect Category */}
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              1. CAPAs by Defect Category
            </h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.byCategory} margin={{ top: 5, right: 16, left: -10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#475569' }} interval={0} angle={-12} textAnchor="end" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip contentStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="count" name="CAPA Count" fill="#0891b2" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 2. CAPA by Manufacturing Process */}
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              2. CAPAs by Manufacturing Process
            </h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.byProcess} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10, fill: '#334155' }} />
                  <Tooltip contentStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="count" name="CAPA Count" fill="#0f172a" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 3. CAPA by Department */}
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              3. CAPAs by Responsible Department
            </h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.byDepartment} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis type="category" dataKey="name" width={155} tick={{ fontSize: 10, fill: '#334155' }} />
                  <Tooltip contentStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="count" name="CAPA Count" fill="#0e7490" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 4. CAPA by Owner */}
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              4. CAPA Workload by Owner
            </h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.byOwner} margin={{ top: 5, right: 16, left: -10, bottom: 18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#475569' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip contentStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="count" name="Assigned CAPAs" fill="#0284c7" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 5. Effective vs Ineffective CAPAs */}
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              5. Effective vs Ineffective Verification Outcomes
            </h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={analytics.effectivenessBreakdown.filter((e) => e.count > 0)}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={78}
                    paddingAngle={2}
                  >
                    {analytics.effectivenessBreakdown
                      .filter((e) => e.count > 0)
                      .map((entry) => (
                        <Cell key={entry.name} fill={EFF_COLORS[entry.name] || '#0891b2'} />
                      ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 6. Monthly CAPA Completion Trends */}
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              6. Monthly CAPA Creation vs Completion Trends
            </h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analytics.monthlyCompletionTrend} margin={{ top: 5, right: 16, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#475569' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip contentStyle={{ fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Line type="monotone" dataKey="created" name="Created" stroke="#0891b2" strokeWidth={2} />
                  <Line type="monotone" dataKey="completed" name="Completed / Verified" stroke="#059669" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 7. Overdue Analysis */}
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              7. Overdue vs On-Track CAPAs by Department
            </h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.overdueAnalysis} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis type="category" dataKey="name" width={155} tick={{ fontSize: 10, fill: '#334155' }} />
                  <Tooltip contentStyle={{ fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="overdue" name="Overdue" stackId="a" fill="#dc2626" />
                  <Bar dataKey="onTrack" name="On-Track / Closed" stackId="a" fill="#0891b2" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 8. Recurring Complaints After CAPA Closure */}
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              8. Recurring Complaints After CAPA Completion / Closure
            </h3>
            {analytics.postClosureRecurrence.length === 0 ? (
              <p className="text-xs text-slate-500 py-10 text-center">
                No completed or closed CAPAs in current filtered selection yet.
              </p>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.postClosureRecurrence} margin={{ top: 5, right: 16, left: -10, bottom: 18 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#475569' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip contentStyle={{ fontSize: '12px' }} />
                    <Bar
                      dataKey="subsequentComplaints"
                      name="Subsequent Related Complaints"
                      radius={[4, 4, 0, 0]}
                    >
                      {analytics.postClosureRecurrence.map((entry, idx) => (
                        <Cell
                          key={idx}
                          fill={entry.subsequentComplaints > 0 ? '#dc2626' : '#059669'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
