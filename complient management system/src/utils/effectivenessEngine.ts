import type {
  BeforeAfterAnalysisSummary,
  CAPARecord,
  ComplaintRecord,
  QualityScorecardIndicator,
  RecurrenceClassification,
  RecurringPostCapaMatch,
} from '../types/qms';
import { resolveEffectiveCapaStatus } from './capaUtils';
import { downloadCsvFile } from './csvUtils';
import { deduplicateComplaints, detectRecurringDefects } from './patternAnalytics';
import { daysBetween, getReferenceDate } from './qmsAnalytics';

export interface EffectivenessDashboardKpis {
  totalCustomerComplaints: number;
  complaintsResolved: number;
  recurringComplaints: number;
  verifiedRootCauses: number;
  totalCapaImplemented: number;
  effectiveCapa: number;
  ineffectiveCapa: number;
  avgCapaCompletionDays: number | null;
  complaintReductionPercent: number | null;
  complaintReductionDisplay: string;
}

export function isComplaintRootCauseVerified(c: ComplaintRecord): boolean {
  return (
    Boolean(c.rootCauseAnalysis?.manualVerifiedRootCause?.trim()) ||
    Boolean(
      c.rootCauseAnalysis?.hypotheses.some((h) => h.managerStatus === 'Verified')
    )
  );
}

export function getVerifiedRootCauseText(c: ComplaintRecord): string {
  const manual = c.rootCauseAnalysis?.manualVerifiedRootCause?.trim();
  if (manual) return manual;
  const hyp = c.rootCauseAnalysis?.hypotheses.find(
    (h) => h.managerStatus === 'Verified'
  );
  return hyp?.title?.trim() || '';
}

export function computeEffectivenessDashboardKpis(
  complaints: ComplaintRecord[],
  capaRecords: CAPARecord[]
): EffectivenessDashboardKpis {
  const unique = deduplicateComplaints(complaints);
  const totalCustomerComplaints = unique.length;
  const complaintsResolved = unique.filter((c) => c.status === 'Closed').length;

  const patterns = detectRecurringDefects(unique, {
    observationDays: 365,
    chronicThreshold: 3,
  });
  const recurringIds = new Set<string>();
  patterns
    .filter((p) => p.classification !== 'New Problem')
    .forEach((p) => p.relatedComplaintIds.forEach((id) => recurringIds.add(id)));

  const postCapaMatches = detectPostCapaRecurrences(unique, capaRecords);
  postCapaMatches
    .filter((m) => m.classification === 'Confirmed Recurrence')
    .forEach((m) => recurringIds.add(m.complaintId));

  const recurringComplaints = recurringIds.size;
  const verifiedRootCauses = unique.filter(isComplaintRootCauseVerified).length;

  const implementedStatuses = new Set([
    'Pending Verification',
    'Effective',
    'Ineffective',
    'Closed',
  ]);
  const totalCapaImplemented = capaRecords.filter((cp) => {
    const effSt = resolveEffectiveCapaStatus(cp);
    return implementedStatuses.has(effSt) || cp.managerCompletionApproved;
  }).length;

  const effectiveCapa = capaRecords.filter(
    (cp) => cp.effectiveness.decision === 'Effective' || resolveEffectiveCapaStatus(cp) === 'Effective'
  ).length;

  const ineffectiveCapa = capaRecords.filter(
    (cp) =>
      cp.effectiveness.decision === 'Ineffective' ||
      resolveEffectiveCapaStatus(cp) === 'Ineffective'
  ).length;

  const completionDurations: number[] = [];
  for (const cp of capaRecords) {
    const endIso = cp.actualCompletionDate || cp.effectiveness.verifiedDate;
    if (endIso && cp.createdDate) {
      const d = daysBetween(cp.createdDate, endIso);
      if (d !== null) completionDurations.push(d);
    }
  }
  const avgCapaCompletionDays =
    completionDurations.length > 0
      ? Number(
          (
            completionDurations.reduce((a, b) => a + b, 0) /
            completionDurations.length
          ).toFixed(1)
        )
      : null;

  const comparableCapas = capaRecords.filter(
    (cp) =>
      cp.effectiveness.complaintsBefore > 0 &&
      cp.effectiveness.complaintsAfter !== null &&
      cp.effectiveness.complaintsAfter !== undefined
  );

  let complaintReductionPercent: number | null = null;
  let complaintReductionDisplay = 'Not Applicable';

  if (comparableCapas.length > 0) {
    const totalBefore = comparableCapas.reduce(
      (acc, cp) => acc + cp.effectiveness.complaintsBefore,
      0
    );
    const totalAfter = comparableCapas.reduce(
      (acc, cp) => acc + (cp.effectiveness.complaintsAfter ?? 0),
      0
    );
    if (totalBefore > 0) {
      complaintReductionPercent = Number(
        (((totalBefore - totalAfter) / totalBefore) * 100).toFixed(1)
      );
      complaintReductionDisplay = `${complaintReductionPercent}%`;
    }
  } else if (capaRecords.length > 0) {
    complaintReductionDisplay = 'Pending Data';
  }

  return {
    totalCustomerComplaints,
    complaintsResolved,
    recurringComplaints,
    verifiedRootCauses,
    totalCapaImplemented,
    effectiveCapa,
    ineffectiveCapa,
    avgCapaCompletionDays,
    complaintReductionPercent,
    complaintReductionDisplay,
  };
}

// ---------- SECTION 2: BEFORE-AND-AFTER PERFORMANCE ANALYSIS ----------

export function computeBeforeAfterAnalysis(
  complaints: ComplaintRecord[],
  capaRecords: CAPARecord[],
  selectedCapaId?: string | 'ALL'
): BeforeAfterAnalysisSummary {
  const unique = deduplicateComplaints(complaints);
  const scopedCapas =
    selectedCapaId && selectedCapaId !== 'ALL'
      ? capaRecords.filter((cp) => cp.id === selectedCapaId)
      : capaRecords;

  const comparable = scopedCapas.filter(
    (cp) => cp.effectiveness.complaintsAfter !== null && cp.effectiveness.complaintsAfter !== undefined
  );

  if (scopedCapas.length === 0) {
    return {
      scopeLabel: 'No CAPA Records Selected',
      evaluatedCapasCount: 0,
      complaintsBefore: 0,
      complaintsAfter: null,
      defectsBefore: 0,
      defectsAfter: null,
      productionVolumeBefore: null,
      productionVolumeAfter: null,
      defectRateBefore: null,
      defectRateAfter: null,
      reductionPercent: null,
      reductionDisplay: 'Not Applicable',
      hasComparableBaseline: false,
      provisionalCountsOnly: true,
      processPerformanceSummary: 'No CAPA records available for comparison.',
      notes: 'Register and evaluate at least one CAPA to perform before-and-after analysis.',
    };
  }

  const complaintsBefore =
    comparable.length > 0
      ? comparable.reduce((acc, cp) => acc + cp.effectiveness.complaintsBefore, 0)
      : scopedCapas.reduce((acc, cp) => acc + cp.effectiveness.complaintsBefore, 0);

  const complaintsAfter =
    comparable.length > 0
      ? comparable.reduce((acc, cp) => acc + (cp.effectiveness.complaintsAfter ?? 0), 0)
      : null;

  // Defect counts mirror reported defect incidents unless multi-unit lot defects recorded
  const defectsBefore = complaintsBefore;
  const defectsAfter = complaintsAfter;

  const withBothVolumes = comparable.filter(
    (cp) =>
      cp.effectiveness.productionVolumeBefore !== null &&
      cp.effectiveness.productionVolumeBefore > 0 &&
      cp.effectiveness.productionVolumeAfter !== null &&
      cp.effectiveness.productionVolumeAfter > 0
  );

  const hasCompleteVolumes =
    comparable.length > 0 && withBothVolumes.length === comparable.length;

  const productionVolumeBefore = hasCompleteVolumes
    ? withBothVolumes.reduce(
        (acc, cp) => acc + (cp.effectiveness.productionVolumeBefore ?? 0),
        0
      )
    : null;

  const productionVolumeAfter = hasCompleteVolumes
    ? withBothVolumes.reduce(
        (acc, cp) => acc + (cp.effectiveness.productionVolumeAfter ?? 0),
        0
      )
    : null;

  const defectRateBefore =
    productionVolumeBefore && productionVolumeBefore > 0
      ? Number(((complaintsBefore / productionVolumeBefore) * 1000).toFixed(2))
      : null;

  const defectRateAfter =
    productionVolumeAfter && productionVolumeAfter > 0 && complaintsAfter !== null
      ? Number(((complaintsAfter / productionVolumeAfter) * 1000).toFixed(2))
      : null;

  let reductionPercent: number | null = null;
  let reductionDisplay = 'Not Applicable';
  if (complaintsBefore > 0 && complaintsAfter !== null) {
    reductionPercent = Number(
      (((complaintsBefore - complaintsAfter) / complaintsBefore) * 100).toFixed(1)
    );
    reductionDisplay = `${reductionPercent}%`;
  } else if (complaintsBefore === 0) {
    reductionDisplay = 'Not Applicable';
  } else {
    reductionDisplay = 'Pending Verification Data';
  }

  const processSet = Array.from(
    new Set(scopedCapas.map((cp) => cp.manufacturingProcess).filter(Boolean))
  );
  const effectiveInScope = comparable.filter(
    (cp) => cp.effectiveness.decision === 'Effective'
  ).length;
  const ineffectiveInScope = comparable.filter(
    (cp) => cp.effectiveness.decision === 'Ineffective'
  ).length;

  const processPerformanceSummary =
    comparable.length === 0
      ? `Awaiting post-CAPA monitoring counts across ${processSet.join(', ') || 'selected process(es)'}.`
      : `${effectiveInScope} Effective vs ${ineffectiveInScope} Ineffective across ${processSet.join(', ')} (${unique.length} total complaints in dataset).`;

  const notes = !hasCompleteVolumes
    ? 'Production volume denominators are unavailable for one or more CAPAs; comparison uses raw complaint counts only and does not claim a normalized defect-rate improvement.'
    : 'Production volumes recorded for all comparable CAPAs; normalized defect rates (per 1,000 units) are displayed alongside raw complaint counts.';

  return {
    scopeLabel:
      selectedCapaId && selectedCapaId !== 'ALL'
        ? `${scopedCapas[0].id} · ${scopedCapas[0].productName}`
        : `All Evaluated CAPAs (${comparable.length} of ${scopedCapas.length})`,
    evaluatedCapasCount: comparable.length,
    complaintsBefore,
    complaintsAfter,
    defectsBefore,
    defectsAfter,
    productionVolumeBefore,
    productionVolumeAfter,
    defectRateBefore,
    defectRateAfter,
    reductionPercent,
    reductionDisplay,
    hasComparableBaseline: complaintsBefore > 0 && complaintsAfter !== null,
    provisionalCountsOnly: !hasCompleteVolumes,
    processPerformanceSummary,
    notes,
  };
}

// ---------- SECTION 4: RECURRING COMPLAINT MONITORING ----------

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'were',
  'was',
  'are',
  'during',
  'after',
  'before',
  'issue',
  'reported',
  'customer',
  'defect',
  'complaint',
  'batch',
  'unit',
  'units',
]);

function tokenize(text: string): Set<string> {
  const tokens = (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  return new Set(tokens);
}

function jaccardSimilarityPercent(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const w of ta) {
    if (tb.has(w)) intersection++;
  }
  const union = ta.size + tb.size - intersection;
  return union === 0 ? 0 : Math.round((intersection / union) * 100);
}

/**
 * Evaluates complaints occurring after CAPA creation/implementation to detect
 * Confirmed Recurrence, Possible Recurrence, or New Unrelated Complaint.
 * Never claims identical root causes unless both records carry verified root causes.
 */
export function detectPostCapaRecurrences(
  complaints: ComplaintRecord[],
  capaRecords: CAPARecord[]
): RecurringPostCapaMatch[] {
  const unique = deduplicateComplaints(complaints);
  const matches: RecurringPostCapaMatch[] = [];

  for (const cp of capaRecords) {
    const effStatus = resolveEffectiveCapaStatus(cp);
    const isImplementedOrMonitoring =
      cp.managerCompletionApproved ||
      Boolean(cp.actualCompletionDate) ||
      effStatus === 'Pending Verification' ||
      effStatus === 'Effective' ||
      effStatus === 'Ineffective' ||
      effStatus === 'Closed';

    if (!isImplementedOrMonitoring) continue;

    const refDate = cp.actualCompletionDate || cp.startDate || cp.createdDate;
    const sourceComplaint = unique.find((c) => c.id === cp.complaintId);
    const capaRcVerified = cp.rootCauseVerificationStatus === 'Verified';

    const subsequentComplaints = unique.filter(
      (c) => c.id !== cp.complaintId && c.complaintDate >= refDate
    );

    for (const c of subsequentComplaints) {
      const sameProduct = c.productName === cp.productName;
      const sameCategory = c.category === cp.defectCategory;
      const sameProcess =
        Boolean(c.processName) &&
        Boolean(cp.manufacturingProcess) &&
        c.processName === cp.manufacturingProcess;
      const sameMachine =
        Boolean(c.machineId?.trim()) &&
        Boolean(cp.machineId?.trim()) &&
        cp.machineId !== 'Unspecified' &&
        c.machineId?.trim().toLowerCase() === cp.machineId?.trim().toLowerCase();
      const sameBatch =
        Boolean(c.batchNumber?.trim()) &&
        Boolean(cp.batchNumber?.trim()) &&
        c.batchNumber.trim().toLowerCase() === cp.batchNumber.trim().toLowerCase();

      const simPct = jaccardSimilarityPercent(
        c.description,
        sourceComplaint?.description || cp.description
      );

      const compVerifiedRc = getVerifiedRootCauseText(c);
      const verifiedRootCauseMatch =
        capaRcVerified &&
        Boolean(compVerifiedRc) &&
        (compVerifiedRc.toLowerCase() === cp.rootCause.toLowerCase() ||
          jaccardSimilarityPercent(compVerifiedRc, cp.rootCause) >= 45);

      const matchDimensions: string[] = [];
      if (sameProduct) matchDimensions.push('Same Product');
      if (sameCategory) matchDimensions.push('Same Defect Category');
      if (sameProcess) matchDimensions.push('Same Process');
      if (sameMachine) matchDimensions.push(`Same Machine (${c.machineId})`);
      if (sameBatch) matchDimensions.push(`Same Batch (${c.batchNumber})`);
      if (simPct >= 25) matchDimensions.push(`${simPct}% Description Similarity`);
      if (verifiedRootCauseMatch) matchDimensions.push('Verified Root Cause Match');

      let classification: RecurrenceClassification = 'New Unrelated Complaint';
      let explanation =
        'No established product, batch, machine, or verified root cause link to prior CAPA.';

      if (
        (sameProduct && sameCategory) ||
        (sameProduct && sameBatch) ||
        verifiedRootCauseMatch
      ) {
        classification = 'Confirmed Recurrence';
        explanation = verifiedRootCauseMatch
          ? `Confirmed recurrence with matching verified root cause after CAPA ${cp.id} (${refDate}).`
          : `Confirmed recurring ${c.category} complaint on ${c.productName} after CAPA ${cp.id} (${refDate}). Root cause parity requires separate physical verification unless already verified.`;
      } else if (
        sameProduct ||
        (sameProcess && sameCategory) ||
        (sameMachine && sameCategory) ||
        simPct >= 25
      ) {
        classification = 'Possible Recurrence';
        explanation = `Possible recurrence via ${matchDimensions.join(', ')}. Physical investigation required before confirming same root cause.`;
      }

      if (classification !== 'New Unrelated Complaint') {
        matches.push({
          id: `REC-${cp.id}-${c.id}`,
          complaintId: c.id,
          complaintDate: c.complaintDate,
          productName: c.productName,
          processName: c.processName,
          machineId: c.machineId || 'Unspecified',
          batchNumber: c.batchNumber,
          category: c.category,
          severity: c.severity,
          description: c.description,
          relatedCapaId: cp.id,
          relatedCapaStatus: effStatus,
          relatedCapaDecision: cp.effectiveness.decision,
          capaReferenceDate: refDate,
          classification,
          matchDimensions,
          descriptionSimilarityPercent: simPct,
          verifiedRootCauseMatch,
          explanation,
        });
      }
    }
  }

  return matches.sort((a, b) => {
    const rank = (cls: RecurrenceClassification) =>
      cls === 'Confirmed Recurrence' ? 0 : cls === 'Possible Recurrence' ? 1 : 2;
    return rank(a.classification) - rank(b.classification) || b.complaintDate.localeCompare(a.complaintDate);
  });
}

// ---------- SECTION 5: QUALITY IMPROVEMENT ANALYTICS (5 FILTERS + 8 CHARTS) ----------

export interface EffectivenessFilterState {
  startDate: string;
  endDate: string;
  productName: string;
  processName: string;
  customerName: string;
  category: string;
}

export const DEFAULT_EFFECTIVENESS_FILTERS: EffectivenessFilterState = {
  startDate: '',
  endDate: '',
  productName: 'ALL',
  processName: 'ALL',
  customerName: 'ALL',
  category: 'ALL',
};

export function filterEffectivenessData(
  complaints: ComplaintRecord[],
  capaRecords: CAPARecord[],
  filters: EffectivenessFilterState
) {
  const filteredComplaints = deduplicateComplaints(complaints).filter((c) => {
    if (filters.startDate && c.complaintDate < filters.startDate) return false;
    if (filters.endDate && c.complaintDate > filters.endDate) return false;
    if (filters.productName !== 'ALL' && c.productName !== filters.productName) return false;
    if (filters.processName !== 'ALL' && c.processName !== filters.processName) return false;
    if (filters.customerName !== 'ALL' && c.customerName !== filters.customerName) return false;
    if (filters.category !== 'ALL' && c.category !== filters.category) return false;
    return true;
  });

  const filteredCapas = capaRecords.filter((cp) => {
    if (filters.startDate && cp.createdDate < filters.startDate) return false;
    if (filters.endDate && cp.createdDate > filters.endDate) return false;
    if (filters.productName !== 'ALL' && cp.productName !== filters.productName) return false;
    if (filters.processName !== 'ALL' && cp.manufacturingProcess !== filters.processName)
      return false;
    if (filters.customerName !== 'ALL' && cp.customerName !== filters.customerName) return false;
    if (filters.category !== 'ALL' && cp.defectCategory !== filters.category) return false;
    return true;
  });

  return { filteredComplaints, filteredCapas };
}

export function computeEffectivenessAnalytics(
  complaints: ComplaintRecord[],
  capaRecords: CAPARecord[]
) {
  const unique = deduplicateComplaints(complaints);

  // 1. Monthly complaint reduction / closure trend
  const monthMap = new Map<
    string,
    { month: string; total: number; resolved: number; open: number; recurring: number }
  >();
  const seenProdCat = new Map<string, number>();

  const sortedByDate = [...unique].sort((a, b) =>
    a.complaintDate.localeCompare(b.complaintDate)
  );
  for (const c of sortedByDate) {
    const ym = c.complaintDate.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(ym)) continue;
    const entry = monthMap.get(ym) ?? {
      month: ym,
      total: 0,
      resolved: 0,
      open: 0,
      recurring: 0,
    };
    entry.total += 1;
    if (c.status === 'Closed') entry.resolved += 1;
    else entry.open += 1;

    const key = `${c.productName}__${c.category}`;
    const prev = seenProdCat.get(key) ?? 0;
    if (prev >= 1) entry.recurring += 1;
    seenProdCat.set(key, prev + 1);
    monthMap.set(ym, entry);
  }
  const monthlyTrends = Array.from(monthMap.values()).sort((a, b) =>
    a.month.localeCompare(b.month)
  );

  // 2. CAPA effectiveness percentage breakdown
  const effCounts = { Effective: 0, Ineffective: 0, Inconclusive: 0, Pending: 0 };
  for (const cp of capaRecords) {
    effCounts[cp.effectiveness.decision] =
      (effCounts[cp.effectiveness.decision] ?? 0) + 1;
  }
  const evaluatedTotal =
    effCounts.Effective + effCounts.Ineffective + effCounts.Inconclusive;
  const effectiveRatePercent =
    evaluatedTotal > 0 ? Number(((effCounts.Effective / evaluatedTotal) * 100).toFixed(1)) : null;

  const capaEffectivenessDistribution = [
    { name: 'Effective', count: effCounts.Effective },
    { name: 'Ineffective', count: effCounts.Ineffective },
    { name: 'Inconclusive', count: effCounts.Inconclusive },
    { name: 'Pending', count: effCounts.Pending },
  ];

  // Helper for product / process / category before vs after improvement
  const aggregateImprovement = (keyFn: (cp: CAPARecord) => string) => {
    const map = new Map<
      string,
      { name: string; before: number; after: number; comparableCapas: number; totalCapas: number }
    >();
    for (const cp of capaRecords) {
      const k = keyFn(cp) || 'Unspecified';
      const cur = map.get(k) ?? {
        name: k,
        before: 0,
        after: 0,
        comparableCapas: 0,
        totalCapas: 0,
      };
      cur.totalCapas += 1;
      if (cp.effectiveness.complaintsAfter !== null && cp.effectiveness.complaintsAfter !== undefined) {
        cur.before += cp.effectiveness.complaintsBefore;
        cur.after += cp.effectiveness.complaintsAfter;
        cur.comparableCapas += 1;
      }
      map.set(k, cur);
    }
    return Array.from(map.values())
      .map((item) => ({
        ...item,
        improvementPercent:
          item.comparableCapas > 0 && item.before > 0
            ? Number((((item.before - item.after) / item.before) * 100).toFixed(1))
            : null,
      }))
      .sort((a, b) => (b.improvementPercent ?? -999) - (a.improvementPercent ?? -999));
  };

  const productImprovement = aggregateImprovement((cp) => cp.productName);
  const processImprovement = aggregateImprovement((cp) => cp.manufacturingProcess);
  const categoryImprovement = aggregateImprovement((cp) => cp.defectCategory);

  // 7. Root cause recurrence analysis
  const rcMap = new Map<
    string,
    { rootCause: string; verified: boolean; count: number; ineffectiveCapas: number }
  >();
  for (const cp of capaRecords) {
    const label = cp.rootCause.length > 38 ? `${cp.rootCause.slice(0, 36)}…` : cp.rootCause;
    const cur = rcMap.get(label) ?? {
      rootCause: label,
      verified: cp.rootCauseVerificationStatus === 'Verified',
      count: 0,
      ineffectiveCapas: 0,
    };
    cur.count += 1;
    if (cp.effectiveness.decision === 'Ineffective') cur.ineffectiveCapas += 1;
    rcMap.set(label, cur);
  }
  const rootCauseRecurrence = Array.from(rcMap.values()).sort(
    (a, b) => b.count - a.count
  );

  // 8. Per-CAPA Before vs After comparison
  const beforeAfterBars = capaRecords
    .filter((cp) => cp.effectiveness.complaintsAfter !== null)
    .map((cp) => ({
      name: cp.id,
      product: cp.productName,
      before: cp.effectiveness.complaintsBefore,
      after: cp.effectiveness.complaintsAfter ?? 0,
      decision: cp.effectiveness.decision,
    }));

  return {
    monthlyTrends,
    capaEffectivenessDistribution,
    effectiveRatePercent,
    productImprovement,
    processImprovement,
    categoryImprovement,
    rootCauseRecurrence,
    beforeAfterBars,
  };
}

// ---------- SECTION 8: QUALITY PERFORMANCE SCORECARD ----------

export function computeQualityPerformanceScorecard(
  complaints: ComplaintRecord[],
  capaRecords: CAPARecord[]
): QualityScorecardIndicator[] {
  const unique = deduplicateComplaints(complaints);
  const refDate = getReferenceDate(unique);
  const cutoffCurrent = new Date(refDate.getTime() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const cutoffPrev = new Date(refDate.getTime() - 180 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const todayIso = new Date().toISOString().slice(0, 10);

  const currentComplaints = unique.filter((c) => c.complaintDate >= cutoffCurrent);
  const prevComplaints = unique.filter(
    (c) => c.complaintDate >= cutoffPrev && c.complaintDate < cutoffCurrent
  );

  const currentCapas = capaRecords.filter((cp) => cp.createdDate >= cutoffCurrent);
  const prevCapas = capaRecords.filter(
    (cp) => cp.createdDate >= cutoffPrev && cp.createdDate < cutoffCurrent
  );

  const hasPriorPeriodComplaints = prevComplaints.length > 0;
  const hasPriorPeriodCapas = prevCapas.length > 0;

  const pct = (num: number, den: number) =>
    den > 0 ? Number(((num / den) * 100).toFixed(1)) : null;

  // 1. Complaint Frequency
  const freqDelta = currentComplaints.length - prevComplaints.length;
  const freqTrend = !hasPriorPeriodComplaints
    ? ('Insufficient Data' as const)
    : freqDelta < 0
      ? ('Improved' as const)
      : freqDelta > 0
        ? ('Deteriorated' as const)
        : ('Unchanged' as const);

  // 2. Recurring Complaint Frequency
  const recurShare = (list: ComplaintRecord[]) => {
    if (list.length === 0) return null;
    const counts = new Map<string, number>();
    list.forEach((c) => {
      const k = `${c.productName}__${c.category}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    });
    const repeated = list.filter((c) => (counts.get(`${c.productName}__${c.category}`) ?? 0) >= 2).length;
    return pct(repeated, list.length);
  };
  const curRecur = recurShare(currentComplaints);
  const prevRecur = recurShare(prevComplaints);

  // 3. Root Cause Verification Progress
  const curRcPct = pct(
    currentComplaints.filter(isComplaintRootCauseVerified).length,
    currentComplaints.length
  );
  const prevRcPct = pct(
    prevComplaints.filter(isComplaintRootCauseVerified).length,
    prevComplaints.length
  );

  // 4. CAPA Completion Rate
  const isCompletedCapa = (cp: CAPARecord) => {
    const st = resolveEffectiveCapaStatus(cp, todayIso);
    return (
      st === 'Pending Verification' ||
      st === 'Effective' ||
      st === 'Ineffective' ||
      st === 'Closed' ||
      cp.managerCompletionApproved
    );
  };
  const curCapaCompPct = pct(
    capaRecords.filter(isCompletedCapa).length,
    capaRecords.length
  );
  const prevCapaCompPct = pct(
    prevCapas.filter(isCompletedCapa).length,
    prevCapas.length
  );

  // 5. CAPA Effectiveness Rate
  const evalEffRate = (list: CAPARecord[]) => {
    const evaluated = list.filter((cp) => cp.effectiveness.decision !== 'Pending');
    if (evaluated.length === 0) return null;
    const eff = evaluated.filter((cp) => cp.effectiveness.decision === 'Effective').length;
    return pct(eff, evaluated.length);
  };
  const curEffRate = evalEffRate(capaRecords);
  const prevEffRate = evalEffRate(prevCapas);

  // 6. Overdue CAPA Percentage
  const curOverduePct = pct(
    capaRecords.filter((cp) => resolveEffectiveCapaStatus(cp, todayIso) === 'Overdue').length,
    capaRecords.length
  );
  const prevOverduePct = pct(
    prevCapas.filter((cp) => resolveEffectiveCapaStatus(cp, todayIso) === 'Overdue').length,
    prevCapas.length
  );

  // 7. Complaint Resolution Time
  const avgResDays = (list: ComplaintRecord[]) => {
    const durations: number[] = [];
    list
      .filter((c) => c.status === 'Closed' && c.resolutionDate)
      .forEach((c) => {
        const d = daysBetween(c.complaintDate, c.resolutionDate!);
        if (d !== null) durations.push(d);
      });
    if (durations.length === 0) return null;
    return Number((durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1));
  };
  const curResDays = avgResDays(currentComplaints);
  const prevResDays = avgResDays(prevComplaints);

  const compare = (
    cur: number | null,
    prev: number | null,
    higherIsBetter: boolean,
    unit: string
  ): {
    deltaText: string;
    trendDirection: QualityScorecardIndicator['trendDirection'];
    dataAvailability: QualityScorecardIndicator['dataAvailability'];
  } => {
    if (cur === null && prev === null) {
      return {
        deltaText: 'Insufficient Data',
        trendDirection: 'Insufficient Data',
        dataAvailability: 'Insufficient Data',
      };
    }
    if (cur === null || prev === null) {
      return {
        deltaText: 'Single Period Only',
        trendDirection: 'Insufficient Data',
        dataAvailability: 'Partial',
      };
    }
    const diff = Number((cur - prev).toFixed(1));
    const sign = diff > 0 ? '+' : '';
    const trendDirection =
      diff === 0
        ? 'Unchanged'
        : higherIsBetter
          ? diff > 0
            ? 'Improved'
            : 'Deteriorated'
          : diff < 0
            ? 'Improved'
            : 'Deteriorated';
    return {
      deltaText: `${sign}${diff}${unit}`,
      trendDirection,
      dataAvailability: 'Complete',
    };
  };

  const recurCmp = compare(curRecur, prevRecur, false, ' pts');
  const rcCmp = compare(curRcPct, prevRcPct, true, ' pts');
  const capaCompCmp = compare(curCapaCompPct, prevCapaCompPct, true, ' pts');
  const effCmp = compare(curEffRate, prevEffRate, true, ' pts');
  const overdueCmp = compare(curOverduePct, prevOverduePct, false, ' pts');
  const resCmp = compare(curResDays, prevResDays, false, ' days');

  return [
    {
      id: 'complaint-frequency',
      label: 'Complaint Frequency (90-Day Window)',
      currentValue: `${currentComplaints.length} complaints`,
      previousValue: hasPriorPeriodComplaints ? `${prevComplaints.length} complaints` : 'No prior window data',
      deltaText: hasPriorPeriodComplaints ? `${freqDelta > 0 ? '+' : ''}${freqDelta} complaints` : 'Single Period',
      trendDirection: freqTrend,
      explanation: `Count of customer complaints in last 90 days (${cutoffCurrent} to ${refDate.toISOString().slice(0, 10)}) vs prior 90 days (${cutoffPrev} to ${cutoffCurrent}).`,
      dataAvailability: hasPriorPeriodComplaints ? 'Complete' : 'Partial',
    },
    {
      id: 'recurring-frequency',
      label: 'Recurring Complaint Share',
      currentValue: curRecur !== null ? `${curRecur}%` : '—',
      previousValue: prevRecur !== null ? `${prevRecur}%` : '—',
      deltaText: recurCmp.deltaText,
      trendDirection: recurCmp.trendDirection,
      explanation: 'Percentage of complaints in window sharing product + defect category >= 2 times.',
      dataAvailability: recurCmp.dataAvailability,
    },
    {
      id: 'rca-verification-progress',
      label: 'Root Cause Verification Progress',
      currentValue: curRcPct !== null ? `${curRcPct}%` : '—',
      previousValue: prevRcPct !== null ? `${prevRcPct}%` : '—',
      deltaText: rcCmp.deltaText,
      trendDirection: rcCmp.trendDirection,
      explanation: 'Percentage of complaints in window with a manager-verified root cause.',
      dataAvailability: rcCmp.dataAvailability,
    },
    {
      id: 'capa-completion-rate',
      label: 'CAPA Implementation Completion Rate',
      currentValue: curCapaCompPct !== null ? `${curCapaCompPct}%` : '—',
      previousValue: prevCapaCompPct !== null ? `${prevCapaCompPct}%` : `${currentCapas.length} recent`,
      deltaText: capaCompCmp.deltaText,
      trendDirection: capaCompCmp.trendDirection,
      explanation: 'Share of active CAPA register records that have completed implementation or reached verification.',
      dataAvailability: capaCompCmp.dataAvailability,
    },
    {
      id: 'capa-effectiveness-rate',
      label: 'Verified CAPA Effectiveness Rate',
      currentValue: curEffRate !== null ? `${curEffRate}%` : '—',
      previousValue: prevEffRate !== null ? `${prevEffRate}%` : '—',
      deltaText: effCmp.deltaText,
      trendDirection: effCmp.trendDirection,
      explanation: 'Effective CAPAs divided by total evaluated CAPAs (Effective + Ineffective + Inconclusive).',
      dataAvailability: effCmp.dataAvailability,
    },
    {
      id: 'overdue-capa-pct',
      label: 'Overdue CAPA Percentage',
      currentValue: curOverduePct !== null ? `${curOverduePct}%` : '—',
      previousValue: prevOverduePct !== null ? `${prevOverduePct}%` : '—',
      deltaText: overdueCmp.deltaText,
      trendDirection: overdueCmp.trendDirection,
      explanation: 'CAPAs past target completion date without reaching Effective/Ineffective/Closed status.',
      dataAvailability: overdueCmp.dataAvailability,
    },
    {
      id: 'complaint-resolution-time',
      label: 'Average Complaint Resolution Time',
      currentValue: curResDays !== null ? `${curResDays} days` : '—',
      previousValue: prevResDays !== null ? `${prevResDays} days` : '—',
      deltaText: resCmp.deltaText,
      trendDirection: resCmp.trendDirection,
      explanation: 'Mean calendar days from complaintDate to resolutionDate for Closed complaints.',
      dataAvailability: resCmp.dataAvailability,
    },
  ];
}

// ---------- EXECUTIVE MANAGEMENT CSV EXPORT ----------

export function exportExecutiveManagementCsv(params: {
  dateRangeLabel: string;
  kpis: EffectivenessDashboardKpis;
  beforeAfter: BeforeAfterAnalysisSummary;
  scorecard: QualityScorecardIndicator[];
  recurrences: RecurringPostCapaMatch[];
}) {
  const headers = ['Report Section', 'Metric / Item', 'Value / Current', 'Baseline / Previous', 'Assessment / Details'];
  const rows: Array<Array<unknown>> = [
    ['Report Scope', 'Date Range', params.dateRangeLabel, '', 'Q-INTELLIGENCE (PS-036)'],
    ['KPI Summary', 'Total Customer Complaints', params.kpis.totalCustomerComplaints, '', `Resolved: ${params.kpis.complaintsResolved}`],
    ['KPI Summary', 'Recurring Complaints', params.kpis.recurringComplaints, '', `Verified RCs: ${params.kpis.verifiedRootCauses}`],
    ['KPI Summary', 'CAPA Implemented / Effective / Ineffective', `${params.kpis.totalCapaImplemented} / ${params.kpis.effectiveCapa} / ${params.kpis.ineffectiveCapa}`, '', `Avg Completion: ${params.kpis.avgCapaCompletionDays ?? 'N/A'} days`],
    ['Before & After', 'Comparable Complaints Before -> After', `${params.beforeAfter.complaintsBefore} -> ${params.beforeAfter.complaintsAfter ?? 'Pending'}`, `Reduction: ${params.beforeAfter.reductionDisplay}`, params.beforeAfter.notes],
  ];

  params.scorecard.forEach((s) => {
    rows.push(['Quality Scorecard', s.label, s.currentValue, s.previousValue, `${s.trendDirection} (${s.deltaText}) | ${s.dataAvailability}`]);
  });

  params.recurrences.slice(0, 25).forEach((r) => {
    rows.push(['Recurring Post-CAPA', `${r.complaintId} vs ${r.relatedCapaId}`, r.classification, r.productName, r.explanation]);
  });

  downloadCsvFile('q-intelligence-executive-management-report.csv', headers, rows);
}
