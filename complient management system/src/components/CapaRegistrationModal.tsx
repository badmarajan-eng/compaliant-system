import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import type {
  CAPARecord,
  CAPARootCauseStatus,
  CAPAWorkflowStatus,
  ComplaintCategory,
  ComplaintRecord,
  PriorityLevel,
} from '../types/qms';
import { CAPA_DEPARTMENTS, evaluateEffectivenessMetrics } from '../utils/capaUtils';

interface CapaRegistrationModalProps {
  isOpen: boolean;
  suggestedId: string;
  complaints: ComplaintRecord[];
  preselectedComplaintId?: string | null;
  editingCapa?: CAPARecord | null;
  onClose: () => void;
  onSave: (
    payload: Omit<CAPARecord, 'id' | 'isDemoData' | 'history' | 'progressPercent'> & {
      id?: string;
    },
    editingId?: string
  ) => void;
}

const PRIORITIES: PriorityLevel[] = ['Low', 'Normal', 'High', 'Urgent'];

function extractComplaintRcaContext(c: ComplaintRecord): {
  rootCause: string;
  rootCauseVerificationStatus: CAPARootCauseStatus;
  evidence: string;
  suggestedDepartment: string;
} {
  const verifiedHyp = c.rootCauseAnalysis?.hypotheses.find(
    (h) => h.managerStatus === 'Verified'
  );
  const manualRc = c.rootCauseAnalysis?.manualVerifiedRootCause?.trim();
  const topHyp = c.rootCauseAnalysis?.hypotheses[0];

  const isVerified = Boolean(manualRc || verifiedHyp);
  const rootCause =
    manualRc ||
    verifiedHyp?.title ||
    topHyp?.title ||
    'Pending formal root cause verification';

  const rootCauseVerificationStatus: CAPARootCauseStatus = isVerified
    ? 'Verified'
    : topHyp
      ? 'Unverified Hypothesis'
      : 'Pending Investigation';

  const evidence =
    c.rootCauseAnalysis?.verifiedEvidence?.trim() ||
    verifiedHyp?.managerNotes?.trim() ||
    topHyp?.supportingEvidence?.trim() ||
    c.testResults?.trim() ||
    c.inspectionNotes?.trim() ||
    'Refer to receiving inspection and complaint quality logs.';

  const proc = (c.processName || '').toLowerCase();
  let suggestedDepartment: string = 'Quality Assurance';
  if (/heat|quench|forge|forging|metallurg/.test(proc)) {
    suggestedDepartment = 'Heat Treatment & Metallurgy';
  } else if (/cnc|machin|turn|mill|grind|drill/.test(proc)) {
    suggestedDepartment = 'CNC & Precision Machining';
  } else if (/assembl|test|calibrat/.test(proc)) {
    suggestedDepartment = 'Assembly & Testing';
  } else if (/packag|dispatch|ship/.test(proc)) {
    suggestedDepartment = 'Packaging & Logistics';
  } else if (/supplier|vendor|raw/.test(proc)) {
    suggestedDepartment = 'Supplier Quality Engineering';
  }

  return {
    rootCause,
    rootCauseVerificationStatus,
    evidence,
    suggestedDepartment,
  };
}

export function CapaRegistrationModal({
  isOpen,
  suggestedId,
  complaints,
  preselectedComplaintId,
  editingCapa,
  onClose,
  onSave,
}: CapaRegistrationModalProps) {
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const defaultTarget = useMemo(
    () => new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10),
    []
  );

  const [complaintId, setComplaintId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [productId, setProductId] = useState('');
  const [productName, setProductName] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [defectCategory, setDefectCategory] = useState<ComplaintCategory>('Product Quality');
  const [manufacturingProcess, setManufacturingProcess] = useState('');
  const [machineId, setMachineId] = useState('');
  const [rootCause, setRootCause] = useState('');
  const [rootCauseVerificationStatus, setRootCauseVerificationStatus] =
    useState<CAPARootCauseStatus>('Pending Investigation');
  const [evidence, setEvidence] = useState('');
  const [priority, setPriority] = useState<PriorityLevel>('High');
  const [owner, setOwner] = useState('R. Deshmukh');
  const [responsibleDepartment, setResponsibleDepartment] = useState<string>(CAPA_DEPARTMENTS[0]);
  const [createdDate, setCreatedDate] = useState(todayIso);
  const [targetCompletionDate, setTargetCompletionDate] = useState(defaultTarget);
  const [status, setStatus] = useState<CAPAWorkflowStatus>('Assigned');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const populateFromComplaint = (c: ComplaintRecord) => {
    const rca = extractComplaintRcaContext(c);
    setComplaintId(c.id);
    setCustomerName(c.customerName);
    setProductId(c.productId);
    setProductName(c.productName);
    setBatchNumber(c.batchNumber);
    setDefectCategory(c.category);
    setManufacturingProcess(c.processName);
    setMachineId(c.machineId || 'Unspecified');
    setRootCause(rca.rootCause);
    setRootCauseVerificationStatus(rca.rootCauseVerificationStatus);
    setEvidence(rca.evidence);
    setResponsibleDepartment(rca.suggestedDepartment);
    setPriority(c.priority || (c.severity === 'Critical' ? 'Urgent' : 'High'));
    setOwner(c.assignedManager || 'R. Deshmukh');
    setDescription(
      `CAPA addressing ${c.category} complaint on ${c.productName} (Batch ${c.batchNumber}): ${c.description}`
    );
  };

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (editingCapa) {
      setComplaintId(editingCapa.complaintId);
      setCustomerName(editingCapa.customerName);
      setProductId(editingCapa.productId);
      setProductName(editingCapa.productName);
      setBatchNumber(editingCapa.batchNumber);
      setDefectCategory(editingCapa.defectCategory);
      setManufacturingProcess(editingCapa.manufacturingProcess);
      setMachineId(editingCapa.machineId);
      setRootCause(editingCapa.rootCause);
      setRootCauseVerificationStatus(editingCapa.rootCauseVerificationStatus);
      setEvidence(editingCapa.evidence);
      setPriority(editingCapa.priority);
      setOwner(editingCapa.owner);
      setResponsibleDepartment(editingCapa.responsibleDepartment);
      setCreatedDate(editingCapa.createdDate);
      setTargetCompletionDate(editingCapa.targetCompletionDate);
      setStatus(editingCapa.status);
      setDescription(editingCapa.description);
      return;
    }

    const initialComplaint =
      complaints.find((c) => c.id === preselectedComplaintId) ?? complaints[0];
    setCreatedDate(todayIso);
    setTargetCompletionDate(defaultTarget);
    setStatus('Assigned');
    if (initialComplaint) {
      populateFromComplaint(initialComplaint);
    }
  }, [isOpen, editingCapa, preselectedComplaintId, complaints, todayIso, defaultTarget]);

  if (!isOpen) return null;

  const handleComplaintChange = (nextId: string) => {
    const matched = complaints.find((c) => c.id === nextId);
    if (matched) {
      populateFromComplaint(matched);
    } else {
      setComplaintId(nextId);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!complaintId || !owner.trim() || !targetCompletionDate || !description.trim()) {
      setError('Related Complaint ID, CAPA Owner, Target Completion Date, and Description are required.');
      return;
    }

    const priorRelatedCount = Math.max(
      1,
      complaints.filter(
        (c) => c.productName === productName && c.category === defectCategory
      ).length
    );

    const baseEffEval = evaluateEffectivenessMetrics({
      complaintsBefore: priorRelatedCount,
      complaintsAfter: editingCapa?.effectiveness.complaintsAfter ?? null,
      productionVolumeBefore: editingCapa?.effectiveness.productionVolumeBefore ?? null,
      productionVolumeAfter: editingCapa?.effectiveness.productionVolumeAfter ?? null,
      baselinePeriod: editingCapa?.effectiveness.baselinePeriod || '90 days pre-CAPA',
      postPeriod: editingCapa?.effectiveness.postPeriod || '90 days post-CAPA',
    });

    onSave(
      {
        id: editingCapa ? editingCapa.id : suggestedId,
        complaintId,
        customerName: customerName.trim(),
        productId: productId.trim(),
        productName: productName.trim(),
        batchNumber: batchNumber.trim(),
        defectCategory,
        manufacturingProcess: manufacturingProcess.trim(),
        machineId: machineId.trim() || 'Unspecified',
        rootCause: rootCause.trim(),
        rootCauseVerificationStatus,
        evidence: evidence.trim(),
        priority,
        owner: owner.trim(),
        responsibleDepartment,
        createdDate,
        startDate: editingCapa?.startDate || createdDate,
        targetCompletionDate,
        actualCompletionDate: editingCapa?.actualCompletionDate,
        status,
        description: description.trim(),
        containmentActions: editingCapa?.containmentActions ?? [],
        correctiveActions: editingCapa?.correctiveActions ?? [],
        preventiveActions: editingCapa?.preventiveActions ?? [],
        attachments: editingCapa?.attachments ?? [],
        comments: editingCapa?.comments ?? '',
        managerCompletionApproved: editingCapa?.managerCompletionApproved ?? false,
        effectiveness: editingCapa?.effectiveness ?? {
          baselinePeriod: '90 days pre-CAPA',
          postPeriod: '90 days post-CAPA',
          observationSampleSizeOk: baseEffEval.observationSampleSizeOk,
          complaintsBefore: priorRelatedCount,
          complaintsAfter: null,
          productionVolumeBefore: null,
          productionVolumeAfter: null,
          defectRateBefore: baseEffEval.defectRateBefore,
          defectRateAfter: baseEffEval.defectRateAfter,
          repeatDefectOccurred: null,
          verificationMethod: 'Post-CAPA complaint & lot inspection monitoring',
          verificationEvidence: '',
          decision: 'Pending',
          isProvisionalComparison: baseEffEval.isProvisionalComparison,
          insufficientDataNotice: baseEffEval.insufficientDataNotice,
          comments: '',
        },
      },
      editingCapa?.id
    );
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="capa-reg-title"
    >
      <div className="bg-white border border-slate-200 rounded-lg max-w-3xl w-full shadow-2xl my-6 overflow-hidden">
        <div className="bg-[#0B1426] px-6 py-4 flex items-center justify-between text-white">
          <div>
            <p className="text-[11px] font-mono text-cyan-400">
              {editingCapa ? `EDIT ${editingCapa.id}` : `NEW CAPA · ${suggestedId}`}
            </p>
            <h2 id="capa-reg-title" className="text-base font-semibold">
              {editingCapa
                ? 'Edit CAPA Record'
                : 'Register Corrective & Preventive Action (CAPA)'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white rounded"
            aria-label="Close CAPA registration modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 text-xs max-h-[78vh] overflow-y-auto">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-red-800">
              {error}
            </div>
          )}

          {/* Complaint Link & Auto-Populated Context */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">CAPA ID</label>
              <input
                type="text"
                readOnly
                value={editingCapa ? editingCapa.id : suggestedId}
                className="w-full px-3 py-2 border border-slate-200 rounded-md bg-slate-50 font-mono font-semibold text-slate-800"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block font-medium text-slate-700 mb-1">
                Related Complaint ID *
              </label>
              <select
                value={complaintId}
                onChange={(e) => handleComplaintChange(e.target.value)}
                disabled={Boolean(editingCapa)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white disabled:bg-slate-50"
              >
                {complaints.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} — {c.productName} ({c.category} · {c.severity})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-md p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-slate-900">
                Auto-Populated Complaint, Process &amp; Root Cause Context
              </p>
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                  rootCauseVerificationStatus === 'Verified'
                    ? 'text-emerald-700'
                    : 'text-amber-700'
                }`}
              >
                {rootCauseVerificationStatus === 'Verified' ? (
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span>RCA: {rootCauseVerificationStatus}</span>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-500 mb-1">Customer Name</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-slate-900"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Product ID &amp; Name</label>
                <input
                  type="text"
                  readOnly
                  value={`${productId} · ${productName}`}
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded bg-white text-slate-700"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Batch Number</label>
                <input
                  type="text"
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white font-mono text-slate-900"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Defect Category</label>
                <input
                  type="text"
                  readOnly
                  value={defectCategory}
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded bg-white text-slate-700"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Manufacturing Process</label>
                <input
                  type="text"
                  value={manufacturingProcess}
                  onChange={(e) => setManufacturingProcess(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-slate-900"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Machine ID</label>
                <input
                  type="text"
                  value={machineId}
                  onChange={(e) => setMachineId(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white font-mono text-slate-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  Root Cause Summary
                </label>
                <input
                  type="text"
                  value={rootCause}
                  onChange={(e) => setRootCause(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-slate-900"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  Supporting Evidence / Test Logs
                </label>
                <input
                  type="text"
                  value={evidence}
                  onChange={(e) => setEvidence(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Ownership, Governance & Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Priority Level *</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as PriorityLevel)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">CAPA Owner *</label>
              <input
                type="text"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="e.g., R. Deshmukh"
                className="w-full px-3 py-2 border border-slate-300 rounded-md"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Responsible Department *
              </label>
              <select
                value={responsibleDepartment}
                onChange={(e) => setResponsibleDepartment(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white"
              >
                {CAPA_DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Created Date *</label>
              <input
                type="date"
                value={createdDate}
                onChange={(e) => setCreatedDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md tabular-nums"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Target Completion Date *
              </label>
              <input
                type="date"
                value={targetCompletionDate}
                onChange={(e) => setTargetCompletionDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md tabular-nums"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Initial Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as CAPAWorkflowStatus)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white"
              >
                <option value="New">New</option>
                <option value="Assigned">Assigned</option>
                <option value="In Progress">In Progress</option>
                <option value="Pending Verification">Pending Verification</option>
                {editingCapa && <option value="Closed">Closed</option>}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              CAPA Scope &amp; Description *
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Summarize containment scope, root cause remediation plan, and preventive system objective..."
              className="w-full px-3 py-2 border border-slate-300 rounded-md"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium text-white bg-cyan-700 rounded-md hover:bg-cyan-800"
            >
              {editingCapa ? 'Save CAPA Changes' : 'Create CAPA Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
