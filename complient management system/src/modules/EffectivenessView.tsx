import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  Loader2,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { EffectivenessAnalyticsPanel } from '../components/EffectivenessAnalyticsPanel';
import { requestEffectivenessInsights } from '../services/aiClient';
import type {
  AIEffectivenessInsights,
  CAPAEffectivenessDecision,
  CAPARecord,
  ComplaintRecord,
  ModuleId,
  RecurrenceClassification,
} from '../types/qms';
import { evaluateEffectivenessMetrics, resolveEffectiveCapaStatus } from '../utils/capaUtils';
import {
  computeBeforeAfterAnalysis,
  computeEffectivenessAnalytics,
  computeEffectivenessDashboardKpis,
  computeQualityPerformanceScorecard,
  detectPostCapaRecurrences,
} from '../utils/effectivenessEngine';

interface EffectivenessViewProps {
  complaints: ComplaintRecord[];
  capaRecords: CAPARecord[];
  onUpdateCapa: (
    capaId: string,
    patch: Partial<CAPARecord>,
    auditMeta?: { action?: string; actor?: string; notes?: string }
  ) => void;
  onNavigate?: (module: ModuleId, complaintId?: string) => void;
}

type EffectivenessTab =
  | 'monitoring'
  | 'recurring'
  | 'analytics'
  | 'scorecard'
  | 'ai-insights';

function decisionBadgeClass(decision: CAPAEffectivenessDecision): string {
  if (decision === 'Effective') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (decision === 'Ineffective') return 'bg-red-50 text-red-800 border-red-200';
  if (decision === 'Inconclusive') return 'bg-amber-50 text-amber-800 border-amber-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

export function EffectivenessView({
  complaints,
  capaRecords,
  onUpdateCapa,
  onNavigate,
}: EffectivenessViewProps) {
  const [activeTab, setActiveTab] = useState<EffectivenessTab>('monitoring');
  const [beforeAfterScope, setBeforeAfterScope] = useState<string>('ALL');
  const [recurrenceFilter, setRecurrenceFilter] = useState<
    'ALL' | RecurrenceClassification
  >('ALL');

  // Verification / Audit modal state for a CAPARecord
  const [selectedCapaId, setSelectedCapaId] = useState<string | null>(null);
  const [afterCountDraft, setAfterCountDraft] = useState<string>('');
  const [volBeforeDraft, setVolBeforeDraft] = useState<string>('');
  const [volAfterDraft, setVolAfterDraft] = useState<string>('');
  const [decisionDraft, setDecisionDraft] =
    useState<CAPAEffectivenessDecision>('Pending');
  const [evidenceDraft, setEvidenceDraft] = useState<string>('');
  const [methodDraft, setMethodDraft] = useState<string>('');
  const [commentsDraft, setCommentsDraft] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  // AI Quality Insights state
  const [aiInsights, setAiInsights] = useState<AIEffectivenessInsights | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const kpis = useMemo(
    () => computeEffectivenessDashboardKpis(complaints, capaRecords),
    [complaints, capaRecords]
  );

  const beforeAfter = useMemo(
    () => computeBeforeAfterAnalysis(complaints, capaRecords, beforeAfterScope),
    [complaints, capaRecords, beforeAfterScope]
  );

  const postCapaRecurrences = useMemo(
    () => detectPostCapaRecurrences(complaints, capaRecords),
    [complaints, capaRecords]
  );

  const filteredRecurrences = useMemo(() => {
    if (recurrenceFilter === 'ALL') return postCapaRecurrences;
    return postCapaRecurrences.filter((m) => m.classification === recurrenceFilter);
  }, [postCapaRecurrences, recurrenceFilter]);

  const scorecard = useMemo(
    () => computeQualityPerformanceScorecard(complaints, capaRecords),
    [complaints, capaRecords]
  );

  const selectedCapa = useMemo(
    () => capaRecords.find((cp) => cp.id === selectedCapaId) ?? null,
    [capaRecords, selectedCapaId]
  );

  const openCapaAuditModal = (cp: CAPARecord) => {
    setSelectedCapaId(cp.id);
    setAfterCountDraft(
      cp.effectiveness.complaintsAfter !== null ? String(cp.effectiveness.complaintsAfter) : ''
    );
    setVolBeforeDraft(
      cp.effectiveness.productionVolumeBefore !== null
        ? String(cp.effectiveness.productionVolumeBefore)
        : ''
    );
    setVolAfterDraft(
      cp.effectiveness.productionVolumeAfter !== null
        ? String(cp.effectiveness.productionVolumeAfter)
        : ''
    );
    setDecisionDraft(cp.effectiveness.decision);
    setEvidenceDraft(cp.effectiveness.verificationEvidence || '');
    setMethodDraft(cp.effectiveness.verificationMethod || '');
    setCommentsDraft(cp.effectiveness.comments || '');
    setFormError(null);
  };

  const handleSaveVerification = () => {
    if (!selectedCapa) return;
    const afterVal = afterCountDraft.trim() === '' ? null : Number(afterCountDraft);
    const vBefore = volBeforeDraft.trim() === '' ? null : Number(volBeforeDraft);
    const vAfter = volAfterDraft.trim() === '' ? null : Number(volAfterDraft);

    if (afterVal !== null && (Number.isNaN(afterVal) || afterVal < 0)) {
      setFormError('Complaints After CAPA must be a valid non-negative integer.');
      return;
    }
    if (
      (vBefore !== null && (Number.isNaN(vBefore) || vBefore <= 0)) ||
      (vAfter !== null && (Number.isNaN(vAfter) || vAfter <= 0))
    ) {
      setFormError('Optional production volume denominators must be positive numbers.');
      return;
    }

    if (decisionDraft !== 'Pending') {
      if (afterVal === null) {
        setFormError(
          'Post-CAPA complaint count is required before saving an Effective, Ineffective, or Inconclusive decision.'
        );
        return;
      }
      if (!evidenceDraft.trim() && !commentsDraft.trim()) {
        setFormError(
          'Supporting verification evidence or manager comments are required before finalizing effectiveness.'
        );
        return;
      }
    }

    const metrics = evaluateEffectivenessMetrics({
      complaintsBefore: selectedCapa.effectiveness.complaintsBefore,
      complaintsAfter: afterVal,
      productionVolumeBefore: vBefore,
      productionVolumeAfter: vAfter,
      baselinePeriod: selectedCapa.effectiveness.baselinePeriod,
      postPeriod: selectedCapa.effectiveness.postPeriod,
    });

    const nextStatus =
      decisionDraft === 'Effective'
        ? 'Effective'
        : decisionDraft === 'Ineffective'
          ? 'Ineffective'
          : selectedCapa.managerCompletionApproved
            ? 'Pending Verification'
            : resolveEffectiveCapaStatus(selectedCapa, todayIso);

    onUpdateCapa(
      selectedCapa.id,
      {
        status: nextStatus,
        comments: commentsDraft.trim() || selectedCapa.comments,
        effectiveness: {
          ...selectedCapa.effectiveness,
          complaintsAfter: afterVal,
          productionVolumeBefore: vBefore,
          productionVolumeAfter: vAfter,
          defectRateBefore: metrics.defectRateBefore,
          defectRateAfter: metrics.defectRateAfter,
          repeatDefectOccurred: afterVal !== null ? afterVal > 0 : null,
          verificationMethod: methodDraft.trim() || selectedCapa.effectiveness.verificationMethod,
          verificationEvidence: evidenceDraft.trim(),
          decision: decisionDraft,
          isProvisionalComparison: metrics.isProvisionalComparison,
          observationSampleSizeOk: metrics.observationSampleSizeOk,
          insufficientDataNotice: metrics.insufficientDataNotice,
          verifiedDate:
            decisionDraft !== 'Pending' ? todayIso : selectedCapa.effectiveness.verifiedDate,
          reviewer:
            decisionDraft !== 'Pending'
              ? 'R. Deshmukh (Quality Manager)'
              : selectedCapa.effectiveness.reviewer,
          comments: commentsDraft.trim(),
        },
      },
      {
        action: `Effectiveness Verification Saved (${decisionDraft})`,
        actor: 'R. Deshmukh (Quality Manager)',
        notes: `Before: ${selectedCapa.effectiveness.complaintsBefore}, After: ${afterVal ?? 'Pending'}. ${evidenceDraft.trim()}`,
      }
    );

    setSelectedCapaId(null);
  };

  const handleGenerateAiInsights = async () => {
    setAiLoading(true);
    setAiError(null);
    setActiveTab('ai-insights');
    try {
      const analytics = computeEffectivenessAnalytics(complaints, capaRecords);
      const summary = {
        kpis,
        beforeAfterOverall: computeBeforeAfterAnalysis(complaints, capaRecords, 'ALL'),
        scorecard: scorecard.map((s) => ({
          indicator: s.label,
          current: s.currentValue,
          previous: s.previousValue,
          delta: s.deltaText,
          trend: s.trendDirection,
          availability: s.dataAvailability,
        })),
        capaEffectivenessBreakdown: analytics.capaEffectivenessDistribution,
        productImprovement: analytics.productImprovement.slice(0, 8),
        processImprovement: analytics.processImprovement.slice(0, 8),
        confirmedRecurrences: postCapaRecurrences
          .filter((r) => r.classification === 'Confirmed Recurrence')
          .slice(0, 8)
          .map((r) => ({
            complaintId: r.complaintId,
            product: r.productName,
            process: r.processName,
            category: r.category,
            relatedCapaId: r.relatedCapaId,
            relatedCapaDecision: r.relatedCapaDecision,
            verifiedRootCauseMatch: r.verifiedRootCauseMatch,
          })),
      };
      const res = await requestEffectivenessInsights(summary);
      setAiInsights(res);
    } catch (err) {
      setAiError(
        err instanceof Error
          ? err.message
          : 'Failed to generate AI quality effectiveness insights.'
      );
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Governance Header Banner */}
      <div className="bg-[#0B1426] text-slate-100 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-xs leading-relaxed">
            <p className="text-sm font-semibold text-white">
              Quality Effectiveness Monitoring &amp; Continuous Improvement (ISO 9001 §10.2)
            </p>
            <p className="text-slate-300 mt-0.5 max-w-3xl">
              Measures real complaint reduction, verified CAPA outcomes, post-CAPA recurrences, and period-over-period quality performance indicators. Reduction percentages require comparable baseline and post-CAPA data; normalized defect rates are displayed only when production volumes are recorded.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleGenerateAiInsights}
          disabled={aiLoading}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-cyan-700 hover:bg-cyan-600 disabled:opacity-60 rounded-md whitespace-nowrap self-start lg:self-center"
        >
          {aiLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          <span>{aiLoading ? 'Generating...' : 'Generate Quality Insights'}</span>
        </button>
      </div>

      {/* Section 1: 9 Dynamic Effectiveness Monitoring KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-3">
        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <p className="text-[11px] text-slate-500">Total Complaints</p>
          <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {kpis.totalCustomerComplaints}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <p className="text-[11px] text-slate-500">Complaints Resolved</p>
          <p className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
            {kpis.complaintsResolved}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <p className="text-[11px] text-slate-500">Recurring Complaints</p>
          <p className="text-xl font-bold font-mono tabular-nums text-amber-700 mt-1">
            {kpis.recurringComplaints}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <p className="text-[11px] text-slate-500">Verified Root Causes</p>
          <p className="text-xl font-bold font-mono tabular-nums text-cyan-800 mt-1">
            {kpis.verifiedRootCauses}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <p className="text-[11px] text-slate-500">CAPA Implemented</p>
          <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {kpis.totalCapaImplemented}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <p className="text-[11px] text-slate-500">Effective CAPA</p>
          <p className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
            {kpis.effectiveCapa}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <p className="text-[11px] text-slate-500">Ineffective CAPA</p>
          <p className="text-xl font-bold font-mono tabular-nums text-red-700 mt-1">
            {kpis.ineffectiveCapa}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <p className="text-[11px] text-slate-500">Avg CAPA Completion</p>
          <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {kpis.avgCapaCompletionDays !== null ? `${kpis.avgCapaCompletionDays}d` : '—'}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <p className="text-[11px] text-slate-500">Complaint Reduction</p>
          <p className="text-lg font-bold font-mono tabular-nums text-cyan-800 mt-1.5">
            {kpis.complaintReductionDisplay}
          </p>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
        {(
          [
            { id: 'monitoring', label: `Before/After & CAPA Register (${capaRecords.length})` },
            {
              id: 'recurring',
              label: `Recurring Complaint Monitoring (${postCapaRecurrences.length})`,
            },
            { id: 'analytics', label: 'Quality Improvement Analytics' },
            { id: 'scorecard', label: 'Quality Performance Scorecard' },
            { id: 'ai-insights', label: 'AI Quality Insights' },
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

      {/* TAB 1: BEFORE/AFTER PERFORMANCE + 13-COLUMN CAPA EFFECTIVENESS TABLE */}
      {activeTab === 'monitoring' && (
        <div className="space-y-6">
          {/* Section 2: Before-and-After Quality Performance Analysis */}
          <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Before-and-After Quality Performance Analysis
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Formula: Complaint Reduction (%) = ((Before - After) / Before) * 100. Returns &ldquo;Not Applicable&rdquo; if baseline is 0.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <label htmlFor="ba-scope" className="text-slate-500 font-medium">
                  Evaluation Scope:
                </label>
                <select
                  id="ba-scope"
                  value={beforeAfterScope}
                  onChange={(e) => setBeforeAfterScope(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-md bg-white text-slate-900"
                >
                  <option value="ALL">All Comparable CAPAs ({capaRecords.length})</option>
                  {capaRecords.map((cp) => (
                    <option key={cp.id} value={cp.id}>
                      {cp.id} · {cp.productName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                <p className="text-slate-500">Complaints Before</p>
                <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
                  {beforeAfter.complaintsBefore}
                </p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                <p className="text-slate-500">Complaints After</p>
                <p className="text-lg font-bold font-mono tabular-nums text-cyan-800 mt-1">
                  {beforeAfter.complaintsAfter !== null ? beforeAfter.complaintsAfter : 'Pending'}
                </p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                <p className="text-slate-500">Reduction (%)</p>
                <p className="text-lg font-bold font-mono tabular-nums text-emerald-700 mt-1">
                  {beforeAfter.reductionDisplay}
                </p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                <p className="text-slate-500">Volume Before</p>
                <p className="text-base font-bold font-mono tabular-nums text-slate-800 mt-1">
                  {beforeAfter.productionVolumeBefore !== null
                    ? `${beforeAfter.productionVolumeBefore.toLocaleString()} u`
                    : 'Not Recorded'}
                </p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                <p className="text-slate-500">Volume After</p>
                <p className="text-base font-bold font-mono tabular-nums text-slate-800 mt-1">
                  {beforeAfter.productionVolumeAfter !== null
                    ? `${beforeAfter.productionVolumeAfter.toLocaleString()} u`
                    : 'Not Recorded'}
                </p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                <p className="text-slate-500">Defect Rate Before</p>
                <p className="text-base font-bold font-mono tabular-nums text-slate-800 mt-1">
                  {beforeAfter.defectRateBefore !== null
                    ? `${beforeAfter.defectRateBefore} / 1k`
                    : 'Volume Missing'}
                </p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                <p className="text-slate-500">Defect Rate After</p>
                <p className="text-base font-bold font-mono tabular-nums text-slate-800 mt-1">
                  {beforeAfter.defectRateAfter !== null
                    ? `${beforeAfter.defectRateAfter} / 1k`
                    : 'Volume Missing'}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-xs space-y-1">
              <p className="text-slate-800">
                <strong>Process Performance Summary:</strong> {beforeAfter.processPerformanceSummary}
              </p>
              <p className={beforeAfter.provisionalCountsOnly ? 'text-amber-800' : 'text-emerald-800'}>
                {beforeAfter.notes}
              </p>
            </div>
          </section>

          {/* Section 3: 13-Column CAPA Effectiveness Monitoring Table */}
          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  CAPA Effectiveness Monitoring Register
                </h2>
                <p className="text-xs text-slate-500">
                  Inspect full implementation and verification history or record a Quality Manager effectiveness decision
                </p>
              </div>
            </div>

            {capaRecords.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                No CAPA records found. Create or approve CAPA actions in the CAPA Management module to monitor effectiveness.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 whitespace-nowrap">
                      <th className="py-3 px-3 font-medium">CAPA ID</th>
                      <th className="py-3 px-3 font-medium">Complaint ID</th>
                      <th className="py-3 px-3 font-medium">Product</th>
                      <th className="py-3 px-3 font-medium">Process</th>
                      <th className="py-3 px-3 font-medium">Root Cause</th>
                      <th className="py-3 px-3 font-medium">Corrective Action</th>
                      <th className="py-3 px-3 font-medium">Preventive Action</th>
                      <th className="py-3 px-3 font-medium">Impl. Date</th>
                      <th className="py-3 px-3 font-medium">Verif. Date</th>
                      <th className="py-3 px-3 font-medium text-right">Before Perf.</th>
                      <th className="py-3 px-3 font-medium text-right">After Perf.</th>
                      <th className="py-3 px-3 font-medium">Effectiveness Status</th>
                      <th className="py-3 px-3 font-medium text-right">Quality Manager Decision</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {capaRecords.map((cp) => {
                      const effSt = resolveEffectiveCapaStatus(cp, todayIso);
                      const corrText =
                        cp.correctiveActions[0]?.title || cp.description || '—';
                      const prevText =
                        cp.preventiveActions[0]?.title || 'Pending preventive definition';
                      const effLabel =
                        cp.effectiveness.decision === 'Pending'
                          ? 'Pending Verification'
                          : cp.effectiveness.decision;
                      const reduction =
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
                        <tr key={cp.id} className="hover:bg-slate-50/70 align-top">
                          <td className="py-3 px-3 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => openCapaAuditModal(cp)}
                              className="font-mono font-semibold text-cyan-800 hover:underline"
                            >
                              {cp.id}
                            </button>
                            <p className="text-[10px] text-slate-400">
                              {cp.isDemoData ? 'DEMO DATA' : 'LIVE RECORD'} · {effSt}
                            </p>
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-700 whitespace-nowrap">
                            {onNavigate ? (
                              <button
                                type="button"
                                onClick={() => onNavigate('complaints', cp.complaintId)}
                                className="hover:text-cyan-800 hover:underline"
                              >
                                {cp.complaintId}
                              </button>
                            ) : (
                              cp.complaintId
                            )}
                          </td>
                          <td className="py-3 px-3 text-slate-900 font-medium min-w-[140px]">
                            {cp.productName}
                          </td>
                          <td className="py-3 px-3 text-slate-700 whitespace-nowrap">
                            {cp.manufacturingProcess}
                          </td>
                          <td className="py-3 px-3 text-slate-700 max-w-[180px]">
                            <p className="line-clamp-2">{cp.rootCause}</p>
                            <span className="text-[10px] text-slate-500">
                              {cp.rootCauseVerificationStatus}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-700 max-w-[180px]">
                            <p className="line-clamp-2">{corrText}</p>
                          </td>
                          <td className="py-3 px-3 text-slate-700 max-w-[180px]">
                            <p className="line-clamp-2">{prevText}</p>
                          </td>
                          <td className="py-3 px-3 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                            {cp.actualCompletionDate || cp.targetCompletionDate}
                          </td>
                          <td className="py-3 px-3 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                            {cp.effectiveness.verifiedDate || 'Pending'}
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            <p className="text-slate-900 font-semibold">
                              {cp.effectiveness.complaintsBefore} cmp
                            </p>
                            {cp.effectiveness.defectRateBefore !== null && (
                              <p className="text-[10px] text-slate-500">
                                {cp.effectiveness.defectRateBefore}/1k
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            <p className="text-slate-900 font-semibold">
                              {cp.effectiveness.complaintsAfter !== null
                                ? `${cp.effectiveness.complaintsAfter} cmp`
                                : 'Pending'}
                            </p>
                            {reduction !== null && (
                              <p className="text-[10px] text-emerald-700">
                                {reduction}% red.
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span
                              className={`inline-flex px-2 py-0.5 text-[11px] font-medium border rounded ${decisionBadgeClass(
                                cp.effectiveness.decision
                              )}`}
                            >
                              {effLabel}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => openCapaAuditModal(cp)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-cyan-800 bg-cyan-50 border border-cyan-200 rounded hover:bg-cyan-100"
                            >
                              <Eye className="w-3 h-3" aria-hidden="true" />
                              <span>Inspect &amp; Decide</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 2: SECTION 4 — RECURRING COMPLAINT MONITORING */}
      {activeTab === 'recurring' && (
        <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Post-CAPA Recurring Complaint Monitoring ({filteredRecurrences.length})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Monitors new complaints occurring after CAPA implementation across product, process, machine, batch, description similarity, and verified root cause. Two complaints are never labeled as sharing the same root cause without physical/manager verification.
              </p>
            </div>
            <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-md self-start">
              {(
                ['ALL', 'Confirmed Recurrence', 'Possible Recurrence'] as const
              ).map((cls) => (
                <button
                  key={cls}
                  type="button"
                  onClick={() => setRecurrenceFilter(cls)}
                  className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap ${
                    recurrenceFilter === cls
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {cls}
                </button>
              ))}
            </div>
          </div>

          {filteredRecurrences.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto" aria-hidden="true" />
              <p className="text-sm font-medium text-slate-800">
                No Post-CAPA Recurrences Detected in Current Scope
              </p>
              <p className="text-xs text-slate-500">
                Implemented CAPAs show no matching subsequent complaints meeting recurrence criteria.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filteredRecurrences.map((m) => (
                <div key={m.id} className="py-4 space-y-2">
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span
                          className={`px-2 py-0.5 font-medium rounded border ${
                            m.classification === 'Confirmed Recurrence'
                              ? 'bg-red-50 text-red-800 border-red-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}
                        >
                          {m.classification}
                        </span>
                        <span className="font-mono font-semibold text-cyan-800">
                          {m.complaintId}
                        </span>
                        <span className="text-slate-500 font-mono tabular-nums">
                          ({m.complaintDate})
                        </span>
                        <span aria-hidden="true">→</span>
                        <span className="font-mono font-semibold text-slate-900">
                          Linked {m.relatedCapaId}
                        </span>
                        <span className="text-slate-500">
                          (CAPA Status: {m.relatedCapaDecision})
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-slate-900">
                        {m.productName} · {m.category} · {m.processName} (Batch {m.batchNumber})
                      </p>
                      <p className="text-xs text-slate-700">{m.explanation}</p>
                      <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-600">
                        <span>
                          <strong>Signals:</strong> {m.matchDimensions.join(', ')}
                        </span>
                        {m.verifiedRootCauseMatch ? (
                          <span className="text-emerald-700 font-medium">
                            · Verified Root Cause Parity Confirmed
                          </span>
                        ) : (
                          <span className="text-amber-700">
                            · Root Cause Parity Unverified (Requires Physical Audit)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {onNavigate && (
                        <>
                          <button
                            type="button"
                            onClick={() => onNavigate('complaints', m.complaintId)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50"
                          >
                            <span>View Complaint</span>
                            <ArrowRight className="w-3 h-3" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onNavigate('capa', m.relatedCapaId)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-cyan-800 bg-cyan-50 border border-cyan-200 rounded hover:bg-cyan-100"
                          >
                            <span>Open CAPA</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* TAB 3: SECTION 5 — QUALITY IMPROVEMENT ANALYTICS (5 FILTERS + 8 CHARTS) */}
      {activeTab === 'analytics' && (
        <EffectivenessAnalyticsPanel complaints={complaints} capaRecords={capaRecords} />
      )}

      {/* TAB 4: SECTION 8 — QUALITY PERFORMANCE SCORECARD */}
      {activeTab === 'scorecard' && (
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-base font-semibold text-slate-900">
              Quality Performance Scorecard (Period-over-Period)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tracks 7 measurable quality indicators with transparent formulas and data-availability status (no arbitrary composite overall scores).
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="py-3 px-4 font-medium">Quality Indicator</th>
                  <th className="py-3 px-4 font-medium">Current Period</th>
                  <th className="py-3 px-4 font-medium">Previous Period</th>
                  <th className="py-3 px-4 font-medium">Delta</th>
                  <th className="py-3 px-4 font-medium">Direction</th>
                  <th className="py-3 px-4 font-medium">Data Availability</th>
                  <th className="py-3 px-4 font-medium">Calculation Formula</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scorecard.map((ind) => (
                  <tr key={ind.id} className="hover:bg-slate-50/70 align-top">
                    <td className="py-3 px-4 font-semibold text-slate-900">{ind.label}</td>
                    <td className="py-3 px-4 font-mono tabular-nums font-semibold text-slate-900">
                      {ind.currentValue}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-600">
                      {ind.previousValue}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-800">
                      {ind.deltaText}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-medium ${
                          ind.trendDirection === 'Improved'
                            ? 'text-emerald-700'
                            : ind.trendDirection === 'Deteriorated'
                              ? 'text-red-700'
                              : 'text-slate-600'
                        }`}
                      >
                        {ind.trendDirection}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-700">{ind.dataAvailability}</td>
                    <td className="py-3 px-4 text-slate-600 max-w-xs">{ind.explanation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 5: SECTION 6 — AI-BASED QUALITY IMPROVEMENT INSIGHTS */}
      {activeTab === 'ai-insights' && (
        <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Gemini AI Quality Improvement &amp; Effectiveness Insights
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Grounded strictly in your measured before/after metrics, scorecard, and post-CAPA recurrences — clearly separating observed facts from AI suggestions.
              </p>
            </div>
            <button
              type="button"
              onClick={handleGenerateAiInsights}
              disabled={aiLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-md self-start"
            >
              {aiLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" aria-hidden="true" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
              )}
              <span>{aiInsights ? 'Refresh Quality Insights' : 'Generate Quality Insights'}</span>
            </button>
          </div>

          {aiError && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3.5 flex items-start gap-2.5 text-xs text-red-800">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-semibold">AI Quality Insights Unavailable</p>
                <p className="mt-0.5">{aiError}</p>
              </div>
            </div>
          )}

          {!aiInsights && !aiLoading && !aiError && (
            <p className="text-xs text-slate-500 py-6">
              Click &ldquo;Generate Quality Insights&rdquo; to send aggregated QMS effectiveness telemetry to Gemini AI and generate a structured continuous-improvement briefing.
            </p>
          )}

          {aiLoading && (
            <div className="py-8 flex items-center gap-2 text-xs text-slate-600">
              <Loader2 className="w-4 h-4 animate-spin text-cyan-700" aria-hidden="true" />
              <span>Analyzing verified CAPA effectiveness and recurring complaint patterns with Gemini...</span>
            </div>
          )}

          {aiInsights && (
            <div className="space-y-5 text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-md p-4">
                <p className="font-semibold text-slate-900 mb-1">
                  Executive Briefing (Measured Facts + AI Synthesis)
                </p>
                <p className="text-slate-700 leading-relaxed">{aiInsights.executiveSummary}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-emerald-200 bg-emerald-50/30 rounded-md p-4 space-y-2">
                  <p className="font-semibold text-emerald-900">
                    Measured Results · Major Improvements
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-700">
                    {aiInsights.majorImprovements.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="border border-slate-200 rounded-md p-4 space-y-2">
                  <p className="font-semibold text-slate-900">
                    Measured Results · CAPA Effectiveness Observations
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-700">
                    {aiInsights.capaEffectivenessObservations.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="border border-red-200 bg-red-50/20 rounded-md p-4 space-y-2">
                  <p className="font-semibold text-red-900">
                    Observed Exposure · Areas with Recurring Problems
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-700">
                    {aiInsights.areasWithRecurringProblems.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="border border-slate-200 rounded-md p-4 space-y-2">
                  <p className="font-semibold text-slate-900">
                    Observed Exposure · Products &amp; Processes Needing Attention
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-700">
                    {aiInsights.productsRequiringAttention.map((item, i) => (
                      <li key={`p-${i}`}>{item}</li>
                    ))}
                    {aiInsights.processesWithRepeatedDefects.map((item, i) => (
                      <li key={`pr-${i}`}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="border border-cyan-200 bg-cyan-50/30 rounded-md p-4 space-y-2">
                  <p className="font-semibold text-cyan-950">
                    AI Recommendations · Quality Improvement Opportunities
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-700">
                    {aiInsights.qualityImprovementOpportunities.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="border border-cyan-200 bg-cyan-50/30 rounded-md p-4 space-y-2">
                  <p className="font-semibold text-cyan-950">
                    AI Recommendations · Recommended Next Steps
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-700">
                    {aiInsights.recommendedNextSteps.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-600">
                <span>
                  <strong>Data Sufficiency Disclosure:</strong> {aiInsights.dataSufficiencyNote}
                </span>
                <span className="font-mono tabular-nums text-slate-400 shrink-0">
                  Generated {new Date(aiInsights.generatedAt).toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Modal: Inspect Full CAPA Implementation & Verification History + Record Decision */}
      {selectedCapa && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="px-6 py-4 bg-[#0B1426] text-white flex items-center justify-between sticky top-0 z-10">
              <div>
                <p className="text-[11px] font-mono text-cyan-400">
                  {selectedCapa.id} · {selectedCapa.complaintId}
                </p>
                <h3 className="text-base font-bold">
                  CAPA Effectiveness Inspection &amp; Quality Manager Decision
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCapaId(null)}
                className="p-1.5 text-slate-300 hover:text-white"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 border border-slate-200 rounded-md p-3.5">
                <div>
                  <p className="text-slate-500">Product / Process</p>
                  <p className="font-semibold text-slate-900 mt-0.5">
                    {selectedCapa.productName} · {selectedCapa.manufacturingProcess}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Owner / Department</p>
                  <p className="font-semibold text-slate-900 mt-0.5">
                    {selectedCapa.owner} · {selectedCapa.responsibleDepartment}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Root Cause ({selectedCapa.rootCauseVerificationStatus})</p>
                  <p className="font-semibold text-slate-900 mt-0.5">{selectedCapa.rootCause}</p>
                </div>
              </div>

              {/* Action Plan Progress Summary */}
              <div className="space-y-2">
                <h4 className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <ClipboardCheck className="w-4 h-4 text-cyan-700" aria-hidden="true" />
                  <span>Implemented Containment, Corrective &amp; Preventive Actions</span>
                </h4>
                <div className="border border-slate-200 rounded-md divide-y divide-slate-100">
                  {[
                    ...selectedCapa.containmentActions,
                    ...selectedCapa.correctiveActions,
                    ...selectedCapa.preventiveActions,
                  ].map((t) => (
                    <div key={t.id} className="p-2.5 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">
                          <span className="text-cyan-800">[{t.actionType}]</span> {t.title}
                        </p>
                        <p className="text-slate-500 mt-0.5">
                          Owner: {t.responsiblePerson} · Target: {t.targetDate}
                          {t.implementationEvidence ? ` · Evidence: ${t.implementationEvidence}` : ''}
                        </p>
                      </div>
                      <span className="font-mono tabular-nums text-slate-700 shrink-0">
                        {t.status} ({t.progressPercent}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Verification Form */}
              <div className="border border-slate-200 rounded-md p-4 space-y-3 bg-slate-50/50">
                <h4 className="font-semibold text-slate-900">
                  Quality Manager Effectiveness Evaluation
                </h4>
                {formError && (
                  <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 font-medium">
                    {formError}
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Complaints Before (Baseline)
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={selectedCapa.effectiveness.complaintsBefore}
                      className="w-full px-2.5 py-1.5 bg-slate-100 border border-slate-300 rounded font-mono tabular-nums text-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Complaints After CAPA
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={afterCountDraft}
                      onChange={(e) => setAfterCountDraft(e.target.value)}
                      placeholder="e.g., 0"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Prod. Volume Before (Optional)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={volBeforeDraft}
                      onChange={(e) => setVolBeforeDraft(e.target.value)}
                      placeholder="Units (optional)"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Prod. Volume After (Optional)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={volAfterDraft}
                      onChange={(e) => setVolAfterDraft(e.target.value)}
                      placeholder="Units (optional)"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded font-mono tabular-nums"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Quality Manager Decision
                    </label>
                    <select
                      value={decisionDraft}
                      onChange={(e) =>
                        setDecisionDraft(e.target.value as CAPAEffectivenessDecision)
                      }
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded"
                    >
                      <option value="Pending">Pending Verification</option>
                      <option value="Effective">Effective</option>
                      <option value="Ineffective">Ineffective</option>
                      <option value="Inconclusive">Inconclusive</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Verification Method
                    </label>
                    <input
                      type="text"
                      value={methodDraft}
                      onChange={(e) => setMethodDraft(e.target.value)}
                      placeholder="e.g., 90-day field audit & CMM sample verification"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Supporting Verification Evidence
                  </label>
                  <input
                    type="text"
                    value={evidenceDraft}
                    onChange={(e) => setEvidenceDraft(e.target.value)}
                    placeholder="Record metrology audit lot IDs, inspection pass counts, or recurrence review..."
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Quality Manager Comments
                  </label>
                  <textarea
                    rows={2}
                    value={commentsDraft}
                    onChange={(e) => setCommentsDraft(e.target.value)}
                    placeholder="Final effectiveness rationale and closure/escalation notes..."
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setSelectedCapaId(null)}
                    className="px-3.5 py-1.5 text-xs text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveVerification}
                    className="px-4 py-1.5 text-xs font-medium text-white bg-cyan-700 rounded hover:bg-cyan-800"
                  >
                    Save Verification Decision
                  </button>
                </div>
              </div>

              {/* Full History Timeline */}
              <div className="space-y-2">
                <h4 className="font-semibold text-slate-900">
                  Implementation &amp; Verification Audit History ({selectedCapa.history.length})
                </h4>
                <div className="border border-slate-200 rounded-md divide-y divide-slate-100 max-h-48 overflow-y-auto">
                  {selectedCapa.history.map((h) => (
                    <div key={h.id} className="p-2.5">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-semibold text-slate-900">{h.action}</span>
                        <span className="font-mono text-slate-500">
                          {h.timestamp.slice(0, 10)} · {h.actor}
                        </span>
                      </div>
                      {h.notes && <p className="text-slate-600 mt-0.5">{h.notes}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
