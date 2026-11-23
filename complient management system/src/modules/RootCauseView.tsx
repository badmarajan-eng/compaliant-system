import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileText,
  GitBranch,
  HelpCircle,
  History,
  ListOrdered,
  Network,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { FishboneDiagram } from '../components/FishboneDiagram';
import { FiveWhysPanel } from '../components/FiveWhysPanel';
import { RcaPrintableReport } from '../components/RcaPrintableReport';
import { SeverityText, StatusText } from '../components/StatusText';
import { requestRootCauseAnalysis } from '../services/aiClient';
import type {
  ComplaintRecord,
  FiveWhysStep,
  RcaHypothesisStatus,
  RootCauseAnalysisRecord,
  RootCauseHypothesis,
  SixMCategory,
} from '../types/qms';
import {
  ALL_6M_CATEGORIES,
  buildHistoricalRootCauseDatabase,
  computeRcaPortfolioMetrics,
  findMatchingHistoricalComplaints,
  infer6MCategory,
  rankRootCauseHypotheses,
} from '../utils/rcaUtils';

interface RootCauseViewProps {
  complaints: ComplaintRecord[];
  preselectedId?: string | null;
  onSaveRca: (id: string, rca: RootCauseAnalysisRecord) => void;
}

type RcaTab =
  | 'overview'
  | 'fishbone'
  | 'five-whys'
  | 'ranking'
  | 'history-db';

const PRIORITY_STYLE: Record<string, string> = {
  Critical: 'text-red-700 font-semibold',
  High: 'text-orange-700 font-semibold',
  Medium: 'text-amber-700 font-medium',
  Low: 'text-slate-600 font-medium',
};

export function RootCauseView({
  complaints,
  preselectedId,
  onSaveRca,
}: RootCauseViewProps) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>(
    preselectedId || complaints[0]?.id || ''
  );
  const [activeTab, setActiveTab] = useState<RcaTab>('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  // Manager Verification Form State (Module 7)
  const [manualRootCauseInput, setManualRootCauseInput] = useState('');
  const [verifiedCategory6M, setVerifiedCategory6M] =
    useState<SixMCategory>('Method');
  const [verifiedEvidenceInput, setVerifiedEvidenceInput] = useState('');
  const [verifiedByInput, setVerifiedByInput] = useState('R. Deshmukh');
  const [managerNotesInput, setManagerNotesInput] = useState('');
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [verificationFeedback, setVerificationFeedback] = useState<string | null>(
    null
  );

  // Root Cause History DB filter (Module 8)
  const [historySearch, setHistorySearch] = useState('');

  useEffect(() => {
    if (preselectedId) setSelectedId(preselectedId);
  }, [preselectedId]);

  const portfolioMetrics = useMemo(
    () => computeRcaPortfolioMetrics(complaints),
    [complaints]
  );

  const rootCauseHistoryDb = useMemo(
    () => buildHistoricalRootCauseDatabase(complaints),
    [complaints]
  );

  const filteredHistoryDb = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return rootCauseHistoryDb;
    return rootCauseHistoryDb.filter(
      (row) =>
        row.complaintId.toLowerCase().includes(q) ||
        row.productId.toLowerCase().includes(q) ||
        row.productName.toLowerCase().includes(q) ||
        row.batchNumber.toLowerCase().includes(q) ||
        row.processName.toLowerCase().includes(q) ||
        row.category6M.toLowerCase().includes(q) ||
        row.identifiedRootCause.toLowerCase().includes(q)
    );
  }, [rootCauseHistoryDb, historySearch]);

  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    return complaints.filter(
      (c) =>
        !q ||
        c.id.toLowerCase().includes(q) ||
        c.productName.toLowerCase().includes(q) ||
        c.processName.toLowerCase().includes(q) ||
        c.batchNumber.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q)
    );
  }, [complaints, search]);

  const selected = useMemo(
    () => complaints.find((c) => c.id === selectedId) ?? filteredList[0] ?? null,
    [complaints, selectedId, filteredList]
  );

  const historicalMatches = useMemo(
    () =>
      selected
        ? findMatchingHistoricalComplaints(selected, complaints, 12)
        : [],
    [selected, complaints]
  );

  const rankedCauses = useMemo(
    () =>
      selected?.rootCauseAnalysis
        ? rankRootCauseHypotheses(
            selected.rootCauseAnalysis.hypotheses,
            selected,
            historicalMatches
          )
        : [],
    [selected, historicalMatches]
  );

  useEffect(() => {
    if (!selected) return;
    const rca = selected.rootCauseAnalysis;
    setManualRootCauseInput(rca?.manualVerifiedRootCause ?? '');
    setVerifiedCategory6M(rca?.verifiedCategory6M ?? 'Method');
    setVerifiedEvidenceInput(rca?.verifiedEvidence ?? '');
    setVerifiedByInput(
      rca?.verifiedBy || selected.assignedManager || 'R. Deshmukh'
    );
    setManagerNotesInput(rca?.managerInvestigationNotes ?? '');
    setVerificationFeedback(null);

    const notes: Record<string, string> = {};
    rca?.hypotheses.forEach((h) => {
      notes[h.id] = h.managerNotes ?? '';
    });
    setNoteDrafts(notes);
  }, [selected?.id]);

  const handleInvestigateRootCause = async () => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    setVerificationFeedback(null);
    try {
      const rca = await requestRootCauseAnalysis(selected, complaints);
      const existing = selected.rootCauseAnalysis;
      onSaveRca(selected.id, {
        ...rca,
        manualVerifiedRootCause: existing?.manualVerifiedRootCause,
        verifiedCategory6M: existing?.verifiedCategory6M,
        verifiedEvidence: existing?.verifiedEvidence,
        verifiedBy: existing?.verifiedBy,
        verifiedDate: existing?.verifiedDate,
        managerInvestigationNotes: existing?.managerInvestigationNotes,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to complete Gemini root cause investigation.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleHypothesisDecision = (
    hypothesisId: string,
    status: RcaHypothesisStatus
  ) => {
    if (!selected?.rootCauseAnalysis) return;
    const targetHyp = selected.rootCauseAnalysis.hypotheses.find(
      (h) => h.id === hypothesisId
    );
    const noteText =
      noteDrafts[hypothesisId]?.trim() || targetHyp?.managerNotes || '';
    const reviewer = verifiedByInput.trim() || 'R. Deshmukh (Quality Manager)';
    const nowIso = new Date().toISOString();

    const updatedHypotheses = selected.rootCauseAnalysis.hypotheses.map((h) =>
      h.id === hypothesisId
        ? {
            ...h,
            managerStatus: status,
            managerNotes: noteText,
            reviewedAt: nowIso,
            reviewedBy: reviewer,
          }
        : h
    );

    const isVerifying = status === 'Verified';
    onSaveRca(selected.id, {
      ...selected.rootCauseAnalysis,
      hypotheses: updatedHypotheses,
      ...(isVerifying && targetHyp
        ? {
            manualVerifiedRootCause:
              selected.rootCauseAnalysis.manualVerifiedRootCause ||
              targetHyp.title,
            verifiedCategory6M: infer6MCategory(targetHyp),
            verifiedEvidence:
              noteText ||
              targetHyp.supportingEvidence ||
              'Verified during physical QA inspection.',
            verifiedBy: reviewer,
            verifiedDate: nowIso.slice(0, 10),
          }
        : {}),
    });

    setVerificationFeedback(
      status === 'Verified'
        ? `Hypothesis verified by ${reviewer} and recorded to Root Cause History.`
        : status === 'Rejected'
        ? `Hypothesis rejected by ${reviewer}. Original AI record preserved.`
        : `Hypothesis flagged for further investigation.`
    );
  };

  const handleSaveOfficialVerification = () => {
    if (!selected || !manualRootCauseInput.trim()) return;
    const nowDate = new Date().toISOString().slice(0, 10);
    const reviewer = verifiedByInput.trim() || 'R. Deshmukh';

    const base: RootCauseAnalysisRecord = selected.rootCauseAnalysis ?? {
      hypotheses: [],
      relatedComplaintIds: historicalMatches.map((m) => m.complaint.id),
      confidenceLevel: 'High',
      confidenceExplanation:
        'Direct physical root cause verified by Quality Management.',
      disclaimer:
        'Verified root cause recorded by Quality Management.',
      generatedAt: new Date().toISOString(),
    };

    onSaveRca(selected.id, {
      ...base,
      manualVerifiedRootCause: manualRootCauseInput.trim(),
      verifiedCategory6M,
      verifiedEvidence:
        verifiedEvidenceInput.trim() ||
        'Physical inspection and metrology verification documented.',
      verifiedBy: reviewer,
      verifiedDate: nowDate,
      managerInvestigationNotes: managerNotesInput.trim(),
    });

    setVerificationFeedback(
      `Official verified root cause saved for ${selected.id} by ${reviewer} (${nowDate}).`
    );
  };

  const handleSaveFiveWhys = (steps: FiveWhysStep[]) => {
    if (!selected) return;
    const base: RootCauseAnalysisRecord = selected.rootCauseAnalysis ?? {
      hypotheses: [],
      relatedComplaintIds: [],
      confidenceLevel: 'Medium',
      confidenceExplanation: '5 Whys investigation initiated by Quality Manager.',
      disclaimer:
        '5 Whys causal steps represent investigative hypotheses until validated with physical evidence.',
      generatedAt: new Date().toISOString(),
    };
    onSaveRca(selected.id, {
      ...base,
      fiveWhys: steps,
    });
  };

  const handleAddFishboneCause = (
    category6M: SixMCategory,
    title: string,
    description: string,
    evidence: string
  ) => {
    if (!selected) return;
    const base: RootCauseAnalysisRecord = selected.rootCauseAnalysis ?? {
      hypotheses: [],
      relatedComplaintIds: [],
      confidenceLevel: 'Medium',
      confidenceExplanation: '6M Fishbone investigation initiated by Quality Manager.',
      disclaimer:
        'AI hypotheses and manager entries require verification before closure.',
      generatedAt: new Date().toISOString(),
    };
    const newHyp: RootCauseHypothesis = {
      id: `HYP-${selected.id}-MGR-${Date.now()}`,
      title,
      description,
      category6M,
      origin: 'Manager Added',
      likelihood: 'Medium',
      supportingEvidence: evidence,
      evidenceSupported: !/insufficient|none/i.test(evidence),
      affectedProcessOrProduct: `${selected.productName} / ${selected.processName}`,
      investigationSteps: ['Verify on shop floor / metrology bench'],
      managerStatus: 'Pending Review',
    };
    onSaveRca(selected.id, {
      ...base,
      hypotheses: [...base.hypotheses, newHyp],
    });
  };

  const handleEditFishboneCause = (
    causeId: string,
    patch: Partial<RootCauseHypothesis>
  ) => {
    if (!selected?.rootCauseAnalysis) return;
    onSaveRca(selected.id, {
      ...selected.rootCauseAnalysis,
      hypotheses: selected.rootCauseAnalysis.hypotheses.map((h) =>
        h.id === causeId ? { ...h, ...patch } : h
      ),
    });
  };

  const handleRemoveFishboneCause = (causeId: string) => {
    if (!selected?.rootCauseAnalysis) return;
    onSaveRca(selected.id, {
      ...selected.rootCauseAnalysis,
      hypotheses: selected.rootCauseAnalysis.hypotheses.filter(
        (h) => h.id !== causeId
      ),
    });
  };

  if (complaints.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-10 text-center text-sm text-slate-600">
        No complaints available for root cause investigation.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* MODULE 1: Portfolio RCA KPI Summary */}
      <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Complaints Analyzed</p>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            {portfolioMetrics.totalAnalyzed}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            of {complaints.length} records
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Root Causes Identified</p>
          <p className="text-2xl font-bold text-cyan-800 font-mono tabular-nums mt-1">
            {portfolioMetrics.totalHypothesesIdentified}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">6M candidate causes</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Pending Investigations</p>
          <p className="text-2xl font-bold text-amber-700 font-mono tabular-nums mt-1">
            {portfolioMetrics.pendingInvestigations}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Awaiting verification</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Verified Root Causes</p>
          <p className="text-2xl font-bold text-emerald-700 font-mono tabular-nums mt-1">
            {portfolioMetrics.verifiedRootCauses}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Manager confirmed</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Recurring Patterns</p>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            {portfolioMetrics.recurringPatternsCount}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
            {portfolioMetrics.topRecurringPatterns[0]?.pattern ?? '6M / Process clusters'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Repeated-Defect Products</p>
          <p className="text-2xl font-bold text-red-700 font-mono tabular-nums mt-1">
            {portfolioMetrics.repeatedDefectProductsCount}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
            {portfolioMetrics.repeatedDefectProducts[0]?.productName ?? 'None'}
          </p>
        </div>
      </section>

      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Complaint Selection Interface (Module 1) */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-lg flex flex-col max-h-[900px]">
          <div className="p-4 border-b border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">
                Select Complaint for RCA
              </h2>
              <span className="text-[11px] font-mono text-slate-500">
                {filteredList.length}/{complaints.length}
              </span>
            </div>
            <div className="relative">
              <Search
                className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ID, product, batch, process..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-600/30"
              />
            </div>
          </div>

          <div className="overflow-y-auto divide-y divide-slate-100 flex-1">
            {filteredList.map((c) => {
              const active = selected?.id === c.id;
              const verifiedCount =
                c.rootCauseAnalysis?.hypotheses.filter(
                  (h) => h.managerStatus === 'Verified'
                ).length ?? 0;
              const hasManual = Boolean(
                c.rootCauseAnalysis?.manualVerifiedRootCause?.trim()
              );
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(c.id);
                    setError(null);
                  }}
                  className={`w-full text-left p-3.5 transition-colors ${
                    active ? 'bg-cyan-50/80' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-cyan-800">
                      {c.id}
                    </span>
                    <SeverityText severity={c.severity} />
                  </div>
                  <p className="text-xs font-medium text-slate-900 mt-1 truncate">
                    {c.productName}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                    {c.category} · {c.processName}
                  </p>
                  <div className="mt-2 text-[11px] flex items-center justify-between text-slate-500">
                    <span className="font-mono">{c.batchNumber}</span>
                    {verifiedCount > 0 || hasManual ? (
                      <span className="text-emerald-700 font-semibold">
                        Verified RCA
                      </span>
                    ) : c.rootCauseAnalysis ? (
                      <span className="text-amber-700 font-medium">
                        Hypotheses Pending ({c.rootCauseAnalysis.hypotheses.length})
                      </span>
                    ) : (
                      <span>Not Analyzed</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Investigation Workspace */}
        <div className="lg:col-span-8 space-y-5">
          {selected && (
            <>
              {/* Governance Banner */}
              <div className="bg-[#0B1426] text-slate-100 rounded-lg p-4 flex items-start gap-3">
                <ShieldCheck
                  className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="text-xs leading-relaxed">
                  <p className="font-semibold text-white">
                    Engineering Governance: AI Hypotheses vs. Historically Observed vs. Verified Root Causes
                  </p>
                  <p className="text-slate-300 mt-0.5">
                    AI-generated 6M hypotheses and 5 Whys paths are investigative leads grounded only in recorded telemetry. Quality managers must review supporting evidence and verify or reject causes physically before official sign-off.
                  </p>
                </div>
              </div>

              {/* Complaint Header Card with Primary CTA */}
              <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pb-4 border-b border-slate-200">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono">
                      <span className="font-semibold text-cyan-800">{selected.id}</span>
                      <span aria-hidden="true">·</span>
                      <span>{selected.productId}</span>
                      <span aria-hidden="true">·</span>
                      <span>{selected.batchNumber}</span>
                      <span aria-hidden="true">·</span>
                      <span>{selected.category}</span>
                    </div>
                    <h2 className="text-base font-bold text-slate-900 mt-1">
                      {selected.productName} — {selected.processName}
                    </h2>
                    <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs">
                      <StatusText status={selected.status} />
                      <span className="text-slate-300" aria-hidden="true">|</span>
                      <SeverityText severity={selected.severity} />
                      {selected.machineId && (
                        <>
                          <span className="text-slate-300" aria-hidden="true">|</span>
                          <span className="font-mono text-slate-600">
                            Machine: {selected.machineId}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setReportOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
                    >
                      <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>RCA Report</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleInvestigateRootCause}
                      disabled={loading}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-cyan-700 rounded-md hover:bg-cyan-800 disabled:opacity-60 transition-colors whitespace-nowrap"
                    >
                      <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>
                        {loading ? 'Investigating...' : 'Investigate Root Cause'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Telemetry Summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="md:col-span-2">
                    <p className="font-semibold text-slate-500 mb-1">
                      Complaint Description
                    </p>
                    <p className="text-sm text-slate-800 leading-relaxed">
                      {selected.description}
                    </p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded p-3 space-y-1">
                    <p className="font-semibold text-slate-500">
                      Process &amp; Machine Telemetry
                    </p>
                    <p className="font-mono text-slate-800">
                      {selected.processParameters || 'No process parameters recorded'}
                    </p>
                    {(selected.temperature || selected.pressure) && (
                      <p className="font-mono text-slate-600">
                        Temp: {selected.temperature || '—'} · Pressure:{' '}
                        {selected.pressure || '—'}
                      </p>
                    )}
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded p-3 space-y-1">
                    <p className="font-semibold text-slate-500">
                      Quality Test Results ({selected.testType || 'QC Inspection'})
                    </p>
                    {(selected.expectedValue || selected.actualValue) && (
                      <p className="font-mono text-slate-700">
                        Expected: {selected.expectedValue || '—'} · Actual:{' '}
                        {selected.actualValue || '—'}
                      </p>
                    )}
                    <p className="font-mono text-slate-800">
                      {selected.testResults || 'No test results recorded'}
                    </p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between gap-3 text-xs text-red-900">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-700" />
                    <div>
                      <p className="font-semibold">Root Cause AI Error</p>
                      <p className="mt-0.5">{error}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleInvestigateRootCause}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-red-700 rounded-md hover:bg-red-800 shrink-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Retry</span>
                  </button>
                </div>
              )}

              {/* Workspace Navigation Tabs */}
              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg">
                {(
                  [
                    {
                      id: 'overview',
                      label: `6M Causes & History (${historicalMatches.length})`,
                      Icon: GitBranch,
                    },
                    {
                      id: 'fishbone',
                      label: 'Fishbone Diagram',
                      Icon: Network,
                    },
                    {
                      id: 'five-whys',
                      label: '5 Whys Investigation',
                      Icon: HelpCircle,
                    },
                    {
                      id: 'ranking',
                      label: `Ranking & Verification (${rankedCauses.length})`,
                      Icon: ListOrdered,
                    },
                    {
                      id: 'history-db',
                      label: `Root Cause History DB (${rootCauseHistoryDb.length})`,
                      Icon: Database,
                    },
                  ] as const
                ).map(({ id, label, Icon }) => {
                  const isActive = activeTab === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setActiveTab(id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                        isActive
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 text-cyan-700" aria-hidden="true" />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>

              {/* TAB 1: OVERVIEW (6M AI Hypotheses + Historical Comparison) */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Insufficient Evidence Warning */}
                  {selected.rootCauseAnalysis?.insufficientEvidenceNotice && (
                    <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2.5 text-xs text-amber-950">
                      <AlertTriangle
                        className="w-4 h-4 text-amber-700 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <div>
                        <p className="font-semibold">
                          Data Completeness &amp; Insufficient Evidence Notice
                        </p>
                        <p className="mt-0.5">
                          {selected.rootCauseAnalysis.insufficientEvidenceNotice}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Module 3: 6M AI Hypotheses */}
                  <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">
                          6M Root Cause Hypotheses &amp; Diagnostic Evidence
                        </h3>
                        <p className="text-xs text-slate-500">
                          {selected.rootCauseAnalysis
                            ? selected.rootCauseAnalysis.disclaimer
                            : 'Click "Investigate Root Cause" above to run Gemini 6M Fishbone analysis across this complaint and historical matches.'}
                        </p>
                      </div>
                      {selected.rootCauseAnalysis && (
                        <div className="text-left sm:text-right text-xs shrink-0">
                          <p className="font-semibold text-slate-900">
                            Confidence: {selected.rootCauseAnalysis.confidenceLevel}
                          </p>
                          <p className="font-mono text-[11px] text-slate-500">
                            {new Date(
                              selected.rootCauseAnalysis.generatedAt
                            ).toLocaleString()}
                          </p>
                        </div>
                      )}
                    </div>

                    {!selected.rootCauseAnalysis ? (
                      <div className="py-8 text-center text-xs text-slate-500">
                        <p className="font-medium text-slate-700">
                          No AI root cause investigation generated for {selected.id} yet.
                        </p>
                        <button
                          type="button"
                          onClick={handleInvestigateRootCause}
                          disabled={loading}
                          className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-cyan-700 rounded-md hover:bg-cyan-800"
                        >
                          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Investigate Root Cause</span>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700">
                          <strong className="text-slate-900">
                            Overall Confidence Explanation:{' '}
                          </strong>
                          {selected.rootCauseAnalysis.confidenceExplanation}
                        </div>

                        {selected.rootCauseAnalysis.hypotheses.map((h, idx) => (
                          <div
                            key={h.id}
                            className="border border-slate-200 rounded-lg p-4 space-y-3"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                              <div>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                  <span className="font-mono font-semibold text-slate-800">
                                    #{idx + 1} · {infer6MCategory(h)}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-medium text-cyan-800">
                                    {h.origin || 'AI Hypothesis'}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span
                                    className={
                                      h.managerStatus === 'Verified'
                                        ? 'text-emerald-700 font-semibold'
                                        : h.managerStatus === 'Rejected'
                                        ? 'text-red-700 font-semibold'
                                        : h.managerStatus === 'Further Investigation'
                                        ? 'text-cyan-800 font-semibold'
                                        : 'text-amber-700 font-medium'
                                    }
                                  >
                                    {h.managerStatus === 'Verified'
                                      ? 'Manager Verified'
                                      : h.managerStatus === 'Rejected'
                                      ? 'Rejected by Manager'
                                      : h.managerStatus === 'Further Investigation'
                                      ? 'Further Investigation Requested'
                                      : 'Unverified AI Hypothesis'}
                                  </span>
                                </div>
                                <h4 className="text-sm font-semibold text-slate-900 mt-1">
                                  {h.title}
                                </h4>
                              </div>
                            </div>

                            <p className="text-xs text-slate-700 leading-relaxed">
                              {h.description}
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded border border-slate-100">
                              <div>
                                <p className="font-semibold text-slate-600">
                                  Supporting Evidence
                                </p>
                                <p className="text-slate-700 mt-0.5">
                                  {h.supportingEvidence ||
                                    'Insufficient evidence in current record.'}
                                </p>
                              </div>
                              <div>
                                <p className="font-semibold text-slate-600">
                                  Why Cause Is Suspected
                                </p>
                                <p className="text-slate-700 mt-0.5">
                                  {h.whySuspected || h.description}
                                </p>
                              </div>
                              <div>
                                <p className="font-semibold text-slate-600">
                                  Missing Information
                                </p>
                                <p className="text-slate-700 mt-0.5">
                                  {h.missingInformation ||
                                    'Verify physical gauge / process log history.'}
                                </p>
                              </div>
                              <div>
                                <p className="font-semibold text-slate-600">
                                  Recommended Verification &amp; Corrective Action
                                </p>
                                <p className="text-slate-700 mt-0.5">
                                  {h.recommendedVerificationMethod ||
                                    h.investigationSteps[0] ||
                                    'Physical inspection'}{' '}
                                  {h.suggestedCorrectiveAction
                                    ? `→ CAPA: ${h.suggestedCorrectiveAction}`
                                    : ''}
                                </p>
                              </div>
                            </div>

                            {h.relatedComplaintIds &&
                              h.relatedComplaintIds.length > 0 && (
                                <div className="text-xs flex flex-wrap items-center gap-2">
                                  <span className="font-semibold text-slate-600">
                                    Related Historical Cases:
                                  </span>
                                  {h.relatedComplaintIds.map((rid) => (
                                    <button
                                      key={rid}
                                      type="button"
                                      onClick={() => setSelectedId(rid)}
                                      className="font-mono text-cyan-800 hover:underline font-medium"
                                    >
                                      {rid}
                                    </button>
                                  ))}
                                </div>
                              )}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* Module 2: Historical Complaint Comparison */}
                  <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                    <div className="pb-3 border-b border-slate-200">
                      <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                        <History className="w-4 h-4 text-cyan-700" aria-hidden="true" />
                        <span>
                          Historical Complaint Comparison ({historicalMatches.length}{' '}
                          matching records)
                        </span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Matched across product, category, manufacturing process, machine ID, batch series, defect keywords, parameters, and test failures. Similar complaints do not necessarily share the same root cause.
                      </p>
                    </div>

                    {historicalMatches.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4">
                        No matching historical complaints found in the dataset for{' '}
                        {selected.id}.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                              <th className="py-2.5 px-3 font-medium">Complaint / Batch</th>
                              <th className="py-2.5 px-3 font-medium">Product &amp; Symptom</th>
                              <th className="py-2.5 px-3 font-medium">Why Relevant</th>
                              <th className="py-2.5 px-3 font-medium">Recorded Root Cause</th>
                              <th className="py-2.5 px-3 font-medium">
                                Corrective Action &amp; Effectiveness
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {historicalMatches.map((m) => (
                              <tr key={m.complaint.id} className="hover:bg-slate-50/70">
                                <td className="py-2.5 px-3 whitespace-nowrap align-top">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedId(m.complaint.id)}
                                    className="font-mono font-semibold text-cyan-800 hover:underline"
                                  >
                                    {m.complaint.id}
                                  </button>
                                  <span className="block font-mono text-[11px] text-slate-500">
                                    {m.complaint.batchNumber}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 align-top max-w-[240px]">
                                  <p className="font-medium text-slate-900">
                                    {m.complaint.productName}
                                  </p>
                                  <p className="text-slate-600 line-clamp-2 mt-0.5">
                                    {m.complaint.description}
                                  </p>
                                </td>
                                <td className="py-2.5 px-3 align-top text-cyan-900">
                                  {m.matchReasons.join(' · ')}
                                </td>
                                <td className="py-2.5 px-3 align-top text-slate-800">
                                  {m.recordedRootCause}
                                </td>
                                <td className="py-2.5 px-3 align-top">
                                  <p className="text-slate-800">{m.correctiveAction}</p>
                                  <p className="text-[11px] text-slate-500 mt-0.5">
                                    {m.effectivenessStatus}
                                  </p>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                </div>
              )}

              {/* TAB 2: INTERACTIVE FISHBONE DIAGRAM (Module 5) */}
              {activeTab === 'fishbone' && (
                <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                  <div className="pb-3 border-b border-slate-200">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Interactive 6M Ishikawa Fishbone Diagram
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Add, edit, or remove causes across Machine, Material, Method, Manpower, Measurement, and Environment branches feeding the main problem on the right.
                    </p>
                  </div>
                  <FishboneDiagram
                    problemStatement={selected.description}
                    complaintId={selected.id}
                    processName={selected.processName}
                    hypotheses={selected.rootCauseAnalysis?.hypotheses ?? []}
                    onAddCause={handleAddFishboneCause}
                    onEditCause={handleEditFishboneCause}
                    onRemoveCause={handleRemoveFishboneCause}
                    onSelectCause={() => setActiveTab('ranking')}
                  />
                </section>
              )}

              {/* TAB 3: INTERACTIVE 5 WHYS ANALYSIS (Module 4) */}
              {activeTab === 'five-whys' && (
                <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                  <div className="pb-3 border-b border-slate-200">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Interactive 5 Whys Causal Investigation
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Edit answers, cite physical inspection references, and validate each causal link.
                    </p>
                  </div>
                  <FiveWhysPanel
                    complaintId={selected.id}
                    productName={selected.productName}
                    description={selected.description}
                    steps={selected.rootCauseAnalysis?.fiveWhys ?? []}
                    onSaveSteps={handleSaveFiveWhys}
                  />
                </section>
              )}

              {/* TAB 4: ROOT CAUSE RANKING & MANAGER VERIFICATION (Module 6 & 7) */}
              {activeTab === 'ranking' && (
                <div className="space-y-6">
                  {verificationFeedback && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span>{verificationFeedback}</span>
                    </div>
                  )}

                  {/* Module 6: Root Cause Ranking */}
                  <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                    <div className="pb-3 border-b border-slate-200">
                      <h3 className="text-sm font-semibold text-slate-900">
                        Evidence-Based Root Cause Ranking &amp; Cause Verification
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Ranked by manager verification status, supporting telemetry evidence, historical recurrence, and process overlap—never arbitrary probability scores.
                      </p>
                    </div>

                    {rankedCauses.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4">
                        Run &ldquo;Investigate Root Cause&rdquo; or add causes in the Fishbone Diagram to rank root cause candidates.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                                <th className="py-2.5 px-3 font-medium">Rank</th>
                                <th className="py-2.5 px-3 font-medium">Cause &amp; 6M Category</th>
                                <th className="py-2.5 px-3 font-medium">Supporting Evidence</th>
                                <th className="py-2.5 px-3 font-medium text-right">
                                  Related Cases
                                </th>
                                <th className="py-2.5 px-3 font-medium">Priority</th>
                                <th className="py-2.5 px-3 font-medium">
                                  Confidence &amp; Ranking Rationale
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {rankedCauses.map((row, rIdx) => (
                                <tr key={row.hypothesis.id} className="hover:bg-slate-50/70">
                                  <td className="py-2.5 px-3 font-mono font-bold text-slate-700">
                                    #{rIdx + 1}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <p className="font-semibold text-slate-900">
                                      {row.hypothesis.title}
                                    </p>
                                    <p className="text-[11px] text-slate-500">
                                      {row.category6M} · {row.hypothesis.managerStatus}
                                    </p>
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-700 max-w-[220px]">
                                    {row.hypothesis.supportingEvidence}
                                  </td>
                                  <td className="py-2.5 px-3 font-mono tabular-nums text-right text-slate-800">
                                    {row.relatedComplaintCount}
                                  </td>
                                  <td
                                    className={`py-2.5 px-3 whitespace-nowrap ${
                                      PRIORITY_STYLE[row.investigationPriority]
                                    }`}
                                  >
                                    {row.investigationPriority}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-600">
                                    {row.hypothesis.confidenceExplanation ||
                                      row.rankingRationale}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Individual Cause Verification Actions */}
                        <div className="space-y-3 pt-2">
                          {rankedCauses.map(({ hypothesis: h, category6M }) => (
                            <div
                              key={h.id}
                              className="p-3.5 border border-slate-200 rounded-md bg-slate-50/60 space-y-2.5 text-xs"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div>
                                  <span className="font-mono text-[11px] text-slate-500">
                                    {category6M} · {h.origin || 'AI Hypothesis'}
                                  </span>
                                  <p className="font-semibold text-slate-900">{h.title}</p>
                                </div>
                                <span
                                  className={
                                    h.managerStatus === 'Verified'
                                      ? 'text-emerald-700 font-semibold'
                                      : h.managerStatus === 'Rejected'
                                      ? 'text-red-700 font-semibold'
                                      : h.managerStatus === 'Further Investigation'
                                      ? 'text-cyan-800 font-semibold'
                                      : 'text-amber-700 font-medium'
                                  }
                                >
                                  Status: {h.managerStatus}
                                </span>
                              </div>

                              <div className="flex flex-col md:flex-row md:items-center gap-2">
                                <input
                                  type="text"
                                  value={noteDrafts[h.id] ?? ''}
                                  onChange={(e) =>
                                    setNoteDrafts((prev) => ({
                                      ...prev,
                                      [h.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="Add physical inspection notes or supporting evidence..."
                                  className="flex-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs"
                                />
                                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleHypothesisDecision(h.id, 'Verified')
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-white bg-emerald-700 rounded hover:bg-emerald-800"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Verify Root Cause</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleHypothesisDecision(
                                        h.id,
                                        'Further Investigation'
                                      )
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-cyan-800 bg-cyan-50 border border-cyan-200 rounded hover:bg-cyan-100"
                                  >
                                    <HelpCircle className="w-3.5 h-3.5" />
                                    <span>Request Further Investigation</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleHypothesisDecision(h.id, 'Rejected')
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-red-700 bg-white border border-red-300 rounded hover:bg-red-50"
                                  >
                                    <XCircle className="w-3.5 h-3.5" />
                                    <span>Reject Root Cause</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </section>

                  {/* Module 7: Official Manager Verification Sign-Off */}
                  <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                    <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                          <ClipboardCheck
                            className="w-4 h-4 text-emerald-700"
                            aria-hidden="true"
                          />
                          <span>Official Manager Root Cause Sign-Off</span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Recording a verified root cause preserves AI hypotheses separately, records manager &amp; date, updates status, and feeds future investigations.
                        </p>
                      </div>
                      {selected.rootCauseAnalysis?.manualVerifiedRootCause && (
                        <span className="text-xs font-semibold text-emerald-700">
                          Verified {selected.rootCauseAnalysis.verifiedDate || ''}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="md:col-span-2">
                        <label className="block font-medium text-slate-700 mb-1">
                          Confirmed Physical Root Cause Statement *
                        </label>
                        <input
                          type="text"
                          value={manualRootCauseInput}
                          onChange={(e) => setManualRootCauseInput(e.target.value)}
                          placeholder="Enter verified physical root cause confirmed via metrology/inspection..."
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                        />
                      </div>

                      <div>
                        <label className="block font-medium text-slate-700 mb-1">
                          6M Root Cause Category
                        </label>
                        <select
                          value={verifiedCategory6M}
                          onChange={(e) =>
                            setVerifiedCategory6M(e.target.value as SixMCategory)
                          }
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                        >
                          {ALL_6M_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block font-medium text-slate-700 mb-1">
                          Verifying Quality Manager
                        </label>
                        <input
                          type="text"
                          value={verifiedByInput}
                          onChange={(e) => setVerifiedByInput(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block font-medium text-slate-700 mb-1">
                          Physical / Metrology Supporting Evidence
                        </label>
                        <input
                          type="text"
                          value={verifiedEvidenceInput}
                          onChange={(e) => setVerifiedEvidenceInput(e.target.value)}
                          placeholder="e.g., CMM inspection report #CMM-441, worn diamond nib measured at 0.42 mm flat..."
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block font-medium text-slate-700 mb-1">
                          Manager Investigation Notes
                        </label>
                        <textarea
                          rows={2}
                          value={managerNotesInput}
                          onChange={(e) => setManagerNotesInput(e.target.value)}
                          placeholder="Document containment verification, engineering sign-off remarks, or follow-up conditions..."
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleSaveOfficialVerification}
                        disabled={!manualRootCauseInput.trim()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-700 rounded-md hover:bg-emerald-800 disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Verify &amp; Save Official Root Cause</span>
                      </button>
                    </div>
                  </section>
                </div>
              )}

              {/* TAB 5: HISTORICAL ROOT CAUSE DATABASE (Module 8) */}
              {activeTab === 'history-db' && (
                <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        Historical Root Cause Knowledge Database
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Verified and investigated root causes linked to products, batches, corrective actions, and effectiveness outcomes.
                      </p>
                    </div>
                    <div className="relative w-full sm:w-64">
                      <Search
                        className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                        aria-hidden="true"
                      />
                      <input
                        type="text"
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        placeholder="Search root cause history..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-md"
                      />
                    </div>
                  </div>

                  {filteredHistoryDb.length === 0 ? (
                    <p className="text-xs text-slate-500 py-6 text-center">
                      No root cause history records match your search.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                            <th className="py-2.5 px-3 font-medium">Complaint / Product</th>
                            <th className="py-2.5 px-3 font-medium">Batch / Process</th>
                            <th className="py-2.5 px-3 font-medium">6M Category</th>
                            <th className="py-2.5 px-3 font-medium">Identified Root Cause</th>
                            <th className="py-2.5 px-3 font-medium">Status / Date</th>
                            <th className="py-2.5 px-3 font-medium">CAPA &amp; Effectiveness</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredHistoryDb.map((entry) => (
                            <tr key={entry.complaintId} className="hover:bg-slate-50/70">
                              <td className="py-2.5 px-3 align-top">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedId(entry.complaintId);
                                    setActiveTab('overview');
                                  }}
                                  className="font-mono font-semibold text-cyan-800 hover:underline"
                                >
                                  {entry.complaintId}
                                </button>
                                <span className="block font-mono text-[11px] text-slate-500">
                                  {entry.productId}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 align-top">
                                <span className="font-mono text-slate-700 block">
                                  {entry.batchNumber}
                                </span>
                                <span className="text-[11px] text-slate-500">
                                  {entry.processName}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 align-top font-semibold text-slate-800">
                                {entry.category6M}
                              </td>
                              <td className="py-2.5 px-3 align-top text-slate-900 max-w-[240px]">
                                {entry.identifiedRootCause}
                              </td>
                              <td className="py-2.5 px-3 align-top whitespace-nowrap">
                                <span
                                  className={
                                    entry.verificationStatus === 'Verified'
                                      ? 'font-semibold text-emerald-700'
                                      : 'font-medium text-amber-700'
                                  }
                                >
                                  {entry.verificationStatus}
                                </span>
                                <span className="block font-mono text-[11px] text-slate-500">
                                  {entry.verificationDate}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 align-top max-w-[220px]">
                                <p className="text-slate-800">{entry.correctiveAction}</p>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                  {entry.effectivenessResult}
                                </p>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </div>

      {/* Module 9: Printable RCA Report Modal */}
      {reportOpen && selected && (
        <RcaPrintableReport
          complaint={selected}
          historicalMatches={historicalMatches}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  );
}
