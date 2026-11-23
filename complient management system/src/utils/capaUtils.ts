import type {
  CAPAActionItem,
  CAPAEffectivenessVerification,
  CAPAPlanTask,
  CAPARecord,
  CAPAWorkflowStatus,
  ComplaintRecord,
} from '../types/qms';
import { downloadCsvFile } from './csvUtils';
import { deriveEffectivenessStatus } from './qmsAnalytics';

export const CAPA_DEPARTMENTS = [
  'Quality Assurance',
  'CNC & Precision Machining',
  'Heat Treatment & Metallurgy',
  'Assembly & Testing',
  'Supplier Quality Engineering',
  'Packaging & Logistics',
  'Maintenance & Calibration',
] as const;

export function generateNextCapaId(capas: CAPARecord[]): string {
  const year = new Date().getFullYear();
  const prefix = `CAPA-${year}-`;
  let maxSeq = 0;
  for (const c of capas) {
    const m = c.id.match(/CAPA-\d{4}-(\d+)/i);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
    }
  }
  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

/**
 * Automatically identifies overdue CAPAs when targetCompletionDate < today
 * and workflow has not reached Effective / Ineffective / Closed.
 */
export function resolveEffectiveCapaStatus(
  capa: CAPARecord,
  todayIso: string = new Date().toISOString().slice(0, 10)
): CAPAWorkflowStatus {
  if (
    capa.status === 'Closed' ||
    capa.status === 'Effective' ||
    capa.status === 'Ineffective'
  ) {
    return capa.status;
  }
  if (
    capa.targetCompletionDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(capa.targetCompletionDate) &&
    capa.targetCompletionDate < todayIso
  ) {
    return 'Overdue';
  }
  return capa.status === 'Overdue' ? 'In Progress' : capa.status;
}

export function computeCapaProgress(capa: CAPARecord): number {
  const activeTasks = [
    ...capa.containmentActions,
    ...capa.correctiveActions,
    ...capa.preventiveActions,
  ].filter((t) => t.approvalStatus !== 'Rejected');

  if (activeTasks.length === 0) return capa.progressPercent;
  const sum = activeTasks.reduce((acc, t) => acc + (t.progressPercent || 0), 0);
  return Math.round(sum / activeTasks.length);
}

export function evaluateEffectivenessMetrics(params: {
  complaintsBefore: number;
  complaintsAfter: number | null;
  productionVolumeBefore: number | null;
  productionVolumeAfter: number | null;
  baselinePeriod: string;
  postPeriod: string;
}): {
  defectRateBefore: number | null;
  defectRateAfter: number | null;
  isProvisionalComparison: boolean;
  observationSampleSizeOk: boolean;
  insufficientDataNotice: string | undefined;
} {
  const {
    complaintsBefore,
    complaintsAfter,
    productionVolumeBefore,
    productionVolumeAfter,
    baselinePeriod,
    postPeriod,
  } = params;

  const hasVolumes =
    productionVolumeBefore !== null &&
    productionVolumeBefore > 0 &&
    productionVolumeAfter !== null &&
    productionVolumeAfter > 0;

  const defectRateBefore =
    productionVolumeBefore !== null && productionVolumeBefore > 0
      ? Number(((complaintsBefore / productionVolumeBefore) * 1000).toFixed(2))
      : null;

  const defectRateAfter =
    complaintsAfter !== null && productionVolumeAfter !== null && productionVolumeAfter > 0
      ? Number(((complaintsAfter / productionVolumeAfter) * 1000).toFixed(2))
      : null;

  const smallSample =
    productionVolumeAfter !== null && productionVolumeAfter > 0 && productionVolumeAfter < 50;
  const missingCounts = complaintsAfter === null || !postPeriod.trim() || !baselinePeriod.trim();

  let insufficientDataNotice: string | undefined;
  if (missingCounts) {
    insufficientDataNotice =
      'Insufficient Data for Verification: Post-implementation complaint count and observation windows are required.';
  } else if (smallSample) {
    insufficientDataNotice = `Insufficient Data for Verification: Post-CAPA inspection/production exposure (${productionVolumeAfter} units) is too small (< 50 units) to declare sustained effectiveness.`;
  }

  return {
    defectRateBefore,
    defectRateAfter,
    isProvisionalComparison: !hasVolumes,
    observationSampleSizeOk: !missingCounts && !smallSample,
    insufficientDataNotice,
  };
}

/**
 * Hydrates full Stage-7 CAPARecord objects from existing DEMO_COMPLAINTS
 * that carry legacy `capaActions` so all initial demo records are preserved
 * and visibly marked DEMO DATA.
 */
export function hydrateDemoCapaRecords(complaints: ComplaintRecord[]): CAPARecord[] {
  const todayIso = new Date().toISOString().slice(0, 10);
  const records: CAPARecord[] = [];
  let seq = 1;

  for (const c of complaints) {
    if (!c.capaActions || c.capaActions.length === 0) continue;

    const first = c.capaActions[0];
    const verifiedHyp = c.rootCauseAnalysis?.hypotheses.find(
      (h) => h.managerStatus === 'Verified'
    );
    const rootCause =
      c.rootCauseAnalysis?.manualVerifiedRootCause?.trim() ||
      verifiedHyp?.title ||
      c.rootCauseAnalysis?.hypotheses[0]?.title ||
      'Pending formal root cause verification';
    const rcStatus: CAPARecord['rootCauseVerificationStatus'] =
      c.rootCauseAnalysis?.manualVerifiedRootCause?.trim() || verifiedHyp
        ? 'Verified'
        : c.rootCauseAnalysis?.hypotheses.length
          ? 'Unverified Hypothesis'
          : 'Pending Investigation';

    const evidence =
      c.rootCauseAnalysis?.verifiedEvidence?.trim() ||
      verifiedHyp?.managerNotes?.trim() ||
      c.testResults ||
      'Refer to inspection logs.';

    const containmentActions: CAPAPlanTask[] = [];
    const correctiveActions: CAPAPlanTask[] = [];
    const preventiveActions: CAPAPlanTask[] = [];

    c.capaActions.forEach((a, idx) => {
      const isContainment = /containment|inspection of affected|quarantine|sort|screening/i.test(
        `${a.actionSubtype} ${a.title}`
      );
      const sectionType: CAPAPlanTask['actionType'] = isContainment
        ? 'Containment'
        : a.kind === 'Preventive'
          ? 'Preventive'
          : 'Corrective';

      const task: CAPAPlanTask = {
        id: a.id || `TASK-${c.id}-${idx + 1}`,
        actionType: sectionType,
        actionSubtype: a.actionSubtype,
        title: a.title,
        description: a.description,
        origin: a.origin,
        approvalStatus: a.approvalStatus,
        isProvisional: rcStatus !== 'Verified',
        responsiblePerson: a.responsiblePerson,
        responsibleDepartment:
          /heat|quench|forging/i.test(c.processName)
            ? 'Heat Treatment & Metallurgy'
            : /packag/i.test(c.processName)
              ? 'Packaging & Logistics'
              : /assembl/i.test(c.processName)
                ? 'Assembly & Testing'
                : 'CNC & Precision Machining',
        startDate: c.complaintDate,
        targetDate: a.targetDate,
        completionDate: a.completionStatus === 'Completed' ? a.verifiedDate || a.targetDate : undefined,
        progressPercent:
          a.completionStatus === 'Completed'
            ? 100
            : a.completionStatus === 'In Progress'
              ? 60
              : 15,
        status: a.completionStatus,
        managerApprovedCompletion: a.completionStatus === 'Completed',
        implementationEvidence: a.verificationResult || '',
        managerComments: '',
      };

      if (sectionType === 'Containment') containmentActions.push(task);
      else if (sectionType === 'Preventive') preventiveActions.push(task);
      else correctiveActions.push(task);
    });

    const effStatus = deriveEffectivenessStatus(first);
    const effDecision: CAPAEffectivenessVerification['decision'] =
      effStatus === 'Verified Effective'
        ? 'Effective'
        : effStatus === 'Ineffective'
          ? 'Ineffective'
          : effStatus === 'Partially Effective'
            ? 'Inconclusive'
            : 'Pending';

    let wfStatus: CAPAWorkflowStatus = 'Assigned';
    if (effDecision === 'Effective') wfStatus = 'Effective';
    else if (effDecision === 'Ineffective') wfStatus = 'Ineffective';
    else if (first.completionStatus === 'Completed') wfStatus = 'Pending Verification';
    else if (first.completionStatus === 'In Progress') wfStatus = 'In Progress';
    else if (first.completionStatus === 'Overdue') wfStatus = 'Overdue';

    const targetDate = first.targetDate || todayIso;
    if (
      wfStatus !== 'Effective' &&
      wfStatus !== 'Ineffective' &&
      targetDate < todayIso
    ) {
      wfStatus = 'Overdue';
    }

    const capaYear = c.complaintDate.slice(0, 4) || '2026';
    const id = `CAPA-${capaYear}-${String(seq++).padStart(4, '0')}`;

    const effEval = evaluateEffectivenessMetrics({
      complaintsBefore: first.effectivenessTracking.complaintsBefore,
      complaintsAfter: first.effectivenessTracking.complaintsAfter,
      productionVolumeBefore: null,
      productionVolumeAfter: null,
      baselinePeriod: '90 days pre-CAPA',
      postPeriod: `${first.effectivenessTracking.monitoringWindowDays} days post-CAPA`,
    });

    const dept =
      containmentActions[0]?.responsibleDepartment ||
      correctiveActions[0]?.responsibleDepartment ||
      preventiveActions[0]?.responsibleDepartment ||
      'Quality Assurance';

    const rec: CAPARecord = {
      id,
      complaintId: c.id,
      customerName: c.customerName,
      productId: c.productId,
      productName: c.productName,
      batchNumber: c.batchNumber,
      defectCategory: c.category,
      manufacturingProcess: c.processName,
      machineId: c.machineId || 'Unspecified',
      rootCause,
      rootCauseVerificationStatus: rcStatus,
      evidence,
      priority: c.priority || (c.severity === 'Critical' ? 'Urgent' : 'High'),
      owner: first.responsiblePerson || 'R. Deshmukh',
      responsibleDepartment: dept,
      createdDate: c.complaintDate,
      startDate: c.complaintDate,
      targetCompletionDate: targetDate,
      actualCompletionDate: first.verifiedDate,
      status: wfStatus,
      progressPercent: computeCapaProgress({
        containmentActions,
        correctiveActions,
        preventiveActions,
        progressPercent: 0,
      } as CAPARecord),
      description: first.description || c.description,
      containmentActions,
      correctiveActions,
      preventiveActions,
      attachments: [],
      comments: first.effectivenessTracking.evaluationNotes || '',
      managerCompletionApproved: first.completionStatus === 'Completed',
      history: [
        {
          id: `CHIST-${id}-1`,
          timestamp: `${c.complaintDate}T10:00:00Z`,
          action: 'CAPA Created (DEMO DATA)',
          toStatus: 'Assigned',
          actor: c.assignedManager || 'R. Deshmukh',
          notes: `Linked to ${c.id} (${c.productName}).`,
        },
        ...(first.verifiedDate
          ? [
              {
                id: `CHIST-${id}-2`,
                timestamp: `${first.verifiedDate}T15:00:00Z`,
                action: 'Implementation Verified',
                toStatus: wfStatus,
                actor: first.effectivenessTracking.evaluatedBy || 'R. Deshmukh',
                notes: first.verificationResult,
              },
            ]
          : []),
      ],
      effectiveness: {
        baselinePeriod: '90 days pre-CAPA',
        postPeriod: `${first.effectivenessTracking.monitoringWindowDays} days post-CAPA`,
        observationSampleSizeOk: effEval.observationSampleSizeOk,
        complaintsBefore: first.effectivenessTracking.complaintsBefore,
        complaintsAfter: first.effectivenessTracking.complaintsAfter,
        productionVolumeBefore: null,
        productionVolumeAfter: null,
        defectRateBefore: effEval.defectRateBefore,
        defectRateAfter: effEval.defectRateAfter,
        repeatDefectOccurred:
          first.effectivenessTracking.complaintsAfter !== null
            ? first.effectivenessTracking.complaintsAfter > 0
            : null,
        verificationMethod: first.verificationResult || 'Post-CAPA complaint & lot inspection monitoring',
        verificationEvidence: first.effectivenessTracking.evaluationNotes || '',
        decision: effDecision,
        isProvisionalComparison: effEval.isProvisionalComparison,
        insufficientDataNotice: effEval.insufficientDataNotice,
        verifiedDate: first.effectivenessTracking.evaluatedAt,
        reviewer: first.effectivenessTracking.evaluatedBy,
        comments: first.effectivenessTracking.evaluationNotes || '',
      },
      isDemoData: Boolean(c.isDemoData),
    };

    records.push(rec);
  }

  return records;
}

/**
 * Keeps ComplaintRecord.capaActions synchronized with Stage-7 CAPARecords
 * so existing Dashboard, Effectiveness, Reports, and Predictive views stay live.
 */
export function syncCapasToComplaintActions(
  complaintId: string,
  allCapas: CAPARecord[]
): CAPAActionItem[] {
  const linked = allCapas.filter((cp) => cp.complaintId === complaintId);
  const actions: CAPAActionItem[] = [];

  for (const cp of linked) {
    const tasks = [
      ...cp.containmentActions,
      ...cp.correctiveActions,
      ...cp.preventiveActions,
    ];
    const effBool =
      cp.effectiveness.decision === 'Effective'
        ? true
        : cp.effectiveness.decision === 'Ineffective' || cp.effectiveness.decision === 'Inconclusive'
          ? false
          : null;

    if (tasks.length === 0) {
      actions.push({
        id: `${cp.id}-SUMMARY`,
        kind: 'Corrective',
        actionSubtype: 'Process Correction',
        title: cp.description || `CAPA ${cp.id}`,
        description: cp.description,
        origin: 'Manager Added',
        approvalStatus: 'Accepted',
        responsiblePerson: cp.owner,
        targetDate: cp.targetCompletionDate,
        completionStatus:
          cp.status === 'Closed' || cp.status === 'Effective' || cp.status === 'Pending Verification'
            ? 'Completed'
            : cp.status === 'Overdue'
              ? 'Overdue'
              : cp.status === 'In Progress'
                ? 'In Progress'
                : 'Not Started',
        verificationResult: cp.effectiveness.verificationEvidence || cp.comments,
        verifiedDate: cp.effectiveness.verifiedDate || cp.actualCompletionDate,
        effectivenessTracking: {
          complaintsBefore: cp.effectiveness.complaintsBefore,
          complaintsAfter: cp.effectiveness.complaintsAfter,
          monitoringWindowDays: 90,
          verifiedEffective: effBool,
          evaluationNotes:
            cp.effectiveness.comments || cp.effectiveness.verificationEvidence || '',
          evaluatedAt: cp.effectiveness.verifiedDate,
          evaluatedBy: cp.effectiveness.reviewer,
        },
      });
      continue;
    }

    tasks.forEach((t) => {
      actions.push({
        id: t.id,
        kind: t.actionType === 'Preventive' ? 'Preventive' : 'Corrective',
        actionSubtype: t.actionSubtype,
        title: t.title,
        description: t.description,
        origin: t.origin,
        approvalStatus: t.approvalStatus,
        responsiblePerson: t.responsiblePerson || cp.owner,
        targetDate: t.targetDate || cp.targetCompletionDate,
        completionStatus:
          cp.status === 'Overdue' && t.status !== 'Completed' ? 'Overdue' : t.status,
        verificationResult: t.implementationEvidence || cp.effectiveness.verificationEvidence,
        verifiedDate: t.completionDate || cp.effectiveness.verifiedDate,
        effectivenessTracking: {
          complaintsBefore: cp.effectiveness.complaintsBefore,
          complaintsAfter: cp.effectiveness.complaintsAfter,
          monitoringWindowDays: 90,
          verifiedEffective: effBool,
          evaluationNotes:
            cp.effectiveness.comments || cp.effectiveness.verificationEvidence || '',
          evaluatedAt: cp.effectiveness.verifiedDate,
          evaluatedBy: cp.effectiveness.reviewer,
        },
      });
    });
  }

  return actions;
}

// ---------- DASHBOARD KPIs & FILTERED ANALYTICS ----------

export interface CapaDashboardKpis {
  totalCapa: number;
  openCapa: number;
  inProgressCapa: number;
  pendingVerificationCapa: number;
  overdueCapa: number;
  effectiveCapa: number;
  ineffectiveCapa: number;
}

export function computeCapaDashboardKpis(
  capas: CAPARecord[],
  todayIso: string = new Date().toISOString().slice(0, 10)
): CapaDashboardKpis {
  const effectiveStatuses = capas.map((c) => resolveEffectiveCapaStatus(c, todayIso));
  return {
    totalCapa: capas.length,
    openCapa: effectiveStatuses.filter(
      (s) => s !== 'Closed' && s !== 'Effective' && s !== 'Ineffective'
    ).length,
    inProgressCapa: effectiveStatuses.filter((s) => s === 'In Progress').length,
    pendingVerificationCapa: effectiveStatuses.filter((s) => s === 'Pending Verification').length,
    overdueCapa: effectiveStatuses.filter((s) => s === 'Overdue').length,
    effectiveCapa: effectiveStatuses.filter((s) => s === 'Effective').length,
    ineffectiveCapa: effectiveStatuses.filter((s) => s === 'Ineffective').length,
  };
}

export interface CapaFilterState {
  startDate: string;
  endDate: string;
  productName: string;
  processName: string;
  department: string;
  owner: string;
  status: string;
  priority: string;
}

export const DEFAULT_CAPA_FILTERS: CapaFilterState = {
  startDate: '',
  endDate: '',
  productName: 'ALL',
  processName: 'ALL',
  department: 'ALL',
  owner: 'ALL',
  status: 'ALL',
  priority: 'ALL',
};

export function filterCapaRecords(
  capas: CAPARecord[],
  filters: CapaFilterState,
  todayIso: string = new Date().toISOString().slice(0, 10)
): CAPARecord[] {
  return capas.filter((c) => {
    const effStatus = resolveEffectiveCapaStatus(c, todayIso);
    if (filters.startDate && c.createdDate < filters.startDate) return false;
    if (filters.endDate && c.createdDate > filters.endDate) return false;
    if (filters.productName !== 'ALL' && c.productName !== filters.productName) return false;
    if (filters.processName !== 'ALL' && c.manufacturingProcess !== filters.processName)
      return false;
    if (filters.department !== 'ALL' && c.responsibleDepartment !== filters.department)
      return false;
    if (filters.owner !== 'ALL' && c.owner !== filters.owner) return false;
    if (filters.status !== 'ALL' && effStatus !== filters.status) return false;
    if (filters.priority !== 'ALL' && c.priority !== filters.priority) return false;
    return true;
  });
}

export function computeCapaAnalytics(
  capas: CAPARecord[],
  complaints: ComplaintRecord[],
  todayIso: string = new Date().toISOString().slice(0, 10)
) {
  const countBy = (keyFn: (c: CAPARecord) => string) => {
    const map = new Map<string, number>();
    capas.forEach((c) => {
      const k = keyFn(c) || 'Unspecified';
      map.set(k, (map.get(k) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  };

  const byCategory = countBy((c) => c.defectCategory);
  const byProcess = countBy((c) => c.manufacturingProcess);
  const byDepartment = countBy((c) => c.responsibleDepartment);
  const byOwner = countBy((c) => c.owner);

  const effMap = new Map<string, number>([
    ['Effective', 0],
    ['Ineffective', 0],
    ['Inconclusive', 0],
    ['Pending', 0],
  ]);
  capas.forEach((c) => {
    effMap.set(c.effectiveness.decision, (effMap.get(c.effectiveness.decision) ?? 0) + 1);
  });
  const effectivenessBreakdown = Array.from(effMap.entries()).map(([name, count]) => ({
    name,
    count,
  }));

  // Monthly CAPA creation vs completion trends
  const monthMap = new Map<string, { month: string; created: number; completed: number }>();
  capas.forEach((c) => {
    const cm = c.createdDate.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(cm)) {
      const entry = monthMap.get(cm) ?? { month: cm, created: 0, completed: 0 };
      entry.created += 1;
      monthMap.set(cm, entry);
    }
    const doneDate = c.actualCompletionDate || c.effectiveness.verifiedDate;
    if (doneDate && /^\d{4}-\d{2}/.test(doneDate)) {
      const dm = doneDate.slice(0, 7);
      const entry = monthMap.get(dm) ?? { month: dm, created: 0, completed: 0 };
      entry.completed += 1;
      monthMap.set(dm, entry);
    }
  });
  const monthlyCompletionTrend = Array.from(monthMap.values()).sort((a, b) =>
    a.month.localeCompare(b.month)
  );

  // Overdue analysis by department
  const overdueByDeptMap = new Map<string, { name: string; overdue: number; onTrack: number }>();
  capas.forEach((c) => {
    const eff = resolveEffectiveCapaStatus(c, todayIso);
    const cur = overdueByDeptMap.get(c.responsibleDepartment) ?? {
      name: c.responsibleDepartment,
      overdue: 0,
      onTrack: 0,
    };
    if (eff === 'Overdue') cur.overdue += 1;
    else cur.onTrack += 1;
    overdueByDeptMap.set(c.responsibleDepartment, cur);
  });
  const overdueAnalysis = Array.from(overdueByDeptMap.values()).sort(
    (a, b) => b.overdue - a.overdue
  );

  // Recurring complaints after CAPA closure / completion
  const postClosureRecurrence = capas
    .filter((cp) => cp.actualCompletionDate || cp.status === 'Closed' || cp.status === 'Effective' || cp.status === 'Ineffective')
    .map((cp) => {
      const refClose = cp.actualCompletionDate || cp.effectiveness.verifiedDate || cp.targetCompletionDate;
      const subsequent = complaints.filter(
        (comp) =>
          comp.id !== cp.complaintId &&
          comp.productName === cp.productName &&
          comp.category === cp.defectCategory &&
          comp.complaintDate > refClose
      ).length;
      return {
        name: cp.id,
        product: cp.productName,
        subsequentComplaints: Math.max(subsequent, cp.effectiveness.complaintsAfter ?? 0),
        decision: cp.effectiveness.decision,
      };
    });

  return {
    byCategory,
    byProcess,
    byDepartment,
    byOwner,
    effectivenessBreakdown,
    monthlyCompletionTrend,
    overdueAnalysis,
    postClosureRecurrence,
  };
}

// ---------- CSV EXPORTS ----------

export function exportCapaSummaryCsv(capas: CAPARecord[]) {
  const headers = [
    'CAPA ID',
    'Complaint ID',
    'Product ID',
    'Product Name',
    'Batch Number',
    'Defect Category',
    'Manufacturing Process',
    'Root Cause',
    'Root Cause Status',
    'Priority',
    'Owner',
    'Department',
    'Target Date',
    'Effective Status',
    'Progress %',
    'Complaints Before',
    'Complaints After',
    'Effectiveness Decision',
    'Origin',
  ];

  const rows = capas.map((c) => [
    c.id,
    c.complaintId,
    c.productId,
    c.productName,
    c.batchNumber,
    c.defectCategory,
    c.manufacturingProcess,
    c.rootCause,
    c.rootCauseVerificationStatus,
    c.priority,
    c.owner,
    c.responsibleDepartment,
    c.targetCompletionDate,
    resolveEffectiveCapaStatus(c),
    `${c.progressPercent}%`,
    c.effectiveness.complaintsBefore,
    c.effectiveness.complaintsAfter ?? 'Pending',
    c.effectiveness.decision,
    c.isDemoData ? 'DEMO DATA' : 'LIVE RECORD',
  ]);

  downloadCsvFile('q-intelligence-capa-summary-report.csv', headers, rows);
}

export function exportSingleCapaCsv(capa: CAPARecord) {
  const headers = [
    'Section',
    'Field / Action Type',
    'Details / Title',
    'Owner / Department',
    'Status / Target',
    'Evidence / Verification',
  ];

  const rows: Array<Array<unknown>> = [
    ['CAPA Header', 'CAPA ID & Origin', `${capa.id} (${capa.isDemoData ? 'DEMO DATA' : 'LIVE RECORD'})`, `${capa.owner} / ${capa.responsibleDepartment}`, `${resolveEffectiveCapaStatus(capa)} · Due ${capa.targetCompletionDate}`, `Priority: ${capa.priority}`],
    ['Related Complaint', capa.complaintId, `${capa.customerName} · ${capa.productId} ${capa.productName} (${capa.batchNumber})`, capa.manufacturingProcess, `Machine: ${capa.machineId}`, capa.defectCategory],
    ['Root Cause', capa.rootCauseVerificationStatus, capa.rootCause, '', '', capa.evidence],
  ];

  const pushTasks = (label: string, tasks: CAPAPlanTask[]) => {
    tasks.forEach((t) => {
      rows.push([
        label,
        `${t.actionSubtype} (${t.origin})`,
        `${t.title} — ${t.description}`,
        `${t.responsiblePerson} / ${t.responsibleDepartment}`,
        `${t.status} (${t.progressPercent}%) · Target ${t.targetDate}`,
        t.implementationEvidence || t.supportingEvidence || '',
      ]);
    });
  };

  pushTasks('Containment Action', capa.containmentActions);
  pushTasks('Corrective Action', capa.correctiveActions);
  pushTasks('Preventive Action', capa.preventiveActions);

  rows.push([
    'Effectiveness Verification',
    capa.effectiveness.decision,
    `Before: ${capa.effectiveness.complaintsBefore} (${capa.effectiveness.baselinePeriod}) | After: ${capa.effectiveness.complaintsAfter ?? 'Pending'} (${capa.effectiveness.postPeriod})`,
    capa.effectiveness.reviewer || 'Pending Reviewer',
    capa.effectiveness.verifiedDate || 'Pending Date',
    `${capa.effectiveness.verificationMethod} | ${capa.effectiveness.verificationEvidence} | ${capa.effectiveness.comments}`,
  ]);

  downloadCsvFile(`q-intelligence-${capa.id}-report.csv`, headers, rows);
}
