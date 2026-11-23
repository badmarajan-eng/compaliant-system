import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Edit3,
  FileText,
  History,
  Loader2,
  Paperclip,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { CapaAnalyticsPanel } from '../components/CapaAnalyticsPanel';
import { CapaRegistrationModal } from '../components/CapaRegistrationModal';
import { CapaReportModal } from '../components/CapaReportModal';
import { requestCapaRecommendations } from '../services/aiClient';
import type {
  CAPAActionSectionType,
  CAPACompletionStatus,
  CAPAEffectivenessDecision,
  CAPAEvidenceAttachment,
  CAPAPlanTask,
  CAPARecord,
  CAPAWorkflowStatus,
  ComplaintRecord,
  EnhancedAICapaRecommendationItem,
  EnhancedGeneratedCAPAResponse,
  ModuleId,
} from '../types/qms';
import {
  CAPA_DEPARTMENTS,
  computeCapaDashboardKpis,
  evaluateEffectivenessMetrics,
  exportCapaSummaryCsv,
  exportSingleCapaCsv,
  generateNextCapaId,
  resolveEffectiveCapaStatus,
} from '../utils/capaUtils';
import { computeProcessRiskAssessments, computeProductRiskAssessments } from '../utils/predictiveEngine';

interface CapaViewProps {
  complaints: ComplaintRecord[];
  capaRecords: CAPARecord[];
  preselectedId?: string | null;
  onAddCapa: (
    payload: Omit<CAPARecord, 'id' | 'isDemoData' | 'history' | 'progressPercent'> & {
      id?: string;
    }
  ) => CAPARecord;
  onUpdateCapa: (
    capaId: string,
    patch: Partial<CAPARecord>,
    auditMeta?: { action?: string; actor?: string; notes?: string }
  ) => void;
  onDeleteCapa: (capaId: string) => void;
  onNavigate?: (module: ModuleId, complaintId?: string) => void;
}

type CapaTabId = 'register' | 'tracking' | 'effectiveness' | 'analytics' | 'reports';

const SUBTYPES_BY_SECTION: Record<CAPAActionSectionType, string[]> = {
  Containment: [
    'Immediate Quarantine & Hold',
    'Lot Sorting & 100% Inspection',
    'Customer Field Notification',
    'Suspect Material Segregation',
  ],
  Corrective: [
    'Process Correction',
    'Machine Calibration & Tooling Fix',
    'Supplier Material Replacement',
    'Verification Testing',
    'Operator Standard Work Update',
  ],
  Preventive: [
    'Process Improvement',
    'Additional Quality Inspection',
    'Supplier Evaluation',
    'Employee Training',
    'Preventive Maintenance',
    'SPC Control Limit Tightening',
  ],
};

const TASK_STATUSES: CAPACompletionStatus[] = [
  'Not Started',
  'In Progress',
  'Completed',
  'Overdue',
];

function getStatusTextClass(status: CAPAWorkflowStatus): string {
  switch (status) {
    case 'Effective':
      return 'text-emerald-700 font-semibold';
    case 'Ineffective':
    case 'Overdue':
      return 'text-red-700 font-semibold';
    case 'Pending Verification':
      return 'text-amber-700 font-semibold';
    case 'In Progress':
      return 'text-cyan-800 font-semibold';
    case 'Closed':
      return 'text-slate-600 font-semibold';
    default:
      return 'text-slate-800 font-semibold';
  }
}

export function CapaView({
  complaints,
  capaRecords,
  preselectedId,
  onAddCapa,
  onUpdateCapa,
  onDeleteCapa,
  onNavigate,
}: CapaViewProps) {
  const [activeTab, setActiveTab] = useState<CapaTabId>('register');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedCapaId, setSelectedCapaId] = useState<string>(capaRecords[0]?.id || '');

  // Modals
  const [regModalOpen, setRegModalOpen] = useState(false);
  const [editingCapa, setEditingCapa] = useState<CAPARecord | null>(null);
  const [regPreselectedComplaintId, setRegPreselectedComplaintId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportMode, setReportMode] = useState<'single' | 'summary'>('single');

  // Gemini AI CAPA state
  const [aiResponse, setAiResponse] = useState<EnhancedGeneratedCAPAResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [dismissedAiKeys, setDismissedAiKeys] = useState<Record<string, boolean>>({});
  const [editingAiKey, setEditingAiKey] = useState<string | null>(null);
  const [aiDraftTitle, setAiDraftTitle] = useState('');
  const [aiDraftDesc, setAiDraftDesc] = useState('');
  const [aiDraftOwner, setAiDraftOwner] = useState('');

  // Custom task inline form
  const [addingSection, setAddingSection] = useState<CAPAActionSectionType | null>(null);
  const [taskSubtype, setTaskSubtype] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskOwner, setTaskOwner] = useState('');
  const [taskDept, setTaskDept] = useState<string>(CAPA_DEPARTMENTS[0]);
  const [taskTargetDate, setTaskTargetDate] = useState(
    new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  );
  const [taskFormError, setTaskFormError] = useState<string | null>(null);

  // Attachment note input
  const [attachmentNote, setAttachmentNote] = useState('');

  // Effectiveness form state synced when selected CAPA changes
  const [effBaselinePeriod, setEffBaselinePeriod] = useState('90 days pre-CAPA');
  const [effPostPeriod, setEffPostPeriod] = useState('90 days post-CAPA');
  const [effBeforeCount, setEffBeforeCount] = useState<string>('1');
  const [effAfterCount, setEffAfterCount] = useState<string>('');
  const [effVolBefore, setEffVolBefore] = useState<string>('');
  const [effVolAfter, setEffVolAfter] = useState<string>('');
  const [effMethod, setEffMethod] = useState('');
  const [effEvidence, setEffEvidence] = useState('');
  const [effRepeatOccurred, setEffRepeatOccurred] = useState<'Pending' | 'Yes' | 'No'>('Pending');
  const [effDecision, setEffDecision] = useState<CAPAEffectivenessDecision>('Pending');
  const [effReviewer, setEffReviewer] = useState('R. Deshmukh');
  const [effComments, setEffComments] = useState('');
  const [effSavedNotice, setEffSavedNotice] = useState<string | null>(null);
  const [effError, setEffError] = useState<string | null>(null);

  // Sync preselectedId (either CAPA ID or Complaint ID)
  useEffect(() => {
    if (!preselectedId) return;
    const directCapa = capaRecords.find((c) => c.id === preselectedId);
    if (directCapa) {
      setSelectedCapaId(directCapa.id);
      return;
    }
    const byComplaint = capaRecords.find((c) => c.complaintId === preselectedId);
    if (byComplaint) {
      setSelectedCapaId(byComplaint.id);
      return;
    }
    if (complaints.some((c) => c.id === preselectedId)) {
      setRegPreselectedComplaintId(preselectedId);
    }
  }, [preselectedId, capaRecords, complaints]);

  const kpis = useMemo(() => computeCapaDashboardKpis(capaRecords), [capaRecords]);

  const filteredCapas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return capaRecords.filter((c) => {
      const effStatus = resolveEffectiveCapaStatus(c);
      if (statusFilter === 'OPEN') {
        if (effStatus === 'Closed' || effStatus === 'Effective' || effStatus === 'Ineffective') {
          return false;
        }
      } else if (statusFilter !== 'ALL' && effStatus !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        c.id.toLowerCase().includes(q) ||
        c.complaintId.toLowerCase().includes(q) ||
        c.productName.toLowerCase().includes(q) ||
        c.owner.toLowerCase().includes(q) ||
        c.batchNumber.toLowerCase().includes(q)
      );
    });
  }, [capaRecords, search, statusFilter]);

  const selectedCapa = useMemo(
    () =>
      capaRecords.find((c) => c.id === selectedCapaId) ??
      filteredCapas[0] ??
      capaRecords[0] ??
      null,
    [capaRecords, selectedCapaId, filteredCapas]
  );

  const linkedComplaint = useMemo(
    () =>
      selectedCapa
        ? complaints.find((c) => c.id === selectedCapa.complaintId) ?? null
        : null,
    [complaints, selectedCapa]
  );

  // Load effectiveness fields when selectedCapa switches
  useEffect(() => {
    if (!selectedCapa) return;
    const eff = selectedCapa.effectiveness;
    setEffBaselinePeriod(eff.baselinePeriod || '90 days pre-CAPA');
    setEffPostPeriod(eff.postPeriod || '90 days post-CAPA');
    setEffBeforeCount(String(eff.complaintsBefore));
    setEffAfterCount(eff.complaintsAfter !== null ? String(eff.complaintsAfter) : '');
    setEffVolBefore(
      eff.productionVolumeBefore !== null ? String(eff.productionVolumeBefore) : ''
    );
    setEffVolAfter(eff.productionVolumeAfter !== null ? String(eff.productionVolumeAfter) : '');
    setEffMethod(eff.verificationMethod || '');
    setEffEvidence(eff.verificationEvidence || '');
    setEffRepeatOccurred(
      eff.repeatDefectOccurred === null ? 'Pending' : eff.repeatDefectOccurred ? 'Yes' : 'No'
    );
    setEffDecision(eff.decision);
    setEffReviewer(eff.reviewer || 'R. Deshmukh');
    setEffComments(eff.comments || '');
    setEffSavedNotice(null);
    setEffError(null);
  }, [selectedCapa?.id]);

  // Predictive risk context for Gemini CAPA recommendations
  const predictiveContext = useMemo(() => {
    if (!linkedComplaint) return undefined;
    const prodRisks = computeProductRiskAssessments(complaints, undefined, capaRecords);
    const procRisks = computeProcessRiskAssessments(complaints, undefined, capaRecords);
    const matchedProd = prodRisks.find((p) => p.productName === linkedComplaint.productName);
    const matchedProc = procRisks.find(
      (pr) =>
        pr.processName === linkedComplaint.processName ||
        pr.observedShopProcesses.includes(linkedComplaint.processName)
    );
    return {
      productRiskScore: matchedProd?.riskScore,
      productRiskLevel: matchedProd?.riskLevel,
      processRiskScore: matchedProc?.riskScore ?? null,
      processRiskLevel: matchedProc?.riskLevel,
      mainRiskFactors: matchedProd?.mainRiskFactors,
    };
  }, [linkedComplaint, complaints, capaRecords]);

  const subsequentMatchingComplaintsCount = useMemo(() => {
    if (!selectedCapa) return 0;
    const refDate =
      selectedCapa.actualCompletionDate || selectedCapa.createdDate;
    return complaints.filter(
      (c) =>
        c.id !== selectedCapa.complaintId &&
        c.productName === selectedCapa.productName &&
        c.category === selectedCapa.defectCategory &&
        c.complaintDate > refDate
    ).length;
  }, [complaints, selectedCapa]);

  const handleGenerateAiRecommendations = async () => {
    if (!selectedCapa || !linkedComplaint) {
      setAiError('Select a CAPA linked to a valid complaint record to run AI recommendations.');
      return;
    }
    setAiLoading(true);
    setAiError(null);
    setDismissedAiKeys({});
    setEditingAiKey(null);
    try {
      const res = await requestCapaRecommendations(
        linkedComplaint,
        complaints,
        predictiveContext
      );
      setAiResponse(res);
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : 'Failed to generate AI CAPA recommendations.'
      );
    } finally {
      setAiLoading(false);
    }
  };

  const acceptAiRecommendation = (
    item: EnhancedAICapaRecommendationItem,
    key: string,
    override?: { title: string; description: string; owner: string }
  ) => {
    if (!selectedCapa) return;
    const targetDate = new Date(Date.now() + Math.max(1, item.targetDays || 14) * 86400000)
      .toISOString()
      .slice(0, 10);

    const newTask: CAPAPlanTask = {
      id: `TASK-${selectedCapa.id}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      actionType: item.actionType,
      actionSubtype: item.actionSubtype,
      title: (override?.title ?? item.title).trim(),
      description: (override?.description ?? item.description).trim(),
      origin: 'AI Recommended',
      approvalStatus: 'Accepted',
      isProvisional: aiResponse?.isProvisional ?? selectedCapa.rootCauseVerificationStatus !== 'Verified',
      responsiblePerson: (override?.owner ?? item.suggestedOwnerRole).trim() || selectedCapa.owner,
      responsibleDepartment: item.responsibleDepartment || selectedCapa.responsibleDepartment,
      startDate: new Date().toISOString().slice(0, 10),
      targetDate,
      progressPercent: 0,
      status: 'Not Started',
      managerApprovedCompletion: false,
      requiredResources: item.requiredResources,
      suggestedVerificationMethod: item.suggestedVerificationMethod,
      expectedImprovement: item.expectedImprovement,
      supportingEvidence: item.supportingEvidence,
      implementationEvidence: '',
      managerComments: '',
    };

    const patch: Partial<CAPARecord> =
      item.actionType === 'Containment'
        ? { containmentActions: [...selectedCapa.containmentActions, newTask] }
        : item.actionType === 'Preventive'
          ? { preventiveActions: [...selectedCapa.preventiveActions, newTask] }
          : { correctiveActions: [...selectedCapa.correctiveActions, newTask] };

    onUpdateCapa(selectedCapa.id, patch, {
      action: `AI ${item.actionType} Action Accepted`,
      actor: 'R. Deshmukh',
      notes: `Added "${newTask.title}" (${newTask.isProvisional ? 'Provisional — unverified RCA' : 'RCA Verified'}).`,
    });
    setDismissedAiKeys((prev) => ({ ...prev, [key]: true }));
    setEditingAiKey(null);
  };

  const handleAddCustomTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCapa || !addingSection) return;
    if (!taskTitle.trim() || !taskDesc.trim() || !taskOwner.trim() || !taskTargetDate) {
      setTaskFormError('Title, description, responsible person, and target date are required.');
      return;
    }
    setTaskFormError(null);
    const newTask: CAPAPlanTask = {
      id: `TASK-${selectedCapa.id}-M-${Date.now()}`,
      actionType: addingSection,
      actionSubtype: taskSubtype || SUBTYPES_BY_SECTION[addingSection][0],
      title: taskTitle.trim(),
      description: taskDesc.trim(),
      origin: 'Manager Added',
      approvalStatus: 'Accepted',
      isProvisional: selectedCapa.rootCauseVerificationStatus !== 'Verified',
      responsiblePerson: taskOwner.trim(),
      responsibleDepartment: taskDept,
      startDate: new Date().toISOString().slice(0, 10),
      targetDate: taskTargetDate,
      progressPercent: 0,
      status: 'Not Started',
      managerApprovedCompletion: false,
      implementationEvidence: '',
      managerComments: '',
    };

    const patch: Partial<CAPARecord> =
      addingSection === 'Containment'
        ? { containmentActions: [...selectedCapa.containmentActions, newTask] }
        : addingSection === 'Preventive'
          ? { preventiveActions: [...selectedCapa.preventiveActions, newTask] }
          : { correctiveActions: [...selectedCapa.correctiveActions, newTask] };

    onUpdateCapa(selectedCapa.id, patch, {
      action: `${addingSection} Action Added`,
      actor: 'R. Deshmukh',
      notes: newTask.title,
    });

    setTaskTitle('');
    setTaskDesc('');
    setAddingSection(null);
  };

  const updateTaskInCapa = (
    capa: CAPARecord,
    section: CAPAActionSectionType,
    taskId: string,
    taskPatch: Partial<CAPAPlanTask>
  ) => {
    const mapList = (list: CAPAPlanTask[]) =>
      list.map((t) => {
        if (t.id !== taskId) return t;
        const nextStatus = taskPatch.status ?? t.status;
        const nextProgress =
          taskPatch.progressPercent !== undefined
            ? taskPatch.progressPercent
            : nextStatus === 'Completed'
              ? 100
              : nextStatus === 'Not Started'
                ? 0
                : t.progressPercent;
        const nextCompletionDate =
          nextStatus === 'Completed'
            ? t.completionDate || new Date().toISOString().slice(0, 10)
            : undefined;
        return {
          ...t,
          ...taskPatch,
          progressPercent: nextProgress,
          completionDate: nextCompletionDate,
        };
      });

    const patch: Partial<CAPARecord> =
      section === 'Containment'
        ? { containmentActions: mapList(capa.containmentActions) }
        : section === 'Preventive'
          ? { preventiveActions: mapList(capa.preventiveActions) }
          : { correctiveActions: mapList(capa.correctiveActions) };

    onUpdateCapa(capa.id, patch);
  };

  const deleteTaskInCapa = (
    capa: CAPARecord,
    section: CAPAActionSectionType,
    taskId: string
  ) => {
    const patch: Partial<CAPARecord> =
      section === 'Containment'
        ? { containmentActions: capa.containmentActions.filter((t) => t.id !== taskId) }
        : section === 'Preventive'
          ? { preventiveActions: capa.preventiveActions.filter((t) => t.id !== taskId) }
          : { correctiveActions: capa.correctiveActions.filter((t) => t.id !== taskId) };
    onUpdateCapa(capa.id, patch, {
      action: `${section} Action Removed`,
      actor: 'R. Deshmukh',
      notes: `Removed action item ${taskId}.`,
    });
  };

  const handleAttachEvidenceFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedCapa) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const entry: CAPAEvidenceAttachment = {
      id: `ATT-${Date.now()}`,
      fileName: file.name,
      fileType: file.type || 'document',
      fileSizeKb: Math.max(1, Math.round(file.size / 1024)),
      uploadedAt: new Date().toISOString(),
      notes: attachmentNote.trim() || 'Implementation / inspection evidence record',
    };
    onUpdateCapa(
      selectedCapa.id,
      { attachments: [entry, ...selectedCapa.attachments] },
      {
        action: 'Evidence Attachment Added',
        actor: 'R. Deshmukh',
        notes: `${file.name} (${entry.fileSizeKb} KB)`,
      }
    );
    setAttachmentNote('');
    e.target.value = '';
  };

  const handleSaveEffectiveness = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCapa) return;
    setEffError(null);
    setEffSavedNotice(null);

    const beforeNum = Number(effBeforeCount);
    const afterNum = effAfterCount.trim() === '' ? null : Number(effAfterCount);
    const volBeforeNum = effVolBefore.trim() === '' ? null : Number(effVolBefore);
    const volAfterNum = effVolAfter.trim() === '' ? null : Number(effVolAfter);

    if (!Number.isFinite(beforeNum) || beforeNum < 0) {
      setEffError('Baseline complaint count must be 0 or greater.');
      return;
    }

    const metrics = evaluateEffectivenessMetrics({
      complaintsBefore: beforeNum,
      complaintsAfter: afterNum !== null && Number.isFinite(afterNum) ? afterNum : null,
      productionVolumeBefore:
        volBeforeNum !== null && Number.isFinite(volBeforeNum) ? volBeforeNum : null,
      productionVolumeAfter:
        volAfterNum !== null && Number.isFinite(volAfterNum) ? volAfterNum : null,
      baselinePeriod: effBaselinePeriod,
      postPeriod: effPostPeriod,
    });

    if (effDecision === 'Effective' && !metrics.observationSampleSizeOk) {
      setEffError(
        metrics.insufficientDataNotice ||
          'Insufficient Data for Verification: Cannot mark CAPA Effective without valid post-CAPA complaint count, observation window, and adequate sample size (>= 50 units if volume provided).'
      );
      return;
    }

    if (effDecision === 'Effective' && !selectedCapa.managerCompletionApproved) {
      setEffError(
        'Manager approval of CAPA implementation completion is required before verifying effectiveness as Effective.'
      );
      return;
    }

    const verifiedDate =
      effDecision === 'Pending' ? undefined : new Date().toISOString().slice(0, 10);

    let nextStatus = selectedCapa.status;
    if (effDecision === 'Effective') nextStatus = 'Effective';
    else if (effDecision === 'Ineffective') nextStatus = 'Ineffective';
    else if (effDecision === 'Inconclusive') nextStatus = 'Pending Verification';

    onUpdateCapa(
      selectedCapa.id,
      {
        status: nextStatus,
        actualCompletionDate:
          selectedCapa.actualCompletionDate ||
          (effDecision !== 'Pending' ? new Date().toISOString().slice(0, 10) : undefined),
        effectiveness: {
          baselinePeriod: effBaselinePeriod.trim() || '90 days pre-CAPA',
          postPeriod: effPostPeriod.trim() || '90 days post-CAPA',
          observationSampleSizeOk: metrics.observationSampleSizeOk,
          complaintsBefore: beforeNum,
          complaintsAfter: afterNum !== null && Number.isFinite(afterNum) ? afterNum : null,
          productionVolumeBefore:
            volBeforeNum !== null && Number.isFinite(volBeforeNum) ? volBeforeNum : null,
          productionVolumeAfter:
            volAfterNum !== null && Number.isFinite(volAfterNum) ? volAfterNum : null,
          defectRateBefore: metrics.defectRateBefore,
          defectRateAfter: metrics.defectRateAfter,
          repeatDefectOccurred:
            effRepeatOccurred === 'Pending' ? null : effRepeatOccurred === 'Yes',
          verificationMethod: effMethod.trim() || 'Post-CAPA complaint & inspection audit',
          verificationEvidence: effEvidence.trim(),
          decision: effDecision,
          isProvisionalComparison: metrics.isProvisionalComparison,
          insufficientDataNotice: metrics.insufficientDataNotice,
          verifiedDate,
          reviewer: effReviewer.trim() || 'R. Deshmukh',
          comments: effComments.trim(),
        },
      },
      {
        action: `Effectiveness Evaluation Saved (${effDecision})`,
        actor: effReviewer.trim() || 'R. Deshmukh',
        notes: `Before: ${beforeNum} · After: ${afterNum ?? 'Pending'}${metrics.isProvisionalComparison ? ' · Counts Only (Provisional)' : ''}. ${effComments.trim()}`,
      }
    );

    setEffSavedNotice(
      `Effectiveness verification saved as "${effDecision}". Predictive Quality Intelligence risk scores and alerts have been updated.`
    );
  };

  // Flattened tasks for Section 6 Implementation Tracking Table
  const allTrackingRows = useMemo(() => {
    const rows: Array<{
      capa: CAPARecord;
      effectiveCapaStatus: CAPAWorkflowStatus;
      task: CAPAPlanTask;
    }> = [];
    for (const capa of capaRecords) {
      const effectiveCapaStatus = resolveEffectiveCapaStatus(capa);
      [
        ...capa.containmentActions,
        ...capa.correctiveActions,
        ...capa.preventiveActions,
      ].forEach((task) => {
        rows.push({ capa, effectiveCapaStatus, task });
      });
    }
    return rows;
  }, [capaRecords]);

  // Live effectiveness evaluation preview for the currently edited form
  const liveEffPreview = useMemo(() => {
    const beforeNum = Number(effBeforeCount);
    const afterNum = effAfterCount.trim() === '' ? null : Number(effAfterCount);
    const volBeforeNum = effVolBefore.trim() === '' ? null : Number(effVolBefore);
    const volAfterNum = effVolAfter.trim() === '' ? null : Number(effVolAfter);
    return evaluateEffectivenessMetrics({
      complaintsBefore: Number.isFinite(beforeNum) ? beforeNum : 0,
      complaintsAfter: afterNum !== null && Number.isFinite(afterNum) ? afterNum : null,
      productionVolumeBefore:
        volBeforeNum !== null && Number.isFinite(volBeforeNum) ? volBeforeNum : null,
      productionVolumeAfter:
        volAfterNum !== null && Number.isFinite(volAfterNum) ? volAfterNum : null,
      baselinePeriod: effBaselinePeriod,
      postPeriod: effPostPeriod,
    });
  }, [
    effBeforeCount,
    effAfterCount,
    effVolBefore,
    effVolAfter,
    effBaselinePeriod,
    effPostPeriod,
  ]);

  const suggestedCapaId = useMemo(() => generateNextCapaId(capaRecords), [capaRecords]);

  const aiItemsFlattened = useMemo(() => {
    if (!aiResponse) return [];
    return [
      ...aiResponse.containmentActions.map((item, idx) => ({
        key: `CONT-${idx}`,
        item,
      })),
      ...aiResponse.correctiveActions.map((item, idx) => ({
        key: `CORR-${idx}`,
        item,
      })),
      ...aiResponse.preventiveActions.map((item, idx) => ({
        key: `PREV-${idx}`,
        item,
      })),
    ].filter((entry) => !dismissedAiKeys[entry.key]);
  }, [aiResponse, dismissedAiKeys]);

  const selectedEffectiveStatus = selectedCapa
    ? resolveEffectiveCapaStatus(selectedCapa)
    : 'New';

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#0B1426] text-slate-100 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-mono text-cyan-400">
            ENTERPRISE QUALITY SYSTEM · STAGE 7 CAPA MANAGEMENT
          </p>
          <h2 className="text-base sm:text-lg font-bold text-white mt-0.5">
            Corrective &amp; Preventive Action (CAPA) Governance Center
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-3xl">
            Manage three-tier Containment, Corrective, and Preventive actions linked to verified root causes, implementation tracking, effectiveness verification, and Predictive Quality Intelligence risk feedback.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setReportMode('summary');
              setReportModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
            <span>CAPA Reports</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingCapa(null);
              setRegPreselectedComplaintId(linkedComplaint?.id ?? complaints[0]?.id ?? null);
              setRegModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-cyan-700 hover:bg-cyan-600 rounded-md whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Register CAPA</span>
          </button>
        </div>
      </div>

      {/* Section 1: 7 Dynamic Dashboard KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
        {(
          [
            {
              label: 'Total CAPA Records',
              value: kpis.totalCapa,
              filter: 'ALL',
              accent: 'text-slate-900',
            },
            {
              label: 'Open CAPA',
              value: kpis.openCapa,
              filter: 'OPEN',
              accent: 'text-cyan-800',
            },
            {
              label: 'In Progress',
              value: kpis.inProgressCapa,
              filter: 'In Progress',
              accent: 'text-cyan-700',
            },
            {
              label: 'Pending Verification',
              value: kpis.pendingVerificationCapa,
              filter: 'Pending Verification',
              accent: 'text-amber-700',
            },
            {
              label: 'Overdue CAPA',
              value: kpis.overdueCapa,
              filter: 'Overdue',
              accent: 'text-red-700',
            },
            {
              label: 'Effective CAPA',
              value: kpis.effectiveCapa,
              filter: 'Effective',
              accent: 'text-emerald-700',
            },
            {
              label: 'Ineffective CAPA',
              value: kpis.ineffectiveCapa,
              filter: 'Ineffective',
              accent: 'text-red-700',
            },
          ] as const
        ).map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={() => {
              setStatusFilter(card.filter);
              setActiveTab('register');
            }}
            className={`text-left bg-white border rounded-lg p-3.5 transition-colors ${
              statusFilter === card.filter && activeTab === 'register'
                ? 'border-cyan-600 ring-1 ring-cyan-600/30'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <p className="text-[11px] text-slate-500">{card.label}</p>
            <p className={`text-2xl font-bold font-mono tabular-nums mt-1 ${card.accent}`}>
              {card.value}
            </p>
          </button>
        ))}
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
        {(
          [
            { id: 'register', label: `CAPA Register & Actions (${capaRecords.length})` },
            { id: 'tracking', label: `Implementation Tracking (${allTrackingRows.length} tasks)` },
            { id: 'effectiveness', label: `Effectiveness Verification` },
            { id: 'analytics', label: `CAPA Analytics` },
            { id: 'reports', label: `CAPA Reports & Export` },
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

      {/* TAB 1: CAPA REGISTER, 3 ACTION TIERS, GEMINI AI & WORKFLOW */}
      {activeTab === 'register' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left CAPA Register List */}
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-lg flex flex-col max-h-[960px]">
            <div className="p-4 border-b border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  CAPA Register ({filteredCapas.length})
                </h3>
                {statusFilter !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setStatusFilter('ALL')}
                    className="text-[11px] text-cyan-800 hover:underline font-medium"
                  >
                    Clear filter
                  </button>
                )}
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
                  placeholder="Search CAPA ID, complaint, product, owner..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-600/30"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter CAPA register by status"
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
              >
                <option value="ALL">All CAPA Statuses</option>
                <option value="OPEN">All Open CAPAs</option>
                <option value="New">New</option>
                <option value="Assigned">Assigned</option>
                <option value="In Progress">In Progress</option>
                <option value="Pending Verification">Pending Verification</option>
                <option value="Overdue">Overdue</option>
                <option value="Effective">Effective</option>
                <option value="Ineffective">Ineffective</option>
                <option value="Closed">Closed</option>
              </select>
            </div>

            <div className="overflow-y-auto divide-y divide-slate-100 flex-1">
              {filteredCapas.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No CAPAs match current search/filter.
                </div>
              ) : (
                filteredCapas.map((cp) => {
                  const effSt = resolveEffectiveCapaStatus(cp);
                  const active = selectedCapa?.id === cp.id;
                  return (
                    <button
                      key={cp.id}
                      type="button"
                      onClick={() => {
                        setSelectedCapaId(cp.id);
                        setAiResponse(null);
                        setAiError(null);
                      }}
                      className={`w-full text-left p-3.5 transition-colors ${
                        active ? 'bg-cyan-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold text-cyan-800">
                          {cp.id}
                        </span>
                        <span className={`text-[11px] ${getStatusTextClass(effSt)}`}>
                          {effSt}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-slate-900 mt-1 truncate">
                        {cp.productName}
                      </p>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                        <span className="font-mono">{cp.complaintId} · {cp.batchNumber}</span>
                        <span className="font-mono tabular-nums">{cp.progressPercent}%</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                        <span className="truncate">{cp.owner}</span>
                        {cp.isDemoData && (
                          <span className="font-mono text-[10px] text-slate-400 shrink-0">
                            DEMO DATA
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right CAPA Detail & Action Plan Workspace */}
          <div className="lg:col-span-8 space-y-5">
            {!selectedCapa ? (
              <div className="bg-white border border-slate-200 rounded-lg p-10 text-center space-y-3">
                <p className="text-sm font-medium text-slate-800">No CAPA selected or registered.</p>
                <button
                  type="button"
                  onClick={() => {
                    setEditingCapa(null);
                    setRegModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-cyan-700 rounded-md hover:bg-cyan-800"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Register First CAPA</span>
                </button>
              </div>
            ) : (
              <>
                {/* Selected CAPA Header & Context */}
                <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-200">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono font-bold text-cyan-800">
                          {selectedCapa.id}
                        </span>
                        <span aria-hidden="true">·</span>
                        <button
                          type="button"
                          onClick={() =>
                            onNavigate?.('complaints', selectedCapa.complaintId)
                          }
                          className="font-mono text-slate-700 hover:text-cyan-800 hover:underline"
                        >
                          {selectedCapa.complaintId}
                        </button>
                        <span aria-hidden="true">·</span>
                        <span className={getStatusTextClass(selectedEffectiveStatus)}>
                          {selectedEffectiveStatus}
                        </span>
                        {selectedCapa.isDemoData && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-[11px] text-slate-500">
                              DEMO DATA
                            </span>
                          </>
                        )}
                      </div>
                      <h3 className="text-base font-semibold text-slate-900 mt-1">
                        {selectedCapa.productId} · {selectedCapa.productName} (Batch{' '}
                        {selectedCapa.batchNumber})
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Customer: {selectedCapa.customerName} · Process:{' '}
                        {selectedCapa.manufacturingProcess} · Machine: {selectedCapa.machineId} · Category:{' '}
                        {selectedCapa.defectCategory}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setReportMode('single');
                          setReportModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50"
                      >
                        <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Report</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setEditingCapa(selectedCapa);
                          setRegModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50"
                      >
                        <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(selectedCapa.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 rounded hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>

                  {/* Delete Confirmation Inline Banner */}
                  {deleteConfirmId === selectedCapa.id && (
                    <div className="bg-red-50 border border-red-200 rounded-md p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <span className="text-red-900 font-medium">
                        Confirm permanent deletion of CAPA {selectedCapa.id}? Complaint{' '}
                        {selectedCapa.complaintId} will remain intact.
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(null)}
                          className="px-2.5 py-1 bg-white border border-slate-300 rounded text-slate-700"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteCapa(selectedCapa.id);
                            setDeleteConfirmId(null);
                          }}
                          className="px-2.5 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                        >
                          Confirm Delete
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Root Cause & Evidence Context */}
                  <div className="bg-slate-50 border border-slate-200 rounded-md p-3.5 text-xs space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">
                        Linked Root Cause ({selectedCapa.rootCauseVerificationStatus})
                      </span>
                      <button
                        type="button"
                        onClick={() => onNavigate?.('root-cause', selectedCapa.complaintId)}
                        className="text-[11px] text-cyan-800 hover:underline font-medium"
                      >
                        Open in Root Cause Engine →
                      </button>
                    </div>
                    <p className="text-slate-800">{selectedCapa.rootCause}</p>
                    <p className="text-slate-600">
                      <strong>Evidence:</strong> {selectedCapa.evidence}
                    </p>
                    <p className="text-slate-600">
                      <strong>CAPA Description:</strong> {selectedCapa.description}
                    </p>
                  </div>

                  {/* Section 5: Workflow Governance Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs pt-1">
                    <div>
                      <label className="block text-slate-500 mb-1">Workflow Status</label>
                      <select
                        value={selectedCapa.status}
                        onChange={(e) =>
                          onUpdateCapa(selectedCapa.id, {
                            status: e.target.value as CAPAWorkflowStatus,
                          })
                        }
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-slate-900"
                      >
                        {(
                          [
                            'New',
                            'Assigned',
                            'In Progress',
                            'Pending Verification',
                            'Effective',
                            'Ineffective',
                            'Closed',
                            'Overdue',
                          ] as CAPAWorkflowStatus[]
                        ).map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-500 mb-1">CAPA Owner</label>
                      <input
                        type="text"
                        value={selectedCapa.owner}
                        onChange={(e) =>
                          onUpdateCapa(selectedCapa.id, { owner: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-500 mb-1">Target Completion</label>
                      <input
                        type="date"
                        value={selectedCapa.targetCompletionDate}
                        onChange={(e) =>
                          onUpdateCapa(selectedCapa.id, {
                            targetCompletionDate: e.target.value,
                          })
                        }
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded tabular-nums text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-500 mb-1">Overall Progress</label>
                      <div className="flex items-center gap-2 h-[30px]">
                        <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-cyan-600 transition-all"
                            style={{ width: `${selectedCapa.progressPercent}%` }}
                          />
                        </div>
                        <span className="font-mono font-semibold tabular-nums text-slate-800">
                          {selectedCapa.progressPercent}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Manager Pre-Verification Implementation Approval */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-slate-100 text-xs">
                    <label className="inline-flex items-center gap-2 font-medium text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedCapa.managerCompletionApproved}
                        onChange={(e) =>
                          onUpdateCapa(
                            selectedCapa.id,
                            {
                              managerCompletionApproved: e.target.checked,
                              status:
                                e.target.checked &&
                                selectedCapa.status !== 'Effective' &&
                                selectedCapa.status !== 'Ineffective' &&
                                selectedCapa.status !== 'Closed'
                                  ? 'Pending Verification'
                                  : selectedCapa.status,
                            },
                            {
                              action: e.target.checked
                                ? 'Manager Approved Implementation Completion'
                                : 'Manager Implementation Approval Withdrawn',
                              actor: 'R. Deshmukh',
                              notes: e.target.checked
                                ? 'Implementation evidence verified; ready for effectiveness monitoring.'
                                : 'Returned for further implementation evidence.',
                            }
                          )
                        }
                        className="rounded border-slate-300 text-cyan-700"
                      />
                      <span>Manager Approval Before Effectiveness Verification</span>
                    </label>

                    <button
                      type="button"
                      onClick={() => setActiveTab('effectiveness')}
                      className="text-cyan-800 hover:underline font-medium self-start sm:self-auto"
                    >
                      Evaluate Effectiveness ({selectedCapa.effectiveness.decision}) →
                    </button>
                  </div>
                </div>

                {/* Section 4: Gemini AI-Based CAPA Recommendations */}
                <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        Gemini AI-Based CAPA Recommendations
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Analyzes complaint, machine, process, historical matches, root cause verification status, and predictive risk factors. Manager approval required before execution.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleGenerateAiRecommendations}
                      disabled={aiLoading}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-md whitespace-nowrap self-start"
                    >
                      {aiLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" aria-hidden="true" />
                      ) : aiResponse ? (
                        <RefreshCw className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                      )}
                      <span>
                        {aiLoading
                          ? 'Analyzing with Gemini...'
                          : aiResponse
                            ? 'Regenerate AI Plan'
                            : 'Generate AI CAPA Plan'}
                      </span>
                    </button>
                  </div>

                  {aiError && (
                    <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-start gap-2 text-xs text-red-800">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                      <div>
                        <p className="font-semibold">AI Recommendation Request Failed</p>
                        <p className="mt-0.5">{aiError}</p>
                      </div>
                    </div>
                  )}

                  {aiResponse && (
                    <div className="space-y-4">
                      {aiResponse.isProvisional && (
                        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 flex items-start gap-2 text-xs text-amber-900">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" aria-hidden="true" />
                          <div>
                            <p className="font-semibold">
                              PROVISIONAL CAPA RECOMMENDATIONS (Unverified Root Cause)
                            </p>
                            <p className="mt-0.5">{aiResponse.provisionalNotice}</p>
                          </div>
                        </div>
                      )}

                      {aiResponse.implementationNotes && (
                        <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded p-3">
                          <strong>AI Sequencing Guidance:</strong> {aiResponse.implementationNotes}
                        </p>
                      )}

                      {aiItemsFlattened.length === 0 ? (
                        <p className="text-xs text-slate-500 py-2">
                          All generated AI recommendations for this run have been reviewed. Click &ldquo;Regenerate AI Plan&rdquo; for a fresh analysis.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {aiItemsFlattened.map(({ key, item }) => {
                            const isEditingThis = editingAiKey === key;
                            return (
                              <div
                                key={key}
                                className="border border-slate-200 rounded-md p-4 space-y-2.5 text-xs bg-slate-50/40"
                              >
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                                  <div>
                                    <span className="font-semibold text-cyan-800">
                                      {item.actionType}
                                    </span>
                                    <span className="text-slate-400 mx-1.5">·</span>
                                    <span className="text-slate-600">{item.actionSubtype}</span>
                                    <span className="text-slate-400 mx-1.5">·</span>
                                    <span className="text-slate-600">
                                      {item.responsibleDepartment}
                                    </span>
                                    {aiResponse.isProvisional && (
                                      <span className="ml-2 font-mono text-[10px] text-amber-800 font-semibold">
                                        [PROVISIONAL]
                                      </span>
                                    )}
                                    {!isEditingThis && (
                                      <h4 className="font-semibold text-slate-900 text-sm mt-1">
                                        {item.title}
                                      </h4>
                                    )}
                                  </div>

                                  {!isEditingThis && (
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => acceptAiRecommendation(item, key)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-700 text-white rounded hover:bg-emerald-800 font-medium"
                                      >
                                        <Check className="w-3 h-3" aria-hidden="true" />
                                        <span>Accept</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingAiKey(key);
                                          setAiDraftTitle(item.title);
                                          setAiDraftDesc(item.description);
                                          setAiDraftOwner(item.suggestedOwnerRole);
                                        }}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 text-slate-700 rounded hover:bg-slate-50"
                                      >
                                        <Edit3 className="w-3 h-3" aria-hidden="true" />
                                        <span>Edit</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setDismissedAiKeys((prev) => ({
                                            ...prev,
                                            [key]: true,
                                          }))
                                        }
                                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-red-200 text-red-700 rounded hover:bg-red-50"
                                      >
                                        <X className="w-3 h-3" aria-hidden="true" />
                                        <span>Reject</span>
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {isEditingThis ? (
                                  <div className="space-y-2 bg-white border border-slate-200 rounded p-3">
                                    <input
                                      type="text"
                                      value={aiDraftTitle}
                                      onChange={(e) => setAiDraftTitle(e.target.value)}
                                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-medium"
                                    />
                                    <textarea
                                      rows={2}
                                      value={aiDraftDesc}
                                      onChange={(e) => setAiDraftDesc(e.target.value)}
                                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                                    />
                                    <div className="flex items-center justify-between gap-2">
                                      <input
                                        type="text"
                                        value={aiDraftOwner}
                                        onChange={(e) => setAiDraftOwner(e.target.value)}
                                        placeholder="Responsible owner"
                                        className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => setEditingAiKey(null)}
                                        className="px-3 py-1.5 border border-slate-300 rounded text-slate-700"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          acceptAiRecommendation(item, key, {
                                            title: aiDraftTitle,
                                            description: aiDraftDesc,
                                            owner: aiDraftOwner,
                                          })
                                        }
                                        className="px-3 py-1.5 bg-cyan-700 text-white rounded hover:bg-cyan-800"
                                      >
                                        Save &amp; Accept
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <p className="text-slate-700 leading-relaxed">
                                      {item.description}
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px] text-slate-600">
                                      <p>
                                        <strong>Resources:</strong> {item.requiredResources}
                                      </p>
                                      <p>
                                        <strong>Verification Method:</strong>{' '}
                                        {item.suggestedVerificationMethod}
                                      </p>
                                      <p>
                                        <strong>Expected Improvement:</strong>{' '}
                                        {item.expectedImprovement}
                                      </p>
                                      <p>
                                        <strong>Supporting Evidence:</strong>{' '}
                                        {item.supportingEvidence}
                                      </p>
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Section 3: Three Action Sections (A. Containment, B. Corrective, C. Preventive) */}
                {(
                  [
                    {
                      section: 'Containment' as CAPAActionSectionType,
                      heading: 'A. Correction / Containment Actions',
                      subtitle: 'Immediate lot quarantine, sorting, and customer protection actions',
                      tasks: selectedCapa.containmentActions,
                    },
                    {
                      section: 'Corrective' as CAPAActionSectionType,
                      heading: 'B. Corrective Actions',
                      subtitle: 'Root cause elimination steps targeting process, tooling, or material failure',
                      tasks: selectedCapa.correctiveActions,
                    },
                    {
                      section: 'Preventive' as CAPAActionSectionType,
                      heading: 'C. Preventive Actions',
                      subtitle: 'Systemic controls, SPC gates, training, and maintenance to prevent recurrence',
                      tasks: selectedCapa.preventiveActions,
                    },
                  ] as const
                ).map((group) => (
                  <section
                    key={group.section}
                    className="bg-white border border-slate-200 rounded-lg p-5 space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">
                          {group.heading} ({group.tasks.length})
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">{group.subtitle}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAddingSection(group.section);
                          setTaskSubtype(SUBTYPES_BY_SECTION[group.section][0]);
                          setTaskOwner(selectedCapa.owner);
                          setTaskDept(selectedCapa.responsibleDepartment);
                          setTaskFormError(null);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded hover:bg-slate-50 self-start"
                      >
                        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Add {group.section} Action</span>
                      </button>
                    </div>

                    {addingSection === group.section && (
                      <form
                        onSubmit={handleAddCustomTask}
                        className="bg-slate-50 border border-slate-200 rounded-md p-4 space-y-3 text-xs"
                      >
                        {taskFormError && (
                          <p className="text-red-700 font-medium">{taskFormError}</p>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block font-medium text-slate-700 mb-1">
                              Action Subtype
                            </label>
                            <select
                              value={taskSubtype}
                              onChange={(e) => setTaskSubtype(e.target.value)}
                              className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                            >
                              {SUBTYPES_BY_SECTION[group.section].map((sub) => (
                                <option key={sub} value={sub}>
                                  {sub}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block font-medium text-slate-700 mb-1">
                              Department
                            </label>
                            <select
                              value={taskDept}
                              onChange={(e) => setTaskDept(e.target.value)}
                              className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                            >
                              {CAPA_DEPARTMENTS.map((d) => (
                                <option key={d} value={d}>
                                  {d}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block font-medium text-slate-700 mb-1">
                              Action Title *
                            </label>
                            <input
                              type="text"
                              value={taskTitle}
                              onChange={(e) => setTaskTitle(e.target.value)}
                              placeholder={`Specific ${group.section.toLowerCase()} engineering step...`}
                              className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block font-medium text-slate-700 mb-1">
                              Detailed Scope *
                            </label>
                            <textarea
                              rows={2}
                              value={taskDesc}
                              onChange={(e) => setTaskDesc(e.target.value)}
                              className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                            />
                          </div>
                          <div>
                            <label className="block font-medium text-slate-700 mb-1">
                              Responsible Person *
                            </label>
                            <input
                              type="text"
                              value={taskOwner}
                              onChange={(e) => setTaskOwner(e.target.value)}
                              className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                            />
                          </div>
                          <div>
                            <label className="block font-medium text-slate-700 mb-1">
                              Target Date *
                            </label>
                            <input
                              type="date"
                              value={taskTargetDate}
                              onChange={(e) => setTaskTargetDate(e.target.value)}
                              className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white tabular-nums"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setAddingSection(null)}
                            className="px-3 py-1.5 bg-white border border-slate-300 rounded text-slate-700"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="px-3 py-1.5 bg-cyan-700 text-white rounded hover:bg-cyan-800"
                          >
                            Save Action
                          </button>
                        </div>
                      </form>
                    )}

                    {group.tasks.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        No {group.section.toLowerCase()} actions added yet. Add a custom action or accept one from Gemini AI above.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {group.tasks.map((task) => (
                          <div
                            key={task.id}
                            className="border border-slate-200 rounded-md p-4 space-y-3 text-xs"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                              <div>
                                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                  <span className="font-semibold text-slate-800">
                                    {task.actionSubtype}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span>{task.origin}</span>
                                  {task.isProvisional && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className="text-amber-700 font-semibold">
                                        Provisional (Unverified RC)
                                      </span>
                                    </>
                                  )}
                                </div>
                                <h4 className="font-semibold text-slate-900 text-sm mt-0.5">
                                  {task.title}
                                </h4>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  deleteTaskInCapa(selectedCapa, group.section, task.id)
                                }
                                className="text-slate-400 hover:text-red-700 self-start"
                                aria-label={`Remove ${task.title}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <p className="text-slate-700 leading-relaxed">{task.description}</p>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100">
                              <div>
                                <label className="block text-[11px] text-slate-500 mb-1">
                                  Owner
                                </label>
                                <input
                                  type="text"
                                  value={task.responsiblePerson}
                                  onChange={(e) =>
                                    updateTaskInCapa(selectedCapa, group.section, task.id, {
                                      responsiblePerson: e.target.value,
                                    })
                                  }
                                  className="w-full px-2 py-1 border border-slate-300 rounded text-slate-900"
                                />
                              </div>

                              <div>
                                <label className="block text-[11px] text-slate-500 mb-1">
                                  Target Date
                                </label>
                                <input
                                  type="date"
                                  value={task.targetDate}
                                  onChange={(e) =>
                                    updateTaskInCapa(selectedCapa, group.section, task.id, {
                                      targetDate: e.target.value,
                                    })
                                  }
                                  className="w-full px-2 py-1 border border-slate-300 rounded tabular-nums text-slate-900"
                                />
                              </div>

                              <div>
                                <label className="block text-[11px] text-slate-500 mb-1">
                                  Task Status
                                </label>
                                <select
                                  value={task.status}
                                  onChange={(e) =>
                                    updateTaskInCapa(selectedCapa, group.section, task.id, {
                                      status: e.target.value as CAPACompletionStatus,
                                    })
                                  }
                                  className="w-full px-2 py-1 border border-slate-300 rounded bg-white text-slate-900"
                                >
                                  {TASK_STATUSES.map((st) => (
                                    <option key={st} value={st}>
                                      {st}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-[11px] text-slate-500 mb-1">
                                  Progress ({task.progressPercent}%)
                                </label>
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
                                  step={10}
                                  value={task.progressPercent}
                                  onChange={(e) =>
                                    updateTaskInCapa(selectedCapa, group.section, task.id, {
                                      progressPercent: Number(e.target.value),
                                    })
                                  }
                                  className="w-full accent-cyan-700 mt-1"
                                />
                              </div>

                              <div className="sm:col-span-2 md:col-span-4">
                                <label className="block text-[11px] text-slate-500 mb-1">
                                  Implementation Evidence &amp; Verification Notes
                                </label>
                                <input
                                  type="text"
                                  value={task.implementationEvidence}
                                  onChange={(e) =>
                                    updateTaskInCapa(selectedCapa, group.section, task.id, {
                                      implementationEvidence: e.target.value,
                                    })
                                  }
                                  placeholder="Record lot sort qty, calibration certificate ID, trial Cpk, or SOP revision..."
                                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-slate-900"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                ))}

                {/* Evidence Attachments & Audit History */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3 text-xs">
                    <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                      <Paperclip className="w-4 h-4 text-cyan-700" aria-hidden="true" />
                      <span>Implementation Evidence Attachments ({selectedCapa.attachments.length})</span>
                    </h3>
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={attachmentNote}
                        onChange={(e) => setAttachmentNote(e.target.value)}
                        placeholder="Attachment note (e.g., CMM run report, SOP rev 3)..."
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                      />
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded cursor-pointer hover:bg-slate-800">
                        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Attach Evidence File Metadata</span>
                        <input
                          type="file"
                          onChange={handleAttachEvidenceFile}
                          className="sr-only"
                        />
                      </label>
                      <p className="text-[11px] text-slate-500">
                        Stores file metadata &amp; verification notes locally in browser storage.
                      </p>
                    </div>
                    {selectedCapa.attachments.length > 0 && (
                      <ul className="divide-y divide-slate-100 border-t border-slate-100 pt-2">
                        {selectedCapa.attachments.map((att) => (
                          <li key={att.id} className="py-2 flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium text-slate-900">{att.fileName}</p>
                              <p className="text-[11px] text-slate-500">
                                {att.notes} · {att.fileSizeKb} KB
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateCapa(selectedCapa.id, {
                                  attachments: selectedCapa.attachments.filter(
                                    (a) => a.id !== att.id
                                  ),
                                })
                              }
                              className="text-slate-400 hover:text-red-700"
                              aria-label={`Remove ${att.fileName}`}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3 text-xs">
                    <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                      <History className="w-4 h-4 text-cyan-700" aria-hidden="true" />
                      <span>CAPA Status History ({selectedCapa.history.length})</span>
                    </h3>
                    <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                      {selectedCapa.history.map((h) => (
                        <div key={h.id} className="py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-slate-900">{h.action}</span>
                            <span className="font-mono text-[11px] text-slate-500">
                              {new Date(h.timestamp).toLocaleDateString()}
                            </span>
                          </div>
                          {h.notes && <p className="text-slate-600 mt-0.5">{h.notes}</p>}
                          <p className="text-[11px] text-slate-400 mt-0.5">Actor: {h.actor}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: SECTION 6 — CAPA IMPLEMENTATION TRACKING TABLE */}
      {activeTab === 'tracking' && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="pb-3 border-b border-slate-200">
            <h2 className="text-base font-semibold text-slate-900">
              CAPA Implementation Tracking Register ({allTrackingRows.length} Tasks)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Track containment, corrective, and preventive tasks across owners, departments, target vs completion dates, implementation evidence, and manager pre-verification approval.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3 font-medium">CAPA / Complaint</th>
                  <th className="py-2 pr-3 font-medium">Tier &amp; Action</th>
                  <th className="py-2 pr-3 font-medium">Owner &amp; Dept</th>
                  <th className="py-2 pr-3 font-medium">Start / Target / Done</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium text-right">Progress</th>
                  <th className="py-2 pr-3 font-medium">Implementation Evidence</th>
                  <th className="py-2 font-medium text-center">Mgr Approved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allTrackingRows.map(({ capa, effectiveCapaStatus, task }) => (
                  <tr key={task.id} className="hover:bg-slate-50">
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCapaId(capa.id);
                          setActiveTab('register');
                        }}
                        className="font-mono font-semibold text-cyan-800 hover:underline block"
                      >
                        {capa.id}
                      </button>
                      <span className="font-mono text-[11px] text-slate-500">
                        {capa.complaintId} · {effectiveCapaStatus}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 max-w-[240px]">
                      <p className="font-semibold text-slate-900">
                        [{task.actionType}] {task.title}
                      </p>
                      <p className="text-[11px] text-slate-500 line-clamp-2">
                        {task.description}
                      </p>
                    </td>
                    <td className="py-2.5 pr-3">
                      <p className="text-slate-900 font-medium">{task.responsiblePerson}</p>
                      <p className="text-[11px] text-slate-500">{task.responsibleDepartment}</p>
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-[11px] tabular-nums text-slate-600 whitespace-nowrap">
                      <p>Start: {task.startDate}</p>
                      <p>Due: {task.targetDate}</p>
                      <p>Done: {task.completionDate || '—'}</p>
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      <select
                        value={task.status}
                        onChange={(e) =>
                          updateTaskInCapa(capa, task.actionType, task.id, {
                            status: e.target.value as CAPACompletionStatus,
                          })
                        }
                        className="px-2 py-1 border border-slate-300 rounded bg-white text-xs"
                      >
                        {TASK_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums font-semibold">
                      {task.progressPercent}%
                    </td>
                    <td className="py-2.5 pr-3 max-w-[200px] text-slate-700">
                      {task.implementationEvidence || (
                        <span className="text-slate-400">Pending evidence</span>
                      )}
                    </td>
                    <td className="py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={Boolean(task.managerApprovedCompletion)}
                        onChange={(e) =>
                          updateTaskInCapa(capa, task.actionType, task.id, {
                            managerApprovedCompletion: e.target.checked,
                          })
                        }
                        aria-label={`Approve completion for ${task.title}`}
                        className="rounded border-slate-300 text-cyan-700"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: SECTION 7 — EFFECTIVENESS VERIFICATION */}
      {activeTab === 'effectiveness' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-[760px] overflow-y-auto">
            <div className="p-4 bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-900">
                Select CAPA for Verification
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Verification updates Predictive Risk Scores &amp; Alert Center automatically.
              </p>
            </div>
            {capaRecords.map((cp) => {
              const active = selectedCapa?.id === cp.id;
              return (
                <button
                  key={cp.id}
                  type="button"
                  onClick={() => setSelectedCapaId(cp.id)}
                  className={`w-full text-left p-3.5 transition-colors ${
                    active ? 'bg-cyan-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-cyan-800">
                      {cp.id}
                    </span>
                    <span
                      className={`text-[11px] font-semibold ${
                        cp.effectiveness.decision === 'Effective'
                          ? 'text-emerald-700'
                          : cp.effectiveness.decision === 'Ineffective'
                            ? 'text-red-700'
                            : 'text-amber-700'
                      }`}
                    >
                      {cp.effectiveness.decision}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-slate-900 mt-1 truncate">
                    {cp.productName}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Before: {cp.effectiveness.complaintsBefore} · After:{' '}
                    {cp.effectiveness.complaintsAfter ?? 'Pending'}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-8">
            {selectedCapa && (
              <form
                onSubmit={handleSaveEffectiveness}
                className="bg-white border border-slate-200 rounded-lg p-6 space-y-5 text-xs"
              >
                <div className="pb-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <p className="font-mono text-cyan-800 font-semibold">
                      {selectedCapa.id} · {selectedCapa.complaintId}
                    </p>
                    <h2 className="text-base font-semibold text-slate-900 mt-0.5">
                      Effectiveness Verification — {selectedCapa.productName}
                    </h2>
                  </div>
                  <span className="font-mono text-slate-600">
                    Subsequent live complaints on record: {subsequentMatchingComplaintsCount}
                  </span>
                </div>

                {!selectedCapa.managerCompletionApproved && (
                  <div className="bg-amber-50 border border-amber-200 rounded-md p-3 flex items-start justify-between gap-3 text-amber-900">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" aria-hidden="true" />
                      <div>
                        <p className="font-semibold">
                          Manager Completion Approval Pending
                        </p>
                        <p className="mt-0.5">
                          Approve CAPA implementation completion before declaring effectiveness as &ldquo;Effective&rdquo;.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateCapa(
                          selectedCapa.id,
                          { managerCompletionApproved: true },
                          {
                            action: 'Manager Approved Implementation Completion',
                            actor: 'R. Deshmukh',
                          }
                        )
                      }
                      className="px-3 py-1.5 bg-amber-800 text-white rounded hover:bg-amber-900 shrink-0"
                    >
                      Approve Now
                    </button>
                  </div>
                )}

                {liveEffPreview.insufficientDataNotice && (
                  <div className="bg-slate-50 border border-slate-300 rounded-md p-3 text-slate-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <p className="font-semibold">{liveEffPreview.insufficientDataNotice}</p>
                    </div>
                  </div>
                )}

                {liveEffPreview.isProvisionalComparison && !liveEffPreview.insufficientDataNotice && (
                  <div className="bg-cyan-50 border border-cyan-200 rounded-md p-3 text-cyan-900">
                    <strong>Provisional Comparison (Counts Only):</strong> Production volume before/after is not entered, so comparison relies on raw complaint counts rather than defect rate per 1,000 units.
                  </div>
                )}

                {effError && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-3 text-red-800 font-medium">
                    {effError}
                  </div>
                )}

                {effSavedNotice && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 text-emerald-900 flex items-center gap-2 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
                    <span>{effSavedNotice}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Baseline Observation Period *
                    </label>
                    <input
                      type="text"
                      value={effBaselinePeriod}
                      onChange={(e) => setEffBaselinePeriod(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Post-Implementation Period *
                    </label>
                    <input
                      type="text"
                      value={effPostPeriod}
                      onChange={(e) => setEffPostPeriod(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Complaints Before CAPA *
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={effBeforeCount}
                      onChange={(e) => setEffBeforeCount(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Complaints After CAPA
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={effAfterCount}
                      onChange={(e) => setEffAfterCount(e.target.value)}
                      placeholder="Leave blank if monitoring ongoing"
                      className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Production Volume Before (Optional Units)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={effVolBefore}
                      onChange={(e) => setEffVolBefore(e.target.value)}
                      placeholder="e.g., 2500"
                      className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Production Volume After (Optional Units, &ge; 50 recommended)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={effVolAfter}
                      onChange={(e) => setEffVolAfter(e.target.value)}
                      placeholder="e.g., 2800"
                      className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono"
                    />
                  </div>
                </div>

                {(liveEffPreview.defectRateBefore !== null ||
                  liveEffPreview.defectRateAfter !== null) && (
                  <div className="bg-slate-50 border border-slate-200 rounded-md p-3 flex flex-wrap items-center gap-6 font-mono">
                    <div>
                      <span className="text-slate-500 block font-sans">Defect Rate Before</span>
                      <span className="font-bold text-slate-900">
                        {liveEffPreview.defectRateBefore ?? '—'} per 1,000 units
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block font-sans">Defect Rate After</span>
                      <span className="font-bold text-cyan-800">
                        {liveEffPreview.defectRateAfter ?? '—'} per 1,000 units
                      </span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Repeat Defect Occurrence
                    </label>
                    <select
                      value={effRepeatOccurred}
                      onChange={(e) =>
                        setEffRepeatOccurred(e.target.value as 'Pending' | 'Yes' | 'No')
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white"
                    >
                      <option value="Pending">Pending Monitoring</option>
                      <option value="No">No Repeat Defects</option>
                      <option value="Yes">Yes — Defect Recurred</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Manager Decision *
                    </label>
                    <select
                      value={effDecision}
                      onChange={(e) =>
                        setEffDecision(e.target.value as CAPAEffectivenessDecision)
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white font-semibold"
                    >
                      <option value="Pending">Pending</option>
                      <option value="Effective">Effective</option>
                      <option value="Ineffective">Ineffective</option>
                      <option value="Inconclusive">Inconclusive</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Reviewer Name *
                    </label>
                    <input
                      type="text"
                      value={effReviewer}
                      onChange={(e) => setEffReviewer(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Verification Method
                  </label>
                  <input
                    type="text"
                    value={effMethod}
                    onChange={(e) => setEffMethod(e.target.value)}
                    placeholder="e.g., 3-lot CMM audit (Cpk >= 1.67) + 90-day field complaint watch"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Verification Evidence
                  </label>
                  <input
                    type="text"
                    value={effEvidence}
                    onChange={(e) => setEffEvidence(e.target.value)}
                    placeholder="e.g., Audit Log AUD-2026-041 passed 0/2800 defects..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Manager Review Comments
                  </label>
                  <textarea
                    rows={2}
                    value={effComments}
                    onChange={(e) => setEffComments(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  />
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-medium text-white bg-cyan-700 rounded-md hover:bg-cyan-800"
                  >
                    Save Effectiveness Verification
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: SECTION 9 — CAPA ANALYTICS */}
      {activeTab === 'analytics' && (
        <CapaAnalyticsPanel capas={capaRecords} complaints={complaints} />
      )}

      {/* TAB 5: SECTION 10 — CAPA REPORTS */}
      {activeTab === 'reports' && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5 text-xs">
          <div className="pb-4 border-b border-slate-200">
            <h2 className="text-base font-semibold text-slate-900">
              CAPA Audit Reports &amp; CSV Export
            </h2>
            <p className="text-slate-500 mt-0.5">
              Generate printable PDF-ready reports or CSV exports for individual CAPAs (including all three action tiers, status history, and effectiveness decisions) or the complete CAPA summary register.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="border border-slate-200 rounded-lg p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Individual CAPA Audit Report
              </h3>
              <p className="text-slate-600">
                Currently selected:{' '}
                <span className="font-mono font-semibold text-cyan-800">
                  {selectedCapa ? `${selectedCapa.id} (${selectedCapa.productName})` : 'None'}
                </span>
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  disabled={!selectedCapa}
                  onClick={() => {
                    setReportMode('single');
                    setReportModalOpen(true);
                  }}
                  className="px-3.5 py-2 bg-[#0B1426] text-white rounded hover:bg-slate-800 disabled:opacity-50"
                >
                  Open Printable Report
                </button>
                <button
                  type="button"
                  disabled={!selectedCapa}
                  onClick={() => selectedCapa && exportSingleCapaCsv(selectedCapa)}
                  className="px-3.5 py-2 bg-white border border-slate-300 text-slate-800 rounded hover:bg-slate-50 disabled:opacity-50"
                >
                  Download Individual CSV
                </button>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">
                CAPA Register Summary Report
              </h3>
              <p className="text-slate-600">
                Includes all{' '}
                <span className="font-mono font-semibold text-slate-900">
                  {capaRecords.length}
                </span>{' '}
                CAPA records, statuses, progress, baseline/post counts, and effectiveness decisions.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setReportMode('summary');
                    setReportModalOpen(true);
                  }}
                  className="px-3.5 py-2 bg-cyan-700 text-white rounded hover:bg-cyan-800"
                >
                  Open Summary Report
                </button>
                <button
                  type="button"
                  onClick={() => exportCapaSummaryCsv(capaRecords)}
                  className="px-3.5 py-2 bg-white border border-slate-300 text-slate-800 rounded hover:bg-slate-50"
                >
                  Download Summary CSV
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Registration / Edit Modal */}
      <CapaRegistrationModal
        isOpen={regModalOpen}
        suggestedId={suggestedCapaId}
        complaints={complaints}
        preselectedComplaintId={regPreselectedComplaintId}
        editingCapa={editingCapa}
        onClose={() => {
          setRegModalOpen(false);
          setEditingCapa(null);
        }}
        onSave={(payload, editingId) => {
          if (editingId) {
            onUpdateCapa(editingId, payload, {
              action: 'CAPA Details Edited',
              actor: 'R. Deshmukh',
              notes: `Updated priority (${payload.priority}), owner (${payload.owner}), department (${payload.responsibleDepartment}), due ${payload.targetCompletionDate}.`,
            });
          } else {
            const created = onAddCapa(payload);
            setSelectedCapaId(created.id);
            setActiveTab('register');
          }
        }}
      />

      {/* Printable / CSV Report Modal */}
      <CapaReportModal
        isOpen={reportModalOpen}
        mode={reportMode}
        capa={selectedCapa}
        allCapas={capaRecords}
        onChangeMode={setReportMode}
        onClose={() => setReportModalOpen(false)}
      />
    </div>
  );
}
