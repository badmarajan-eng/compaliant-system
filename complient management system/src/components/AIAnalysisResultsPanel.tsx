import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  History,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { SeverityText } from './StatusText';
import type {
  AIClassificationResult,
  ComplaintCategory,
  ComplaintRecord,
  ManagerCauseDecision,
  ManagerVerificationRecord,
  SeverityLevel,
  VerificationStatus,
} from '../types/qms';
import { computeComplaintFingerprint } from '../utils/aiAnalysisUtils';
import { ALL_CATEGORIES, ALL_SEVERITIES } from '../utils/qmsAnalytics';

interface AIAnalysisResultsPanelProps {
  complaint: ComplaintRecord;
  loading: boolean;
  error: string | null;
  onRunAnalysis: () => void;
  onSaveManagerVerification: (
    complaintId: string,
    analysisId: string,
    verification: ManagerVerificationRecord,
    applyConfirmedFieldsToRecord: boolean
  ) => void;
}

const SEVERITY_BOX_CLASSES: Record<SeverityLevel, string> = {
  Low: 'bg-slate-50 border-slate-200',
  Medium: 'bg-amber-50/60 border-amber-200',
  High: 'bg-orange-50/70 border-orange-200',
  Critical: 'bg-red-50/70 border-red-200',
};

export function AIAnalysisResultsPanel({
  complaint,
  loading,
  error,
  onRunAnalysis,
  onSaveManagerVerification,
}: AIAnalysisResultsPanelProps) {
  const analyses = useMemo<AIClassificationResult[]>(() => {
    if (complaint.aiAnalysisHistory && complaint.aiAnalysisHistory.length > 0) {
      return complaint.aiAnalysisHistory;
    }
    return complaint.aiClassification ? [complaint.aiClassification] : [];
  }, [complaint.aiAnalysisHistory, complaint.aiClassification]);

  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string>(
    analyses[0]?.analysisId ?? ''
  );

  useEffect(() => {
    setSelectedAnalysisId(analyses[0]?.analysisId ?? '');
  }, [complaint.id, analyses[0]?.analysisId]);

  const activeAnalysis = useMemo(
    () =>
      analyses.find((a) => a.analysisId === selectedAnalysisId) ??
      analyses[0] ??
      null,
    [analyses, selectedAnalysisId]
  );

  const currentFingerprint = useMemo(
    () => computeComplaintFingerprint(complaint),
    [complaint]
  );

  const isOutdated = Boolean(
    activeAnalysis && activeAnalysis.sourceFingerprint !== currentFingerprint
  );

  // Manager Verification Draft State (stored separately from AI prediction)
  const [confirmedCategory, setConfirmedCategory] = useState<ComplaintCategory>(
    complaint.category
  );
  const [confirmedSeverity, setConfirmedSeverity] = useState<SeverityLevel>(
    complaint.severity
  );
  const [causeDecisions, setCauseDecisions] = useState<ManagerCauseDecision[]>([]);
  const [investigationNotes, setInvestigationNotes] = useState('');
  const [applyToRecord, setApplyToRecord] = useState(false);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);

  useEffect(() => {
    setVerificationNotice(null);
    if (!activeAnalysis) return;
    const existing = activeAnalysis.managerVerification;
    setConfirmedCategory(
      existing?.confirmedCategory ?? activeAnalysis.predictedCategory
    );
    setConfirmedSeverity(
      existing?.confirmedSeverity ?? activeAnalysis.suggestedSeverity
    );
    setInvestigationNotes(existing?.investigationNotes ?? '');
    setCauseDecisions(
      activeAnalysis.possibleCauses.map((cause) => {
        const match = existing?.causeDecisions.find((cd) => cd.causeId === cause.id);
        return (
          match ?? {
            causeId: cause.id,
            status: 'Pending Review',
            notes: '',
          }
        );
      })
    );
    setApplyToRecord(false);
  }, [activeAnalysis?.analysisId, complaint.id]);

  const updateCauseStatus = (causeId: string, status: VerificationStatus) => {
    setCauseDecisions((prev) =>
      prev.map((d) => (d.causeId === causeId ? { ...d, status } : d))
    );
  };

  const updateCauseNote = (causeId: string, notes: string) => {
    setCauseDecisions((prev) =>
      prev.map((d) => (d.causeId === causeId ? { ...d, notes } : d))
    );
  };

  const handleSubmitDecision = (decision: 'Accepted' | 'Rejected') => {
    if (!activeAnalysis) return;
    const payload: ManagerVerificationRecord = {
      decision,
      confirmedCategory,
      confirmedSeverity,
      causeDecisions,
      investigationNotes: investigationNotes.trim(),
      reviewedBy: complaint.assignedManager || 'R. Deshmukh (Quality Manager)',
      reviewedAt: new Date().toISOString(),
    };
    const shouldApply = decision === 'Accepted' && applyToRecord;
    onSaveManagerVerification(
      complaint.id,
      activeAnalysis.analysisId,
      payload,
      shouldApply
    );
    setVerificationNotice(
      decision === 'Accepted'
        ? shouldApply
          ? `Analysis accepted and complaint record updated to ${confirmedCategory} / ${confirmedSeverity}.`
          : `Analysis verification recorded separately (Accepted). Original complaint severity (${complaint.severity}) preserved.`
        : 'Analysis marked as Rejected. Manager decision and investigation notes saved.'
    );
  };

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
      {/* Panel Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-700" aria-hidden="true" />
            <span>Gemini AI Complaint Classification &amp; Diagnostic Panel</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time classification, defect identification, historical pattern matching, and initial unconfirmed root cause hypotheses.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {analyses.length > 0 && (
            <button
              type="button"
              onClick={onRunAnalysis}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-cyan-400 ${loading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{loading ? 'Re-analyzing...' : 'Re-analyze'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Error State with Retry */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-red-900">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-semibold">Gemini AI Analysis Error</p>
              <p className="mt-0.5 text-red-800">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRunAnalysis}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-red-700 rounded-md hover:bg-red-800 disabled:opacity-60 shrink-0 self-start sm:self-center"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Retry Analysis</span>
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="py-8 px-4 bg-slate-50 border border-slate-200 rounded-md flex items-center gap-3 text-xs text-slate-700">
          <span className="w-4 h-4 border-2 border-cyan-700 border-t-transparent rounded-full animate-spin shrink-0" />
          <div>
            <p className="font-semibold text-slate-900">
              Analyzing {complaint.id} with Gemini AI...
            </p>
            <p className="text-slate-500 mt-0.5">
              Sending complaint telemetry, test specifications, and historical complaint context to server-side complaintAnalysisService.
            </p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && !activeAnalysis && (
        <div className="py-10 text-center border border-dashed border-slate-200 rounded-md">
          <p className="text-sm font-medium text-slate-800">
            No Gemini AI analysis saved for {complaint.id} yet.
          </p>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Click &ldquo;Analyze with AI&rdquo; to evaluate defect keywords, category, suggested severity, historical pattern correlation, and initial root cause hypotheses.
          </p>
          <button
            type="button"
            onClick={onRunAnalysis}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
            <span>Analyze with AI</span>
          </button>
        </div>
      )}

      {/* Results Content */}
      {!loading && activeAnalysis && (
        <div className="space-y-6">
          {/* Analysis History Switcher */}
          <div className="bg-slate-50 border border-slate-200 rounded-md p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-700">
              <History className="w-4 h-4 text-cyan-700 shrink-0" aria-hidden="true" />
              <span className="font-semibold">
                Analysis History ({analyses.length} {analyses.length === 1 ? 'record' : 'records'})
              </span>
              <span className="text-slate-400" aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-slate-600">
                {new Date(activeAnalysis.analyzedAt).toLocaleString()}
              </span>
            </div>

            {analyses.length > 1 && (
              <div className="flex items-center gap-2">
                <label htmlFor={`history-select-${complaint.id}`} className="text-slate-600">
                  View Run:
                </label>
                <select
                  id={`history-select-${complaint.id}`}
                  value={activeAnalysis.analysisId}
                  onChange={(e) => setSelectedAnalysisId(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800"
                >
                  {analyses.map((run, idx) => {
                    const outdatedRun = run.sourceFingerprint !== currentFingerprint;
                    const decision = run.managerVerification?.decision ?? 'Pending';
                    return (
                      <option key={run.analysisId} value={run.analysisId}>
                        #{analyses.length - idx} · {new Date(run.analyzedAt).toLocaleString()} ({run.predictedCategory} · {decision}
                        {outdatedRun ? ' · Outdated' : ''})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>

          {/* Outdated Warning Banner */}
          {isOutdated && (
            <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="font-semibold">Analysis Outdated — Complaint Record Modified</p>
                  <p className="text-amber-900 mt-0.5">
                    Complaint details, process parameters, or test results were edited after this analysis ran on{' '}
                    {new Date(activeAnalysis.analyzedAt).toLocaleString()}. Historical results are preserved below; run Re-analyze to evaluate the updated telemetry.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onRunAnalysis}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-amber-700 rounded-md hover:bg-amber-800 shrink-0 self-start sm:self-center"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Re-analyze Updated Record</span>
              </button>
            </div>
          )}

          {/* Top Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-md">
              <p className="text-xs text-slate-500">AI Predicted Category</p>
              <p className="text-sm font-bold text-slate-900 mt-1">
                {activeAnalysis.predictedCategory}
              </p>
              <p className="text-[11px] text-slate-600 mt-1">
                Original recorded: <span className="font-medium">{complaint.category}</span>
              </p>
            </div>

            <div className={`p-4 border rounded-md ${SEVERITY_BOX_CLASSES[activeAnalysis.suggestedSeverity]}`}>
              <p className="text-xs text-slate-600">AI Suggested Severity</p>
              <div className="mt-1.5 flex items-center gap-2">
                <SeverityText severity={activeAnalysis.suggestedSeverity} />
              </div>
              <p className="text-[11px] text-slate-600 mt-1.5">
                Original severity (<span className="font-semibold">{complaint.severity}</span>) is not auto-overridden.
              </p>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-md">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Confidence Score</span>
                <span className="font-mono tabular-nums font-bold text-cyan-800">
                  {activeAnalysis.confidence.score}%
                </span>
              </div>
              <div className="w-full h-2 bg-slate-200 rounded-sm overflow-hidden mt-2">
                <div
                  className="h-full bg-cyan-700"
                  style={{ width: `${activeAnalysis.confidence.score}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">
                {activeAnalysis.confidence.explanation}
              </p>
            </div>
          </div>

          {/* Main Quality Issue & Analysis Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 border border-slate-200 rounded-md space-y-2">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Main Quality Issue
              </h4>
              <p className="text-sm font-medium text-slate-900 leading-relaxed">
                {activeAnalysis.mainQualityIssue}
              </p>
              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-500 mb-1.5">
                  Extracted Defect Keywords
                </p>
                <p className="text-xs font-mono text-slate-800 leading-6">
                  {activeAnalysis.defectKeywords.join('  ·  ')}
                </p>
              </div>
            </div>

            <div className="p-4 border border-slate-200 rounded-md space-y-2">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                AI Analysis Summary &amp; Severity Rationale
              </h4>
              <p className="text-sm text-slate-800 leading-relaxed">
                {activeAnalysis.analysisSummary}
              </p>
            </div>
          </div>

          {/* Historical Pattern Observations & Recommended Investigation Steps */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-md space-y-2">
              <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Historical Pattern Observations
              </h4>
              <p className="text-xs text-slate-700 leading-relaxed">
                {activeAnalysis.historicalPattern}
              </p>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-md space-y-2">
              <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Recommended Investigation Steps
              </h4>
              <ol className="list-decimal pl-4 space-y-1.5 text-xs text-slate-700">
                {activeAnalysis.recommendedInvestigationSteps.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>
            </div>
          </div>

          {/* Possible Root Causes (Initial Hypotheses — Unconfirmed) */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-700" aria-hidden="true" />
                <span>Possible Root Causes (Initial Unconfirmed Hypotheses)</span>
              </h4>
              <span className="text-[11px] text-amber-800 font-medium">
                Advisory hypotheses only — physical/metrology verification required
              </span>
            </div>

            <div className="space-y-3">
              {activeAnalysis.possibleCauses.map((hyp, index) => {
                const decisionEntry = causeDecisions.find((d) => d.causeId === hyp.id);
                const status = decisionEntry?.status ?? 'Pending Review';

                return (
                  <div
                    key={hyp.id}
                    className="p-4 border border-slate-200 rounded-md bg-white space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-mono text-slate-500">
                          Hypothesis #{index + 1} · {status}
                        </p>
                        <p className="text-sm font-semibold text-slate-900 mt-0.5">
                          {hyp.cause}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => updateCauseStatus(hyp.id, 'Verified')}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border transition-colors ${
                            status === 'Verified'
                              ? 'bg-emerald-700 text-white border-emerald-700'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-emerald-50'
                          }`}
                        >
                          <Check className="w-3 h-3" aria-hidden="true" />
                          <span>Verify Cause</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => updateCauseStatus(hyp.id, 'Rejected')}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border transition-colors ${
                            status === 'Rejected'
                              ? 'bg-red-700 text-white border-red-700'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-red-50'
                          }`}
                        >
                          <XCircle className="w-3 h-3" aria-hidden="true" />
                          <span>Reject Cause</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-2 border-t border-slate-100">
                      <div>
                        <p className="font-semibold text-slate-500">Relevance / Mechanism</p>
                        <p className="text-slate-700 mt-0.5">{hyp.reason}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-500">Available Evidence</p>
                        <p className="text-slate-700 mt-0.5">{hyp.evidenceAvailable}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-500">Additional Verification Required</p>
                        <p className="text-slate-700 mt-0.5">
                          {hyp.additionalVerificationRequired}
                        </p>
                      </div>
                    </div>

                    <div>
                      <input
                        type="text"
                        value={decisionEntry?.notes ?? ''}
                        onChange={(e) => updateCauseNote(hyp.id, e.target.value)}
                        placeholder={`Verification note for Hypothesis #${index + 1} (optional)...`}
                        className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded bg-slate-50 focus:bg-white focus:outline-none focus:border-cyan-700"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Manager Verification Controls (Stored Separately from AI Predictions) */}
          <div className="p-5 bg-slate-50 border border-slate-200 rounded-md space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">
                  Quality Manager Verification &amp; Sign-Off
                </h4>
                <p className="text-xs text-slate-500">
                  Manager decisions are stored separately from Gemini AI predictions.
                </p>
              </div>
              {activeAnalysis.managerVerification && (
                <div className="flex items-center gap-2 text-xs">
                  <Clock className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                  <span className="font-semibold text-slate-800">
                    Decision: {activeAnalysis.managerVerification.decision}
                  </span>
                  {activeAnalysis.managerVerification.reviewedAt && (
                    <span className="font-mono text-slate-500">
                      ({new Date(activeAnalysis.managerVerification.reviewedAt).toLocaleString()})
                    </span>
                  )}
                </div>
              )}
            </div>

            {verificationNotice && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
                <span>{verificationNotice}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Confirm or Modify Category
                </label>
                <select
                  value={confirmedCategory}
                  onChange={(e) => setConfirmedCategory(e.target.value as ComplaintCategory)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-slate-900"
                >
                  {ALL_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                      {cat === activeAnalysis.predictedCategory ? ' (AI Predicted)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Confirm or Modify Severity
                </label>
                <select
                  value={confirmedSeverity}
                  onChange={(e) => setConfirmedSeverity(e.target.value as SeverityLevel)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-slate-900"
                >
                  {ALL_SEVERITIES.map((sev) => (
                    <option key={sev} value={sev}>
                      {sev}
                      {sev === activeAnalysis.suggestedSeverity ? ' (AI Suggested)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-700 mb-1">
                  Manager Investigation Notes
                </label>
                <textarea
                  rows={2}
                  value={investigationNotes}
                  onChange={(e) => setInvestigationNotes(e.target.value)}
                  placeholder="Document inspection findings, metrology verification results, or rationale for accepting/rejecting AI output..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-slate-900"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyToRecord}
                  onChange={(e) => setApplyToRecord(e.target.checked)}
                  className="rounded border-slate-300 text-cyan-700 focus:ring-cyan-600"
                />
                <span>
                  Also update complaint record&apos;s category &amp; severity when accepting
                </span>
              </label>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => handleSubmitDecision('Rejected')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-red-700 bg-white border border-red-300 rounded-md hover:bg-red-50 transition-colors"
                >
                  <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Reject Analysis</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmitDecision('Accepted')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-cyan-700 rounded-md hover:bg-cyan-800 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Accept Analysis</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
