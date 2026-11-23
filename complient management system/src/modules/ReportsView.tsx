import { useMemo, useState } from 'react';
import { Download, Loader2, Printer, Sparkles } from 'lucide-react';
import { RiskTierText, SeverityText, StatusText } from '../components/StatusText';
import { requestEffectivenessInsights } from '../services/aiClient';
import type {
  AIEffectivenessInsights,
  CAPARecord,
  ComplaintRecord,
} from '../types/qms';
import { exportCapaSummaryCsv, resolveEffectiveCapaStatus } from '../utils/capaUtils';
import { downloadCsvFile, exportComplaintsToCsv } from '../utils/csvUtils';
import {
  computeBeforeAfterAnalysis,
  computeEffectivenessAnalytics,
  computeEffectivenessDashboardKpis,
  computeQualityPerformanceScorecard,
  detectPostCapaRecurrences,
  exportExecutiveManagementCsv,
} from '../utils/effectivenessEngine';
import { detectRecurringDefects } from '../utils/patternAnalytics';
import {
  computeProcessRiskAssessments,
  computeProductRiskAssessments,
} from '../utils/predictiveEngine';
import {
  computeDashboardKPIs,
  computeGroupDistribution,
  computeMonthlyTrends,
  computeProcessRiskPredictions,
  computeProductRiskPredictions,
} from '../utils/qmsAnalytics';

interface ReportsViewProps {
  complaints: ComplaintRecord[];
  capaRecords?: CAPARecord[];
}

type ReportTab =
  | 'executive-management'
  | 'individual-complaint'
  | 'complaint-summary'
  | 'product-quality'
  | 'root-cause'
  | 'risk-prediction'
  | 'capa-effectiveness'
  | 'monthly-complaint';

const REPORT_TABS: Array<{ id: ReportTab; label: string }> = [
  { id: 'executive-management', label: 'Executive Management Report' },
  { id: 'individual-complaint', label: 'Individual Complaint Report' },
  { id: 'complaint-summary', label: 'Complaint Summary' },
  { id: 'product-quality', label: 'Product Quality' },
  { id: 'root-cause', label: 'Root Cause Report' },
  { id: 'risk-prediction', label: 'Risk Prediction' },
  { id: 'capa-effectiveness', label: 'CAPA Effectiveness' },
  { id: 'monthly-complaint', label: 'Monthly Complaints' },
];

export function ReportsView({ complaints, capaRecords = [] }: ReportsViewProps) {
  const [activeTab, setActiveTab] = useState<ReportTab>('executive-management');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [selectedComplaintId, setSelectedComplaintId] = useState<string>(
    () => complaints[0]?.id ?? ''
  );

  // Live Gemini AI insights embedded cleanly in Executive Management Report Section 12
  const [execAiInsights, setExecAiInsights] = useState<AIEffectivenessInsights | null>(null);
  const [execAiLoading, setExecAiLoading] = useState(false);
  const [execAiError, setExecAiError] = useState<string | null>(null);

  const scopedComplaints = useMemo(() => {
    return complaints.filter((c) => {
      if (dateFrom && c.complaintDate < dateFrom) return false;
      if (dateTo && c.complaintDate > dateTo) return false;
      return true;
    });
  }, [complaints, dateFrom, dateTo]);

  const scopedCapas = useMemo(() => {
    return capaRecords.filter((cp) => {
      if (dateFrom && cp.createdDate < dateFrom) return false;
      if (dateTo && cp.createdDate > dateTo) return false;
      return true;
    });
  }, [capaRecords, dateFrom, dateTo]);

  const productRisks = useMemo(
    () => computeProductRiskPredictions(scopedComplaints),
    [scopedComplaints]
  );
  const processRisks = useMemo(
    () => computeProcessRiskPredictions(scopedComplaints),
    [scopedComplaints]
  );
  const predProductRisks = useMemo(
    () => computeProductRiskAssessments(scopedComplaints, undefined, scopedCapas),
    [scopedComplaints, scopedCapas]
  );
  const predProcessRisks = useMemo(
    () => computeProcessRiskAssessments(scopedComplaints, undefined, scopedCapas),
    [scopedComplaints, scopedCapas]
  );

  const kpis = useMemo(
    () => computeDashboardKPIs(scopedComplaints, productRisks),
    [scopedComplaints, productRisks]
  );
  const effKpis = useMemo(
    () => computeEffectivenessDashboardKpis(scopedComplaints, scopedCapas),
    [scopedComplaints, scopedCapas]
  );
  const beforeAfter = useMemo(
    () => computeBeforeAfterAnalysis(scopedComplaints, scopedCapas, 'ALL'),
    [scopedComplaints, scopedCapas]
  );
  const scorecard = useMemo(
    () => computeQualityPerformanceScorecard(scopedComplaints, scopedCapas),
    [scopedComplaints, scopedCapas]
  );
  const postCapaRecurrences = useMemo(
    () => detectPostCapaRecurrences(scopedComplaints, scopedCapas),
    [scopedComplaints, scopedCapas]
  );
  const recurringClusters = useMemo(
    () =>
      detectRecurringDefects(scopedComplaints, {
        observationDays: 365,
        chronicThreshold: 3,
      }).filter((p) => p.classification !== 'New Problem'),
    [scopedComplaints]
  );

  const productDist = useMemo(
    () => computeGroupDistribution(scopedComplaints, (c) => c.productName),
    [scopedComplaints]
  );
  const categoryDist = useMemo(
    () => computeGroupDistribution(scopedComplaints, (c) => c.category),
    [scopedComplaints]
  );
  const monthlyTrends = useMemo(
    () => computeMonthlyTrends(scopedComplaints),
    [scopedComplaints]
  );

  const rcaRows = useMemo(() => {
    return scopedComplaints.filter(
      (c) =>
        Boolean(c.rootCauseAnalysis?.manualVerifiedRootCause) ||
        (c.rootCauseAnalysis?.hypotheses.length ?? 0) > 0
    );
  }, [scopedComplaints]);

  const selectedIndividualComplaint = useMemo(
    () =>
      complaints.find((c) => c.id === selectedComplaintId) ??
      complaints[0] ??
      null,
    [complaints, selectedComplaintId]
  );

  const dateRangeLabel =
    dateFrom || dateTo
      ? `${dateFrom || 'Start'} to ${dateTo || 'Present'}`
      : 'All Recorded Dates';

  const handleGenerateExecutiveAi = async () => {
    setExecAiLoading(true);
    setExecAiError(null);
    try {
      const analytics = computeEffectivenessAnalytics(scopedComplaints, scopedCapas);
      const res = await requestEffectivenessInsights({
        dateRangeLabel,
        kpis: effKpis,
        beforeAfter,
        scorecard,
        categoryDistribution: categoryDist.slice(0, 7),
        productImprovement: analytics.productImprovement.slice(0, 6),
        processImprovement: analytics.processImprovement.slice(0, 6),
        confirmedRecurrences: postCapaRecurrences
          .filter((r) => r.classification === 'Confirmed Recurrence')
          .slice(0, 6),
      });
      setExecAiInsights(res);
    } catch (err) {
      setExecAiError(
        err instanceof Error ? err.message : 'Unable to generate Gemini Executive Insights.'
      );
    } finally {
      setExecAiLoading(false);
    }
  };

  const handleExportCsv = () => {
    if (activeTab === 'executive-management') {
      exportExecutiveManagementCsv({
        dateRangeLabel,
        kpis: effKpis,
        beforeAfter,
        scorecard,
        recurrences: postCapaRecurrences,
      });
      return;
    }

    if (activeTab === 'individual-complaint' && selectedIndividualComplaint) {
      exportComplaintsToCsv(
        [selectedIndividualComplaint],
        `q-intelligence-${selectedIndividualComplaint.id}-report.csv`
      );
      return;
    }

    if (activeTab === 'complaint-summary') {
      exportComplaintsToCsv(scopedComplaints, 'q-intelligence-complaint-summary.csv');
      return;
    }

    if (activeTab === 'product-quality') {
      downloadCsvFile(
        'q-intelligence-product-quality-report.csv',
        ['Product Name', 'Total Complaints', 'Critical Count', 'Open Count', 'Share %'],
        productDist.map((p) => [p.name, p.count, p.criticalCount, p.openCount, `${p.percentage}%`])
      );
      return;
    }

    if (activeTab === 'root-cause') {
      downloadCsvFile(
        'q-intelligence-root-cause-report.csv',
        [
          'Complaint ID',
          'Product',
          'Process',
          'Verified Official Root Cause',
          'AI Hypotheses Count',
          'Confidence',
        ],
        rcaRows.map((c) => [
          c.id,
          c.productName,
          c.processName,
          c.rootCauseAnalysis?.manualVerifiedRootCause ||
            c.rootCauseAnalysis?.hypotheses.find((h) => h.managerStatus === 'Verified')?.title ||
            'Pending Verification',
          c.rootCauseAnalysis?.hypotheses.length ?? 0,
          c.rootCauseAnalysis?.confidenceLevel ?? 'N/A',
        ])
      );
      return;
    }

    if (activeTab === 'risk-prediction') {
      downloadCsvFile(
        'q-intelligence-risk-prediction-report.csv',
        [
          'Entity Type',
          'Name',
          'Risk Score (0-100)',
          'Risk Tier',
          'Total Complaints',
          '90d Incidents',
          'Likely Future Categories',
        ],
        [...productRisks, ...processRisks].map((r) => [
          r.entityType,
          r.entityName,
          r.riskScore,
          r.riskTier,
          r.totalComplaints,
          r.recent90DayCount,
          r.possibleFutureCategories.join('; '),
        ])
      );
      return;
    }

    if (activeTab === 'capa-effectiveness') {
      exportCapaSummaryCsv(scopedCapas);
      return;
    }

    if (activeTab === 'monthly-complaint') {
      downloadCsvFile(
        'q-intelligence-monthly-complaint-report.csv',
        ['Month', 'Total Complaints', 'Open / Active', 'Closed', 'Critical Severity'],
        monthlyTrends.map((m) => [m.month, m.total, m.open, m.closed, m.critical])
      );
    }
  };

  const classifiedCount = scopedComplaints.filter((c) => Boolean(c.aiClassification)).length;
  const verifiedClassificationCount = scopedComplaints.filter(
    (c) => c.aiClassification?.managerVerification?.decision === 'Accepted'
  ).length;

  return (
    <div className="space-y-6">
      {/* Report Selector, Date Filter & Actions */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 no-print">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1 rounded-md">
            {REPORT_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
              <span>Print / Save PDF</span>
            </button>
          </div>
        </div>

        {/* Date Range Filter */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
          <span className="font-medium text-slate-600">Report Date Range:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label="Report start date"
            className="px-2.5 py-1 border border-slate-300 rounded font-mono bg-white"
          />
          <span className="text-slate-400">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="Report end date"
            className="px-2.5 py-1 border border-slate-300 rounded font-mono bg-white"
          />
          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
              className="text-cyan-800 font-medium hover:underline"
            >
              Clear Dates
            </button>
          )}
          <span className="text-slate-500 ml-auto font-mono tabular-nums">
            Scope: {scopedComplaints.length} complaints · {scopedCapas.length} CAPAs
          </span>
        </div>
      </div>

      {/* Printable Report Canvas */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 print-area space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-200">
          <div>
            <p className="text-xs font-mono text-cyan-800 font-semibold">
              Q-INTELLIGENCE · QUALITY AUDIT &amp; MANAGEMENT REPORT (PS-036)
            </p>
            <h2 className="text-lg font-bold text-slate-900 mt-0.5">
              {REPORT_TABS.find((t) => t.id === activeTab)?.label}
            </h2>
          </div>
          <div className="text-xs text-slate-500 font-mono tabular-nums sm:text-right">
            <p>Window: {dateRangeLabel}</p>
            <p>Generated: {new Date().toISOString().slice(0, 10)}</p>
          </div>
        </div>

        {/* EXECUTIVE MANAGEMENT REPORT (ALL 14 SECTIONS) */}
        {activeTab === 'executive-management' && (
          <div className="space-y-6 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-md p-3.5 no-print">
              <p className="text-slate-700">
                Full 14-section ISO 9001 Executive Quality Management Report synthesized from live QMS records.
              </p>
              <button
                type="button"
                onClick={handleGenerateExecutiveAi}
                disabled={execAiLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium text-white bg-cyan-700 hover:bg-cyan-800 disabled:opacity-60 rounded-md"
              >
                {execAiLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span>
                  {execAiInsights ? 'Refresh Section 12 AI Insights' : 'Populate Section 12 with Gemini AI'}
                </span>
              </button>
            </div>

            {/* 1. Executive Summary */}
            <section className="space-y-1.5">
              <h3 className="text-sm font-bold text-slate-900">1. Executive Summary</h3>
              <p className="text-slate-700 leading-relaxed">
                Across {dateRangeLabel}, Q-INTELLIGENCE recorded{' '}
                <strong className="font-mono">{effKpis.totalCustomerComplaints}</strong> customer complaints, of which{' '}
                <strong className="font-mono">{effKpis.complaintsResolved}</strong> are Closed and{' '}
                <strong className="font-mono">{kpis.openComplaints}</strong> remain active.{' '}
                <strong className="font-mono">{effKpis.verifiedRootCauses}</strong> investigations carry a manager-verified root cause,{' '}
                <strong className="font-mono">{effKpis.totalCapaImplemented}</strong> CAPA plans have completed implementation ({effKpis.effectiveCapa} Effective, {effKpis.ineffectiveCapa} Ineffective), and measured comparable complaint reduction stands at{' '}
                <strong className="font-mono">{effKpis.complaintReductionDisplay}</strong>.
              </p>
            </section>

            {/* 2. Customer Complaint Overview */}
            <section className="space-y-2">
              <h3 className="text-sm font-bold text-slate-900">2. Customer Complaint Overview</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="p-3 border border-slate-200 rounded bg-slate-50">
                  <p className="text-slate-500">Total Complaints</p>
                  <p className="text-base font-bold font-mono tabular-nums text-slate-900">{effKpis.totalCustomerComplaints}</p>
                </div>
                <div className="p-3 border border-slate-200 rounded bg-slate-50">
                  <p className="text-slate-500">Resolved / Closed</p>
                  <p className="text-base font-bold font-mono tabular-nums text-emerald-700">{effKpis.complaintsResolved}</p>
                </div>
                <div className="p-3 border border-slate-200 rounded bg-slate-50">
                  <p className="text-slate-500">Open Backlog</p>
                  <p className="text-base font-bold font-mono tabular-nums text-amber-700">{kpis.openComplaints}</p>
                </div>
                <div className="p-3 border border-slate-200 rounded bg-slate-50">
                  <p className="text-slate-500">Critical Severity</p>
                  <p className="text-base font-bold font-mono tabular-nums text-red-700">{kpis.criticalComplaints}</p>
                </div>
                <div className="p-3 border border-slate-200 rounded bg-slate-50">
                  <p className="text-slate-500">Avg Resolution</p>
                  <p className="text-base font-bold font-mono tabular-nums text-slate-900">
                    {kpis.avgResolutionDays !== null ? `${kpis.avgResolutionDays}d` : '—'}
                  </p>
                </div>
              </div>
            </section>

            {/* 3. Complaint Classification Results */}
            <section className="space-y-1.5">
              <h3 className="text-sm font-bold text-slate-900">3. Complaint Classification Results</h3>
              <p className="text-slate-700">
                <strong className="font-mono">{classifiedCount}</strong> of{' '}
                <strong className="font-mono">{scopedComplaints.length}</strong> complaints have undergone AI classification triage;{' '}
                <strong className="font-mono">{verifiedClassificationCount}</strong> have received explicit Quality Manager classification acceptance.
              </p>
            </section>

            {/* 4. Root Cause Analysis Summary */}
            <section className="space-y-1.5">
              <h3 className="text-sm font-bold text-slate-900">4. Root Cause Analysis Summary</h3>
              <p className="text-slate-700">
                <strong className="font-mono">{rcaRows.length}</strong> complaint records include structured 6M root cause investigations, with{' '}
                <strong className="font-mono">{effKpis.verifiedRootCauses}</strong> physically verified root causes confirmed by Quality Management. Remaining AI-generated hypotheses require metrology or engineering verification prior to permanent rollout.
              </p>
            </section>

            {/* 5. Major Defect Categories */}
            <section className="space-y-2">
              <h3 className="text-sm font-bold text-slate-900">5. Major Defect Categories</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {categoryDist.slice(0, 4).map((cat) => (
                  <div key={cat.name} className="p-2.5 border border-slate-200 rounded">
                    <p className="font-semibold text-slate-900">{cat.name}</p>
                    <p className="font-mono tabular-nums text-slate-600 mt-0.5">
                      {cat.count} complaints ({cat.percentage}%) · {cat.criticalCount} Critical
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* 6. Historical Trend Analysis */}
            <section className="space-y-1.5">
              <h3 className="text-sm font-bold text-slate-900">6. Historical Trend Analysis</h3>
              <p className="text-slate-700">
                Observed telemetry spans <strong className="font-mono">{monthlyTrends.length}</strong> calendar month(s). Peak monthly volume:{' '}
                <strong className="font-mono">
                  {monthlyTrends.length > 0
                    ? `${[...monthlyTrends].sort((a, b) => b.total - a.total)[0].month} (${[...monthlyTrends].sort((a, b) => b.total - a.total)[0].total} complaints)`
                    : 'N/A'}
                </strong>
                . Recurring product-category clusters identified: <strong className="font-mono">{recurringClusters.length}</strong>.
              </p>
            </section>

            {/* 7. Predictive Risk Summary */}
            <section className="space-y-1.5">
              <h3 className="text-sm font-bold text-slate-900">7. Predictive Risk Summary</h3>
              <p className="text-slate-700">
                Predictive risk scoring identifies{' '}
                <strong className="font-mono text-red-700">
                  {predProductRisks.filter((p) => p.riskLevel === 'HIGH').length}
                </strong>{' '}
                HIGH-risk products and{' '}
                <strong className="font-mono text-red-700">
                  {predProcessRisks.filter((p) => p.riskLevel === 'HIGH').length}
                </strong>{' '}
                HIGH-risk manufacturing process families (decision-support index, 0–100).
              </p>
            </section>

            {/* 8. High-Risk Products and Processes */}
            <section className="space-y-2">
              <h3 className="text-sm font-bold text-slate-900">8. High-Risk Products and Processes</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded p-3">
                  <p className="font-semibold text-slate-900 mb-1.5">Top Risk Products</p>
                  <ul className="space-y-1 text-slate-700">
                    {predProductRisks.slice(0, 4).map((p) => (
                      <li key={p.productId} className="flex justify-between gap-2">
                        <span>{p.productName}</span>
                        <span className="font-mono font-semibold">{p.riskScore}/100 ({p.riskLevel})</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="border border-slate-200 rounded p-3">
                  <p className="font-semibold text-slate-900 mb-1.5">Top Risk Processes</p>
                  <ul className="space-y-1 text-slate-700">
                    {predProcessRisks
                      .filter((p) => p.riskScore !== null)
                      .slice(0, 4)
                      .map((pr) => (
                        <li key={pr.processName} className="flex justify-between gap-2">
                          <span>{pr.processName}</span>
                          <span className="font-mono font-semibold">{pr.riskScore}/100 ({pr.riskLevel})</span>
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            </section>

            {/* 9. CAPA Implementation Summary */}
            <section className="space-y-1.5">
              <h3 className="text-sm font-bold text-slate-900">9. CAPA Implementation Summary</h3>
              <p className="text-slate-700">
                Total CAPAs in register: <strong className="font-mono">{scopedCapas.length}</strong> · Implemented / Verification stage:{' '}
                <strong className="font-mono">{effKpis.totalCapaImplemented}</strong> · Average completion duration:{' '}
                <strong className="font-mono">
                  {effKpis.avgCapaCompletionDays !== null ? `${effKpis.avgCapaCompletionDays} days` : 'Pending'}
                </strong>
                .
              </p>
            </section>

            {/* 10. CAPA Effectiveness Results */}
            <section className="space-y-1.5">
              <h3 className="text-sm font-bold text-slate-900">10. CAPA Effectiveness Results</h3>
              <p className="text-slate-700">
                Comparable baseline complaints: <strong className="font-mono">{beforeAfter.complaintsBefore}</strong> → Post-CAPA complaints:{' '}
                <strong className="font-mono">{beforeAfter.complaintsAfter ?? 'Pending'}</strong> (Reduction:{' '}
                <strong className="font-mono text-emerald-700">{beforeAfter.reductionDisplay}</strong>). {beforeAfter.notes}
              </p>
            </section>

            {/* 11. Recurring Complaint Analysis */}
            <section className="space-y-1.5">
              <h3 className="text-sm font-bold text-slate-900">11. Recurring Complaint Analysis</h3>
              <p className="text-slate-700">
                Post-CAPA monitoring flagged{' '}
                <strong className="font-mono text-red-700">
                  {postCapaRecurrences.filter((r) => r.classification === 'Confirmed Recurrence').length}
                </strong>{' '}
                Confirmed Recurrence match(es) and{' '}
                <strong className="font-mono text-amber-700">
                  {postCapaRecurrences.filter((r) => r.classification === 'Possible Recurrence').length}
                </strong>{' '}
                Possible Recurrence match(es). Root cause parity is reported strictly where physical root cause verification is recorded on both complaints.
              </p>
            </section>

            {/* 12. AI-Generated Quality Insights */}
            <section className="space-y-2">
              <h3 className="text-sm font-bold text-slate-900">12. AI-Generated Quality Insights</h3>
              {execAiError && (
                <p className="text-red-700 bg-red-50 border border-red-200 rounded p-2.5">
                  {execAiError}
                </p>
              )}
              {execAiInsights ? (
                <div className="border border-slate-200 rounded p-3.5 bg-slate-50 space-y-2">
                  <p className="text-slate-800">{execAiInsights.executiveSummary}</p>
                  <p className="text-[11px] text-slate-500">{execAiInsights.dataSufficiencyNote}</p>
                </div>
              ) : (
                <p className="text-slate-500">
                  Click &ldquo;Populate Section 12 with Gemini AI&rdquo; above to attach live Gemini quality improvement commentary to this executive report.
                </p>
              )}
            </section>

            {/* 13. Recommended Preventive Improvements */}
            <section className="space-y-1.5">
              <h3 className="text-sm font-bold text-slate-900">13. Recommended Preventive Improvements</h3>
              <ul className="list-disc pl-4 space-y-1 text-slate-700">
                {(execAiInsights?.recommendedNextSteps.length
                  ? execAiInsights.recommendedNextSteps
                  : predProductRisks
                      .filter((p) => p.riskLevel !== 'LOW')
                      .slice(0, 4)
                      .map((p) => `${p.productName}: ${p.recommendedPreventiveAction}`)
                ).map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </section>

            {/* 14. Final Conclusion */}
            <section className="space-y-2 border-t border-slate-200 pt-4">
              <h3 className="text-sm font-bold text-slate-900">14. Final Conclusion</h3>
              <p className="text-slate-700 leading-relaxed">
                Quality performance over {dateRangeLabel} demonstrates measurable complaint closure and CAPA execution progress, while highlighting recurring defect exposure in high-risk product lines and ineffective or overdue CAPAs requiring Quality Manager follow-up. Continued production-volume denominator logging and mandatory physical verification of AI root cause leads remain essential for ISO 9001 compliance.
              </p>
            </section>
          </div>
        )}

        {/* INDIVIDUAL COMPLAINT REPORT */}
        {activeTab === 'individual-complaint' && (
          <div className="space-y-5 text-xs">
            <div className="flex flex-wrap items-center gap-3 no-print">
              <label htmlFor="ind-cmp-select" className="font-medium text-slate-700">
                Select Complaint Record:
              </label>
              <select
                id="ind-cmp-select"
                value={selectedIndividualComplaint?.id ?? ''}
                onChange={(e) => setSelectedComplaintId(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-md bg-white text-slate-900"
              >
                {complaints.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} — {c.productName} ({c.customerName})
                  </option>
                ))}
              </select>
            </div>

            {!selectedIndividualComplaint ? (
              <p className="text-slate-500">No complaint record selected.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50 border border-slate-200 rounded p-4">
                  <div>
                    <p className="text-slate-500">Complaint ID / Date</p>
                    <p className="font-mono font-semibold text-slate-900 mt-0.5">
                      {selectedIndividualComplaint.id} · {selectedIndividualComplaint.complaintDate}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Customer / Product / Batch</p>
                    <p className="font-semibold text-slate-900 mt-0.5">
                      {selectedIndividualComplaint.customerName} · {selectedIndividualComplaint.productName} ({selectedIndividualComplaint.batchNumber})
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Category / Severity / Status</p>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                      <span>{selectedIndividualComplaint.category}</span>
                      <SeverityText severity={selectedIndividualComplaint.severity} />
                      <StatusText status={selectedIndividualComplaint.status} />
                    </div>
                  </div>
                </div>

                <div className="border border-slate-200 rounded p-4 space-y-2">
                  <p className="font-semibold text-slate-900">Defect Description &amp; Process Telemetry</p>
                  <p className="text-slate-700">{selectedIndividualComplaint.description}</p>
                  <p className="text-slate-600">
                    <strong>Process:</strong> {selectedIndividualComplaint.processName} ·{' '}
                    <strong>Parameters:</strong> {selectedIndividualComplaint.processParameters || '—'} ·{' '}
                    <strong>Inspection / Test Results:</strong> {selectedIndividualComplaint.testResults || '—'}
                  </p>
                </div>

                <div className="border border-slate-200 rounded p-4 space-y-2">
                  <p className="font-semibold text-slate-900">Root Cause &amp; CAPA Summary</p>
                  <p className="text-slate-700">
                    <strong>Verified Root Cause:</strong>{' '}
                    {selectedIndividualComplaint.rootCauseAnalysis?.manualVerifiedRootCause ||
                      selectedIndividualComplaint.rootCauseAnalysis?.hypotheses.find(
                        (h) => h.managerStatus === 'Verified'
                      )?.title ||
                      'Pending Manager Verification'}
                  </p>
                  {capaRecords
                    .filter((cp) => cp.complaintId === selectedIndividualComplaint.id)
                    .map((cp) => (
                      <div key={cp.id} className="bg-slate-50 border border-slate-200 rounded p-2.5">
                        <p className="font-mono font-semibold text-cyan-800">
                          {cp.id} ({resolveEffectiveCapaStatus(cp)}) · Effectiveness: {cp.effectiveness.decision}
                        </p>
                        <p className="text-slate-600 mt-0.5">
                          Before: {cp.effectiveness.complaintsBefore} | After:{' '}
                          {cp.effectiveness.complaintsAfter ?? 'Pending'} · Owner: {cp.owner}
                        </p>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'complaint-summary' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                <p className="text-slate-500">Total Complaints</p>
                <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
                  {kpis.totalComplaints}
                </p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                <p className="text-slate-500">Open / Active</p>
                <p className="text-lg font-bold font-mono tabular-nums text-amber-700 mt-1">
                  {kpis.openComplaints}
                </p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                <p className="text-slate-500">Critical Severity</p>
                <p className="text-lg font-bold font-mono tabular-nums text-red-700 mt-1">
                  {kpis.criticalComplaints}
                </p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                <p className="text-slate-500">Avg Resolution Time</p>
                <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
                  {kpis.avgResolutionDays !== null ? `${kpis.avgResolutionDays} days` : '—'}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3 font-medium">ID</th>
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Customer</th>
                    <th className="py-2 pr-3 font-medium">Product</th>
                    <th className="py-2 pr-3 font-medium">Category</th>
                    <th className="py-2 pr-3 font-medium">Severity</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {scopedComplaints.map((c) => (
                    <tr key={c.id}>
                      <td className="py-2 pr-3 font-mono">{c.id}</td>
                      <td className="py-2 pr-3 font-mono tabular-nums">{c.complaintDate}</td>
                      <td className="py-2 pr-3">{c.customerName}</td>
                      <td className="py-2 pr-3">{c.productName}</td>
                      <td className="py-2 pr-3">{c.category}</td>
                      <td className="py-2 pr-3">
                        <SeverityText severity={c.severity} />
                      </td>
                      <td className="py-2">
                        <StatusText status={c.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'product-quality' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 pr-3 font-medium">Product Name</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Total Incidents</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Critical</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Open</th>
                  <th className="py-2.5 font-medium text-right">Share %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {productDist.map((p) => (
                  <tr key={p.name}>
                    <td className="py-2.5 pr-3 font-medium text-slate-900">{p.name}</td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{p.count}</td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-red-700">
                      {p.criticalCount}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-amber-700">
                      {p.openCount}
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums">{p.percentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'root-cause' && (
          <div className="overflow-x-auto">
            {rcaRows.length === 0 ? (
              <p className="text-xs text-slate-500">No root cause investigations recorded yet.</p>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 pr-3 font-medium">Complaint ID</th>
                    <th className="py-2.5 pr-3 font-medium">Product / Process</th>
                    <th className="py-2.5 pr-3 font-medium">Verified Official Root Cause</th>
                    <th className="py-2.5 pr-3 font-medium text-right">Hypotheses</th>
                    <th className="py-2.5 font-medium">Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rcaRows.map((c) => {
                    const verifiedHyp = c.rootCauseAnalysis?.hypotheses.find(
                      (h) => h.managerStatus === 'Verified'
                    );
                    return (
                      <tr key={c.id}>
                        <td className="py-2.5 pr-3 font-mono font-medium text-cyan-800">{c.id}</td>
                        <td className="py-2.5 pr-3">
                          <p className="font-medium text-slate-900">{c.productName}</p>
                          <p className="text-slate-500">{c.processName}</p>
                        </td>
                        <td className="py-2.5 pr-3 text-slate-800">
                          {c.rootCauseAnalysis?.manualVerifiedRootCause ||
                            verifiedHyp?.title ||
                            'Unverified AI Hypothesis Pending Review'}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                          {c.rootCauseAnalysis?.hypotheses.length ?? 0}
                        </td>
                        <td className="py-2.5">{c.rootCauseAnalysis?.confidenceLevel}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'risk-prediction' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 pr-3 font-medium">Type</th>
                  <th className="py-2.5 pr-3 font-medium">Entity Name</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Total</th>
                  <th className="py-2.5 pr-3 font-medium text-right">90d Trend</th>
                  <th className="py-2.5 pr-3 font-medium">Possible Future Categories</th>
                  <th className="py-2.5 font-medium text-right">Risk Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...productRisks, ...processRisks].map((r) => (
                  <tr key={`${r.entityType}-${r.entityName}`}>
                    <td className="py-2.5 pr-3 text-slate-500">{r.entityType}</td>
                    <td className="py-2.5 pr-3 font-medium text-slate-900">{r.entityName}</td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                      {r.totalComplaints}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                      {r.recent90DayCount}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600">
                      {r.possibleFutureCategories.join(', ')}
                    </td>
                    <td className="py-2.5 text-right">
                      <RiskTierText tier={r.riskTier} score={r.riskScore} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'capa-effectiveness' && (
          <div className="overflow-x-auto">
            {scopedCapas.length === 0 ? (
              <p className="text-xs text-slate-500">No CAPA records available in selected range.</p>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 pr-3 font-medium">CAPA ID</th>
                    <th className="py-2.5 pr-3 font-medium">Complaint</th>
                    <th className="py-2.5 pr-3 font-medium">Product / Process</th>
                    <th className="py-2.5 pr-3 font-medium">Owner</th>
                    <th className="py-2.5 pr-3 font-medium text-right">Before</th>
                    <th className="py-2.5 pr-3 font-medium text-right">After</th>
                    <th className="py-2.5 pr-3 font-medium text-right">Reduction</th>
                    <th className="py-2.5 font-medium">Decision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {scopedCapas.map((cp) => {
                    const red =
                      cp.effectiveness.complaintsBefore > 0 &&
                      cp.effectiveness.complaintsAfter !== null
                        ? Number(
                            (
                              ((cp.effectiveness.complaintsBefore -
                                cp.effectiveness.complaintsAfter) /
                                cp.effectiveness.complaintsBefore) *
                              100
                            ).toFixed(1)
                          )
                        : null;
                    return (
                      <tr key={cp.id}>
                        <td className="py-2.5 pr-3 font-mono font-semibold text-cyan-800">{cp.id}</td>
                        <td className="py-2.5 pr-3 font-mono">{cp.complaintId}</td>
                        <td className="py-2.5 pr-3">
                          {cp.productName} · {cp.manufacturingProcess}
                        </td>
                        <td className="py-2.5 pr-3">{cp.owner}</td>
                        <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                          {cp.effectiveness.complaintsBefore}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                          {cp.effectiveness.complaintsAfter ?? '—'}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                          {red !== null ? `${red}%` : 'Not Applicable'}
                        </td>
                        <td className="py-2.5">{cp.effectiveness.decision}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'monthly-complaint' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 pr-3 font-medium">Month</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Total</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Open / Active</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Closed</th>
                  <th className="py-2.5 font-medium text-right">Critical</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                {monthlyTrends.map((m) => (
                  <tr key={m.month}>
                    <td className="py-2.5 pr-3 font-medium text-slate-900">{m.month}</td>
                    <td className="py-2.5 pr-3 text-right">{m.total}</td>
                    <td className="py-2.5 pr-3 text-right text-amber-700">{m.open}</td>
                    <td className="py-2.5 pr-3 text-right text-emerald-700">{m.closed}</td>
                    <td className="py-2.5 text-right text-red-700">{m.critical}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
