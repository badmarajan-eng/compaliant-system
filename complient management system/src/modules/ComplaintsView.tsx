import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  Eye,
  GitBranch,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Wrench,
  X,
} from 'lucide-react';
import { AIAnalysisResultsPanel } from '../components/AIAnalysisResultsPanel';
import { ComplaintRegistrationForm } from '../components/ComplaintRegistrationForm';
import { SeverityText, StatusText } from '../components/StatusText';
import { requestComplaintClassification } from '../services/aiClient';
import type {
  AIClassificationResult,
  ComplaintCategory,
  ComplaintRecord,
  ComplaintStatus,
  ManagerVerificationRecord,
  ModuleId,
  SeverityLevel,
} from '../types/qms';
import { exportComplaintsToCsv, generateNextComplaintId } from '../utils/csvUtils';
import {
  ALL_CATEGORIES,
  ALL_COMPLAINT_STATUSES,
  ALL_SEVERITIES,
} from '../utils/qmsAnalytics';
import type { ComplaintPresetFilter } from './DashboardView';

interface ComplaintsViewProps {
  complaints: ComplaintRecord[];
  preselectedId?: string | null;
  presetFilter?: ComplaintPresetFilter | null;
  initialSubView?: 'list' | 'register';
  navResetKey?: number;
  onAddComplaint: (
    data: Omit<ComplaintRecord, 'id' | 'isDemoData' | 'capaActions'> & { id?: string }
  ) => ComplaintRecord;
  onOpenCsvImport: () => void;
  onUpdateComplaint: (
    id: string,
    patch: Partial<ComplaintRecord>,
    auditNote?: string
  ) => void;
  onDeleteComplaint: (id: string) => void;
  onSaveClassification: (id: string, result: AIClassificationResult) => void;
  onSaveManagerVerification: (
    complaintId: string,
    analysisId: string,
    verification: ManagerVerificationRecord,
    applyConfirmedFieldsToRecord: boolean
  ) => void;
  onNavigateModule: (module: ModuleId, complaintId?: string) => void;
}

type SubView = 'list' | 'register' | 'edit' | 'details';

export function ComplaintsView({
  complaints,
  preselectedId,
  presetFilter,
  initialSubView,
  navResetKey,
  onAddComplaint,
  onOpenCsvImport,
  onUpdateComplaint,
  onDeleteComplaint,
  onSaveClassification,
  onSaveManagerVerification,
  onNavigateModule,
}: ComplaintsViewProps) {
  const [subView, setSubView] = useState<SubView>(
    preselectedId ? 'details' : initialSubView ?? 'list'
  );
  const [activeComplaintId, setActiveComplaintId] = useState<string | null>(
    preselectedId ?? null
  );

  // Search & Filter State (Module 3)
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | ComplaintCategory>('ALL');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | SeverityLevel>(
    presetFilter?.severity ?? 'ALL'
  );
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNRESOLVED' | ComplaintStatus>(
    presetFilter?.status ?? 'ALL'
  );
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  // Notifications & Delete Modal
  const [notification, setNotification] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ComplaintRecord | null>(null);

  // Status update controls on Details Page (Module 5)
  const [statusDraft, setStatusDraft] = useState<ComplaintStatus>('New');
  const [statusNoteDraft, setStatusNoteDraft] = useState('');

  // Inline AI Analysis Panel state on Details Page (Module 7)
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    if (preselectedId) {
      setActiveComplaintId(preselectedId);
      setSubView('details');
      setAiError(null);
    }
  }, [preselectedId]);

  useEffect(() => {
    if (navResetKey && !preselectedId) {
      setSubView(initialSubView ?? 'list');
      if (!presetFilter) {
        setStatusFilter('ALL');
        setSeverityFilter('ALL');
      }
    }
  }, [navResetKey, initialSubView, preselectedId, presetFilter]);

  useEffect(() => {
    if (presetFilter) {
      setStatusFilter(presetFilter.status ?? 'ALL');
      setSeverityFilter(presetFilter.severity ?? 'ALL');
      setSubView('list');
    }
  }, [presetFilter]);

  const activeComplaint = useMemo(
    () => complaints.find((c) => c.id === activeComplaintId) ?? null,
    [complaints, activeComplaintId]
  );

  useEffect(() => {
    if (activeComplaint) {
      setStatusDraft(activeComplaint.status);
      setStatusNoteDraft('');
    }
  }, [activeComplaint?.id, activeComplaint?.status]);

  const suggestedId = useMemo(() => generateNextComplaintId(complaints), [complaints]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return complaints
      .filter((c) => {
        if (categoryFilter !== 'ALL' && c.category !== categoryFilter) return false;
        if (severityFilter !== 'ALL' && c.severity !== severityFilter) return false;
        if (statusFilter === 'UNRESOLVED' && c.status === 'Closed') return false;
        if (
          statusFilter !== 'ALL' &&
          statusFilter !== 'UNRESOLVED' &&
          c.status !== statusFilter
        ) {
          return false;
        }
        if (dateFrom && c.complaintDate < dateFrom) return false;
        if (dateTo && c.complaintDate > dateTo) return false;
        if (!q) return true;
        return (
          c.id.toLowerCase().includes(q) ||
          c.customerName.toLowerCase().includes(q) ||
          c.productName.toLowerCase().includes(q) ||
          c.batchNumber.toLowerCase().includes(q) ||
          c.processName.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q)
        );
      })
      .sort((a, b) =>
        sortOrder === 'newest'
          ? b.complaintDate.localeCompare(a.complaintDate) || b.id.localeCompare(a.id)
          : a.complaintDate.localeCompare(b.complaintDate) || a.id.localeCompare(b.id)
      );
  }, [
    complaints,
    search,
    categoryFilter,
    severityFilter,
    statusFilter,
    dateFrom,
    dateTo,
    sortOrder,
  ]);

  const runAiAnalysisForComplaint = async (complaint: ComplaintRecord) => {
    setActiveComplaintId(complaint.id);
    setSubView('details');
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await requestComplaintClassification(complaint, complaints);
      onSaveClassification(complaint.id, result);
    } catch (err) {
      setAiError(
        err instanceof Error
          ? err.message
          : 'Failed to connect to Gemini AI analysis service.'
      );
    } finally {
      setAiLoading(false);
    }
  };

  const handleStatusSubmit = () => {
    if (!activeComplaint) return;
    if (statusDraft === activeComplaint.status && !statusNoteDraft.trim()) return;
    onUpdateComplaint(
      activeComplaint.id,
      { status: statusDraft },
      statusNoteDraft.trim() ||
        `Status updated by Quality Manager from ${activeComplaint.status} to ${statusDraft}.`
    );
    setStatusNoteDraft('');
    setNotification(`Updated ${activeComplaint.id} status to "${statusDraft}".`);
  };

  // SUB-VIEW 1: REGISTER OR EDIT FORM PAGE
  if (subView === 'register' || (subView === 'edit' && activeComplaint)) {
    const isEdit = subView === 'edit' && activeComplaint;
    return (
      <div className="space-y-5">
        <div className="bg-white border border-slate-200 rounded-lg p-5 flex items-center justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => setSubView(isEdit ? 'details' : 'list')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-800 hover:text-cyan-950 mb-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{isEdit ? `Back to ${activeComplaint.id}` : 'Back to Complaint List'}</span>
            </button>
            <h2 className="text-lg font-bold text-slate-900">
              {isEdit
                ? `Edit Complaint Record — ${activeComplaint.id}`
                : 'Register New Customer Complaint'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isEdit
                ? 'Update complaint metadata, manufacturing parameters, or inspection test measurements.'
                : 'Complete all mandatory complaint, manufacturing, and quality test fields below.'}
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-6">
          <ComplaintRegistrationForm
            initialComplaint={isEdit ? activeComplaint : null}
            suggestedId={suggestedId}
            onCancel={() => setSubView(isEdit ? 'details' : 'list')}
            onSave={(data) => {
              if (isEdit) {
                onUpdateComplaint(activeComplaint.id, data);
                setNotification(`Complaint ${activeComplaint.id} updated successfully.`);
                setSubView('details');
              } else {
                const created = onAddComplaint(data);
                setActiveComplaintId(created.id);
                setNotification(`Complaint ${created.id} registered and saved to LocalStorage.`);
                setSubView('list');
              }
            }}
          />
        </div>
      </div>
    );
  }

  // SUB-VIEW 2: COMPLETE COMPLAINT DETAILS PAGE (Module 4, 5, 7)
  if (subView === 'details' && activeComplaint) {
    return (
      <div className="space-y-6">
        {notification && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-xs text-emerald-900">
            <span className="inline-flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" aria-hidden="true" />
              <span>{notification}</span>
            </span>
            <button
              type="button"
              onClick={() => setNotification(null)}
              className="p-1 hover:opacity-70"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Details Top Action Bar */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => setSubView('list')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-800 hover:text-cyan-950 mb-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Back to Complaint List</span>
            </button>
            <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-500 font-mono">
              <span className="font-semibold text-cyan-800">{activeComplaint.id}</span>
              <span aria-hidden="true">·</span>
              <span>{activeComplaint.complaintDate}</span>
              {activeComplaint.isDemoData && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-sans">DEMO DATA</span>
                </>
              )}
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-1">
              {activeComplaint.productName} ({activeComplaint.customerName})
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSubView('edit')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
            >
              <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Edit</span>
            </button>
            <button
              type="button"
              onClick={() => runAiAnalysisForComplaint(activeComplaint)}
              disabled={aiLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
              <span>{aiLoading ? 'Analyzing with Gemini...' : 'Analyze with AI'}</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateModule('root-cause', activeComplaint.id)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-cyan-700 rounded-md hover:bg-cyan-800 whitespace-nowrap"
            >
              <GitBranch className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Root Cause</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateModule('capa', activeComplaint.id)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
            >
              <Wrench className="w-3.5 h-3.5" aria-hidden="true" />
              <span>CAPA Plan</span>
            </button>
          </div>
        </div>

        {/* Status Management Bar (Module 5) */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-500">
                Complaint Status Management (Authorized Quality Manager)
              </p>
              <div className="flex flex-wrap items-center gap-4 pt-1">
                <StatusText status={activeComplaint.status} />
                <span className="text-slate-300" aria-hidden="true">|</span>
                <SeverityText severity={activeComplaint.severity} />
                <span className="text-slate-300" aria-hidden="true">|</span>
                <span className="text-xs text-slate-700">
                  Assigned Manager:{' '}
                  <strong className="text-slate-900">
                    {activeComplaint.assignedManager || 'R. Deshmukh'}
                  </strong>
                </span>
                <span className="text-slate-300" aria-hidden="true">|</span>
                <span className="text-xs text-slate-700">
                  Priority:{' '}
                  <strong className="text-slate-900">
                    {activeComplaint.priority || 'Normal'}
                  </strong>
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <select
                aria-label="Select new complaint status"
                value={statusDraft}
                onChange={(e) => setStatusDraft(e.target.value as ComplaintStatus)}
                className="px-3 py-2 text-xs border border-slate-300 rounded-md bg-white text-slate-900"
              >
                {ALL_COMPLAINT_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={statusNoteDraft}
                onChange={(e) => setStatusNoteDraft(e.target.value)}
                placeholder="Status change audit note (optional)..."
                className="px-3 py-2 text-xs border border-slate-300 rounded-md min-w-[220px]"
              />
              <button
                type="button"
                onClick={handleStatusSubmit}
                disabled={statusDraft === activeComplaint.status && !statusNoteDraft.trim()}
                className="px-4 py-2 text-xs font-medium text-white bg-cyan-700 rounded-md hover:bg-cyan-800 disabled:opacity-50 whitespace-nowrap"
              >
                Update Status
              </button>
            </div>
          </div>
        </div>

        {/* Separate AI Analysis Results & Manager Verification Panel (Module 7) */}
        {(aiLoading ||
          aiError ||
          activeComplaint.aiClassification ||
          (activeComplaint.aiAnalysisHistory && activeComplaint.aiAnalysisHistory.length > 0)) && (
          <AIAnalysisResultsPanel
            complaint={activeComplaint}
            loading={aiLoading}
            error={aiError}
            onRunAnalysis={() => runAiAnalysisForComplaint(activeComplaint)}
            onSaveManagerVerification={onSaveManagerVerification}
          />
        )}

        {/* Structured Complaint Details Grid (Module 4) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Customer, Product & Batch Info */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-200">
              Customer, Product &amp; Batch Information
            </h3>
            <dl className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <dt className="text-slate-500">Customer Name</dt>
                <dd className="font-medium text-slate-900 mt-0.5">{activeComplaint.customerName}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Customer ID / Contact</dt>
                <dd className="font-mono text-slate-800 mt-0.5">
                  {activeComplaint.customerId || '—'} · {activeComplaint.contactEmail || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Product Name</dt>
                <dd className="font-medium text-slate-900 mt-0.5">{activeComplaint.productName}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Product ID</dt>
                <dd className="font-mono text-slate-800 mt-0.5">{activeComplaint.productId}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Batch Number</dt>
                <dd className="font-mono text-slate-800 mt-0.5">{activeComplaint.batchNumber}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Complaint Category</dt>
                <dd className="font-medium text-slate-900 mt-0.5">{activeComplaint.category}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Manufacturing Date</dt>
                <dd className="font-mono tabular-nums text-slate-800 mt-0.5">
                  {activeComplaint.manufacturingDate}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Complaint Date</dt>
                <dd className="font-mono tabular-nums text-slate-800 mt-0.5">
                  {activeComplaint.complaintDate}
                </dd>
              </div>
              {activeComplaint.resolutionDate && (
                <div>
                  <dt className="text-slate-500">Resolution Date</dt>
                  <dd className="font-mono tabular-nums text-emerald-700 font-medium mt-0.5">
                    {activeComplaint.resolutionDate}
                  </dd>
                </div>
              )}
            </dl>
            <div className="pt-3 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 mb-1">Complaint Description</p>
              <p className="text-sm text-slate-800 leading-relaxed">
                {activeComplaint.description}
              </p>
            </div>
          </div>

          {/* Manufacturing & Quality Test Details */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-200">
              Manufacturing &amp; Quality Test Telemetry
            </h3>
            <dl className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <dt className="text-slate-500">Manufacturing Process</dt>
                <dd className="font-medium text-slate-900 mt-0.5">{activeComplaint.processName}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Machine ID</dt>
                <dd className="font-mono text-slate-800 mt-0.5">
                  {activeComplaint.machineId || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Temperature / Pressure</dt>
                <dd className="font-mono text-slate-800 mt-0.5">
                  {activeComplaint.temperature || '—'} · {activeComplaint.pressure || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Shift / Operator ID</dt>
                <dd className="text-slate-800 mt-0.5">
                  {activeComplaint.productionShift || '—'} ·{' '}
                  <span className="font-mono">{activeComplaint.operatorId || '—'}</span>
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-slate-500 mb-1">Process Parameters</dt>
                <dd className="font-mono bg-slate-50 border border-slate-200 rounded p-2.5 text-slate-800">
                  {activeComplaint.processParameters}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Test Type</dt>
                <dd className="font-medium text-slate-900 mt-0.5">
                  {activeComplaint.testType || 'Standard QC Inspection'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Expected vs. Actual</dt>
                <dd className="font-mono text-slate-800 mt-0.5">
                  {activeComplaint.expectedValue || '—'} vs {activeComplaint.actualValue || '—'}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-slate-500 mb-1">Test Result Summary</dt>
                <dd className="font-mono bg-slate-50 border border-slate-200 rounded p-2.5 text-slate-800">
                  {activeComplaint.testResults}
                </dd>
              </div>
              {activeComplaint.inspectionNotes && (
                <div className="col-span-2">
                  <dt className="text-slate-500 mb-1">Quality Inspection Notes</dt>
                  <dd className="text-slate-700">{activeComplaint.inspectionNotes}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {/* Complaint History Audit Log (Module 4 & 5) */}
        <section className="bg-white border border-slate-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-slate-900 pb-3 border-b border-slate-200">
            Complaint History &amp; Status Audit Log
          </h3>
          <div className="mt-4 space-y-3">
            {(activeComplaint.history ?? []).map((entry) => (
              <div
                key={entry.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 last:border-b-0 last:pb-0 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-cyan-700" aria-hidden="true" />
                    <span className="font-semibold text-slate-900">{entry.action}</span>
                    {entry.fromStatus && entry.toStatus && (
                      <span className="font-mono text-cyan-800">
                        {entry.fromStatus} → {entry.toStatus}
                      </span>
                    )}
                    {!entry.fromStatus && entry.toStatus && (
                      <span className="font-mono text-cyan-800">Status: {entry.toStatus}</span>
                    )}
                  </div>
                  {entry.notes && <p className="text-slate-600 pl-5">{entry.notes}</p>}
                </div>
                <div className="pl-5 sm:pl-0 sm:text-right text-slate-500 shrink-0">
                  <p className="font-medium text-slate-700">{entry.actor}</p>
                  <p className="font-mono tabular-nums text-[11px]">
                    {new Date(entry.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  // SUB-VIEW 3: COMPLAINT LIST, SEARCH & FILTERS (Module 2 & 3)
  return (
    <div className="space-y-5">
      {notification && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-xs text-emerald-900">
          <span className="inline-flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-700" aria-hidden="true" />
            <span>{notification}</span>
          </span>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="p-1 hover:opacity-70"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Search & Multi-Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Complaint ID, Customer Name, Product Name..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-600/30 focus:border-cyan-700"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenCsvImport}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Import CSV</span>
            </button>
            <button
              type="button"
              onClick={() => exportComplaintsToCsv(filtered)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export CSV ({filtered.length})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveComplaintId(null);
                setSubView('register');
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-cyan-700 rounded-md hover:bg-cyan-800 transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Register Complaint</span>
            </button>
          </div>
        </div>

        {/* Combined Filter Controls */}
        <div className="flex flex-wrap items-center gap-2.5 pt-3 border-t border-slate-100">
          <select
            aria-label="Filter by category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as 'ALL' | ComplaintCategory)}
            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-700"
          >
            <option value="ALL">All Categories</option>
            {ALL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by severity"
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as 'ALL' | SeverityLevel)}
            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-700"
          >
            <option value="ALL">All Severities</option>
            {ALL_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as 'ALL' | 'UNRESOLVED' | ComplaintStatus)
            }
            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-700"
          >
            <option value="ALL">All Statuses</option>
            <option value="UNRESOLVED">All Open / Unresolved</option>
            {ALL_COMPLAINT_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <label htmlFor="filter-date-from" className="text-[11px] text-slate-500">
              From
            </label>
            <input
              id="filter-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-2 py-1 text-xs border border-slate-300 rounded-md tabular-nums"
            />
            <label htmlFor="filter-date-to" className="text-[11px] text-slate-500">
              To
            </label>
            <input
              id="filter-date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-2 py-1 text-xs border border-slate-300 rounded-md tabular-nums"
            />
          </div>

          <select
            aria-label="Sort complaints"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-700"
          >
            <option value="newest">Sort: Newest First</option>
            <option value="oldest">Sort: Oldest First</option>
          </select>

          {(search ||
            categoryFilter !== 'ALL' ||
            severityFilter !== 'ALL' ||
            statusFilter !== 'ALL' ||
            dateFrom ||
            dateTo) && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setCategoryFilter('ALL');
                setSeverityFilter('ALL');
                setStatusFilter('ALL');
                setDateFrom('');
                setDateTo('');
              }}
              className="text-xs font-medium text-cyan-700 hover:text-cyan-900"
            >
              Clear filters
            </button>
          )}

          <span className="ml-auto text-xs text-slate-500 font-mono tabular-nums">
            Showing {filtered.length} of {complaints.length} records
          </span>
        </div>
      </div>

      {/* Complaint Data Table (Module 2) */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-900">
              No complaints match your current search or filter criteria.
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Clear active filters or register a new customer complaint.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                  <th className="py-3 px-3.5 font-medium">Complaint ID</th>
                  <th className="py-3 px-3.5 font-medium">Customer Name</th>
                  <th className="py-3 px-3.5 font-medium">Product Name</th>
                  <th className="py-3 px-3.5 font-medium">Batch</th>
                  <th className="py-3 px-3.5 font-medium">Category</th>
                  <th className="py-3 px-3.5 font-medium">Severity</th>
                  <th className="py-3 px-3.5 font-medium">Date</th>
                  <th className="py-3 px-3.5 font-medium">Status</th>
                  <th className="py-3 px-3.5 font-medium">Assigned Manager</th>
                  <th className="py-3 px-3.5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-3.5 font-mono tabular-nums whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveComplaintId(c.id);
                          setSubView('details');
                          setAiError(null);
                        }}
                        className="font-semibold text-cyan-800 hover:underline"
                      >
                        {c.id}
                      </button>
                      {c.isDemoData && (
                        <span className="block text-[10px] text-slate-400 font-sans">
                          DEMO DATA
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3.5 font-medium text-slate-900">{c.customerName}</td>
                    <td className="py-3 px-3.5 text-slate-900">{c.productName}</td>
                    <td className="py-3 px-3.5 font-mono text-slate-600 whitespace-nowrap">
                      {c.batchNumber}
                    </td>
                    <td className="py-3 px-3.5 text-slate-700">{c.category}</td>
                    <td className="py-3 px-3.5">
                      <SeverityText severity={c.severity} />
                    </td>
                    <td className="py-3 px-3.5 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {c.complaintDate}
                    </td>
                    <td className="py-3 px-3.5">
                      <StatusText status={c.status} />
                    </td>
                    <td className="py-3 px-3.5 text-slate-700 whitespace-nowrap">
                      {c.assignedManager || 'R. Deshmukh'}
                    </td>
                    <td className="py-3 px-3.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveComplaintId(c.id);
                            setSubView('details');
                            setAiError(null);
                          }}
                          title="View Details"
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 hover:text-cyan-800 hover:bg-slate-100 rounded"
                        >
                          <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>View</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveComplaintId(c.id);
                            setSubView('edit');
                          }}
                          title="Edit Complaint"
                          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(c)}
                          title="Delete Complaint"
                          className="p-1.5 text-slate-600 hover:text-red-700 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => runAiAnalysisForComplaint(c)}
                          title="Analyze with AI"
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-white bg-slate-900 rounded hover:bg-slate-800"
                        >
                          <Sparkles className="w-3 h-3 text-cyan-400" aria-hidden="true" />
                          <span>Analyze with AI</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog (Module 6) */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">
              Delete Complaint {deleteTarget.id}?
            </h3>
            <p className="text-sm text-slate-600 mt-2">
              This will permanently remove the complaint record for{' '}
              <span className="font-medium text-slate-900">{deleteTarget.productName}</span> (
              {deleteTarget.customerName}) and update all dashboard statistics.
            </p>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const deletedId = deleteTarget.id;
                  if (activeComplaintId === deletedId) {
                    setActiveComplaintId(null);
                    setSubView('list');
                  }
                  onDeleteComplaint(deletedId);
                  setDeleteTarget(null);
                  setNotification(`Complaint ${deletedId} deleted.`);
                }}
                className="px-4 py-2 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
