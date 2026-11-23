import { useEffect, useMemo, useState } from 'react';
import { Search, Sparkles } from 'lucide-react';
import { AIAnalysisResultsPanel } from '../components/AIAnalysisResultsPanel';
import { SeverityText, StatusText } from '../components/StatusText';
import { requestComplaintClassification } from '../services/aiClient';
import type {
  AIClassificationResult,
  ComplaintCategory,
  ComplaintRecord,
  ManagerVerificationRecord,
} from '../types/qms';
import { computeComplaintFingerprint } from '../utils/aiAnalysisUtils';
import { ALL_CATEGORIES } from '../utils/qmsAnalytics';

interface ClassificationViewProps {
  complaints: ComplaintRecord[];
  preselectedId?: string | null;
  onSaveClassification: (id: string, result: AIClassificationResult) => void;
  onSaveManagerVerification: (
    complaintId: string,
    analysisId: string,
    verification: ManagerVerificationRecord,
    applyConfirmedFieldsToRecord: boolean
  ) => void;
}

export function ClassificationView({
  complaints,
  preselectedId,
  onSaveClassification,
  onSaveManagerVerification,
}: ClassificationViewProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | ComplaintCategory>('ALL');
  const [selectedId, setSelectedId] = useState<string>(
    preselectedId || complaints[0]?.id || ''
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (preselectedId) setSelectedId(preselectedId);
  }, [preselectedId]);

  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    return complaints.filter((c) => {
      if (categoryFilter !== 'ALL' && c.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        c.id.toLowerCase().includes(q) ||
        c.productName.toLowerCase().includes(q) ||
        c.customerName.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
      );
    });
  }, [complaints, search, categoryFilter]);

  const selectedComplaint = useMemo(
    () => complaints.find((c) => c.id === selectedId) ?? filteredList[0] ?? null,
    [complaints, selectedId, filteredList]
  );

  const handleAnalyze = async () => {
    if (!selectedComplaint) return;
    setLoading(true);
    setError(null);
    try {
      const result = await requestComplaintClassification(
        selectedComplaint,
        complaints
      );
      onSaveClassification(selectedComplaint.id, result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to classify complaint with Gemini AI.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (complaints.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-10 text-center text-sm text-slate-600">
        No complaints available to analyze. Register a complaint first.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Selector */}
      <div className="lg:col-span-4 bg-white border border-slate-200 rounded-lg flex flex-col max-h-[820px]">
        <div className="p-4 border-b border-slate-200 space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Select Complaint Record
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
              placeholder="Filter by ID, product, customer..."
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-600/30"
            />
          </div>
          <select
            aria-label="Filter complaints by category"
            value={categoryFilter}
            onChange={(e) =>
              setCategoryFilter(e.target.value as 'ALL' | ComplaintCategory)
            }
            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-700"
          >
            <option value="ALL">All Categories (Demo &amp; Registered)</option>
            {ALL_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-y-auto divide-y divide-slate-100 flex-1">
          {filteredList.map((c) => {
            const active = selectedComplaint?.id === c.id;
            const latest = c.aiAnalysisHistory?.[0] ?? c.aiClassification;
            const isOutdated =
              latest && latest.sourceFingerprint !== computeComplaintFingerprint(c);
            const runCount = c.aiAnalysisHistory?.length ?? (latest ? 1 : 0);

            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSelectedId(c.id);
                  setError(null);
                }}
                className={`w-full text-left p-3.5 transition-colors ${
                  active ? 'bg-cyan-50/70' : 'hover:bg-slate-50'
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
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                  {c.description}
                </p>
                <div className="flex items-center justify-between mt-2 text-[11px] text-slate-500">
                  <span>{c.category}</span>
                  {latest ? (
                    <span
                      className={`font-medium ${
                        isOutdated
                          ? 'text-amber-700'
                          : latest.managerVerification?.decision === 'Accepted'
                          ? 'text-emerald-700'
                          : latest.managerVerification?.decision === 'Rejected'
                          ? 'text-red-700'
                          : 'text-cyan-700'
                      }`}
                    >
                      {isOutdated
                        ? `Outdated (${runCount})`
                        : latest.managerVerification?.decision === 'Accepted'
                        ? `Accepted (${runCount})`
                        : latest.managerVerification?.decision === 'Rejected'
                        ? `Rejected (${runCount})`
                        : `Analyzed (${runCount})`}
                    </span>
                  ) : (
                    <span>Not analyzed</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Workspace + Comprehensive Gemini Analysis Results Panel */}
      <div className="lg:col-span-8 space-y-6">
        {selectedComplaint && (
          <>
            {/* Selected Complaint Summary */}
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono">
                    <span>{selectedComplaint.id}</span>
                    <span aria-hidden="true">·</span>
                    <span>{selectedComplaint.batchNumber}</span>
                    <span aria-hidden="true">·</span>
                    <span>{selectedComplaint.complaintDate}</span>
                    {selectedComplaint.isDemoData && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-sans">DEMO DATA</span>
                      </>
                    )}
                  </div>
                  <h2 className="text-base font-semibold text-slate-900 mt-0.5">
                    {selectedComplaint.productName} ({selectedComplaint.customerName})
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                  <span>{loading ? 'Analyzing with Gemini...' : 'Analyze with AI'}</span>
                </button>
              </div>

              <div className="mt-4 space-y-3 text-xs">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="text-slate-500">
                    Recorded Category:{' '}
                    <strong className="text-slate-900">{selectedComplaint.category}</strong>
                  </span>
                  <span className="text-slate-300" aria-hidden="true">|</span>
                  <span className="inline-flex items-center gap-1.5 text-slate-500">
                    Recorded Severity:{' '}
                    <SeverityText severity={selectedComplaint.severity} />
                  </span>
                  <span className="text-slate-300" aria-hidden="true">|</span>
                  <StatusText status={selectedComplaint.status} />
                </div>

                <div>
                  <p className="font-semibold text-slate-500 mb-1">Complaint Description</p>
                  <p className="text-sm text-slate-800 leading-relaxed">
                    {selectedComplaint.description}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  <div className="bg-slate-50 border border-slate-200 rounded p-3 space-y-1">
                    <p className="font-semibold text-slate-500">
                      Manufacturing Process &amp; Telemetry
                    </p>
                    <p className="text-slate-900 font-medium">
                      {selectedComplaint.processName}
                      {selectedComplaint.machineId
                        ? ` (${selectedComplaint.machineId})`
                        : ''}
                    </p>
                    <p className="font-mono text-slate-600">
                      {selectedComplaint.processParameters}
                    </p>
                    {(selectedComplaint.temperature || selectedComplaint.pressure) && (
                      <p className="font-mono text-slate-500">
                        Temp: {selectedComplaint.temperature || '—'} · Pressure:{' '}
                        {selectedComplaint.pressure || '—'}
                      </p>
                    )}
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded p-3 space-y-1">
                    <p className="font-semibold text-slate-500">
                      Quality Test Telemetry ({selectedComplaint.testType || 'QC Test'})
                    </p>
                    {(selectedComplaint.expectedValue || selectedComplaint.actualValue) && (
                      <p className="font-mono text-slate-700">
                        Expected: {selectedComplaint.expectedValue || '—'} · Actual:{' '}
                        {selectedComplaint.actualValue || '—'}
                      </p>
                    )}
                    <p className="font-mono text-slate-700">
                      {selectedComplaint.testResults}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <AIAnalysisResultsPanel
              complaint={selectedComplaint}
              loading={loading}
              error={error}
              onRunAnalysis={handleAnalyze}
              onSaveManagerVerification={onSaveManagerVerification}
            />
          </>
        )}
      </div>
    </div>
  );
}
