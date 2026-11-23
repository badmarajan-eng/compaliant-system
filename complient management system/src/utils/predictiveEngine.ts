import type {
  BatchAssessmentStatus,
  BatchRiskAssessment,
  CAPARecord,
  ComplaintCategory,
  ComplaintRecord,
  ForecastHorizonSummary,
  ForecastMethodId,
  ForecastTimelinePoint,
  PredictiveAlert,
  PredictiveFactorDetail,
  PredictionEvaluationStatus,
  PredictionHistoryEntry,
  PreventiveActionPlan,
  ProcessRiskAssessment,
  ProductRiskAssessment,
  RiskScoringWeights,
  RiskTier,
  SeverityLevel,
  TimeSeriesForecastResult,
} from '../types/qms';
import { resolveEffectiveCapaStatus } from './capaUtils';
import { downloadCsvFile } from './csvUtils';
import { detectPostCapaRecurrences } from './effectivenessEngine';
import {
  classifyStandardProcessFamily,
  deduplicateComplaints,
  detectRecurringDefects,
  STANDARD_PROCESS_FAMILIES,
} from './patternAnalytics';
import { deriveEffectivenessStatus, getReferenceDate } from './qmsAnalytics';

export const DEFAULT_RISK_WEIGHTS: RiskScoringWeights = {
  historicalFrequency: 25,
  complaintSeverity: 20,
  recentTrend: 20,
  recurrenceRate: 15,
  unresolvedCritical: 10,
  capaEffectiveness: 10,
};

const SEVERITY_SCORE_MAP: Record<SeverityLevel, number> = {
  Low: 0.2,
  Medium: 0.45,
  High: 0.75,
  Critical: 1.0,
};

export function normalizeWeights(weights: RiskScoringWeights): RiskScoringWeights {
  const sum =
    weights.historicalFrequency +
    weights.complaintSeverity +
    weights.recentTrend +
    weights.recurrenceRate +
    weights.unresolvedCritical +
    weights.capaEffectiveness;
  if (sum <= 0) return { ...DEFAULT_RISK_WEIGHTS };
  const scale = 100 / sum;
  return {
    historicalFrequency: Number((weights.historicalFrequency * scale).toFixed(2)),
    complaintSeverity: Number((weights.complaintSeverity * scale).toFixed(2)),
    recentTrend: Number((weights.recentTrend * scale).toFixed(2)),
    recurrenceRate: Number((weights.recurrenceRate * scale).toFixed(2)),
    unresolvedCritical: Number((weights.unresolvedCritical * scale).toFixed(2)),
    capaEffectiveness: Number((weights.capaEffectiveness * scale).toFixed(2)),
  };
}

export function classifyRiskLevel(score: number): RiskTier {
  if (score >= 70) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  return 'LOW';
}

function getVerifiedRootCauses(items: ComplaintRecord[]): string[] {
  const set = new Set<string>();
  for (const c of items) {
    const manual = c.rootCauseAnalysis?.manualVerifiedRootCause?.trim();
    if (manual) set.add(manual);
    c.rootCauseAnalysis?.hypotheses
      .filter((h) => h.managerStatus === 'Verified')
      .forEach((h) => {
        if (h.title.trim()) set.add(h.title.trim());
      });
  }
  return Array.from(set);
}

function countAiHypotheses(items: ComplaintRecord[]): number {
  return items.reduce(
    (acc, c) =>
      acc +
      (c.rootCauseAnalysis?.hypotheses.filter((h) => h.managerStatus !== 'Verified').length ?? 0),
    0
  );
}

function evaluateCapaFactor(
  items: ComplaintRecord[],
  capaRecords?: CAPARecord[]
): {
  normalizedRisk: number;
  dataStatus: PredictiveFactorDetail['dataStatus'];
  summary: string;
  missingNote?: string;
} {
  const itemIds = new Set(items.map((c) => c.id));
  const linkedCapas = (capaRecords ?? []).filter((cp) => itemIds.has(cp.complaintId));

  // If Stage-7 CAPARecords exist for these complaints, evaluate strictly on verified effectiveness.
  // Creating a new or in-progress CAPA never lowers risk until implemented and verified Effective.
  if (linkedCapas.length > 0) {
    const todayIso = new Date().toISOString().slice(0, 10);
    let effectiveCount = 0;
    let ineffectiveCount = 0;
    let inconclusiveCount = 0;
    let pendingCount = 0;
    let overdueCount = 0;
    let riskSum = 0;

    for (const cp of linkedCapas) {
      const effStatus = resolveEffectiveCapaStatus(cp, todayIso);
      const decision = cp.effectiveness.decision;
      if (decision === 'Effective' && effStatus === 'Effective') {
        effectiveCount += 1;
        riskSum += 0.12;
      } else if (decision === 'Ineffective' || effStatus === 'Ineffective') {
        ineffectiveCount += 1;
        riskSum += 1.0;
      } else if (decision === 'Inconclusive') {
        inconclusiveCount += 1;
        riskSum += 0.68;
      } else if (effStatus === 'Overdue') {
        overdueCount += 1;
        pendingCount += 1;
        riskSum += 0.82;
      } else {
        // New / Assigned / In Progress / Pending Verification — do NOT reduce risk
        pendingCount += 1;
        riskSum += 0.72;
      }
    }

    const avgRisk = riskSum / linkedCapas.length;
    if (effectiveCount === 0 && ineffectiveCount === 0 && inconclusiveCount === 0) {
      return {
        normalizedRisk: Number(Math.min(1, avgRisk).toFixed(3)),
        dataStatus: 'Partial Data',
        summary: `${pendingCount} CAPA(s) open/pending verification (${overdueCount} overdue) — risk not reduced until verified effective`,
        missingNote: `${pendingCount} CAPA record(s) still awaiting verified effectiveness evaluation.`,
      };
    }

    return {
      normalizedRisk: Number(Math.min(1, Math.max(0.1, avgRisk)).toFixed(3)),
      dataStatus: pendingCount > 0 ? 'Partial Data' : 'Measured',
      summary: `${effectiveCount} effective, ${inconclusiveCount} inconclusive, ${ineffectiveCount} ineffective (${pendingCount} pending)`,
      missingNote:
        pendingCount > 0 ? `${pendingCount} CAPA record(s) awaiting effectiveness verification.` : undefined,
    };
  }

  const activeActions = items.flatMap((c) =>
    c.capaActions.filter((a) => a.approvalStatus !== 'Rejected')
  );
  if (activeActions.length === 0) {
    const hasOpenOrRecurring = items.some((c) => c.status !== 'Closed') || items.length >= 2;
    return {
      normalizedRisk: hasOpenOrRecurring ? 0.72 : 0.45,
      dataStatus: 'Data Missing (Neutral Baseline)',
      summary: hasOpenOrRecurring
        ? 'No CAPA recorded despite open/repeated defects (elevated unmitigated baseline)'
        : 'No CAPA effectiveness records (neutral baseline applied — not zero risk)',
      missingNote: 'Missing CAPA effectiveness tracking; treated conservatively rather than zero risk.',
    };
  }

  const statuses = activeActions.map((a) => deriveEffectivenessStatus(a));
  const ineffective = statuses.filter((s) => s === 'Ineffective').length;
  const partial = statuses.filter((s) => s === 'Partially Effective').length;
  const verifiedEff = statuses.filter((s) => s === 'Verified Effective').length;
  const pending = statuses.filter((s) => s === 'Pending Verification Data').length;

  if (verifiedEff === 0 && ineffective === 0 && partial === 0) {
    return {
      normalizedRisk: 0.72,
      dataStatus: 'Partial Data',
      summary: `${pending} CAPA action(s) pending effectiveness verification (risk unchanged)`,
      missingNote: `${pending} CAPA action(s) lack post-implementation verification counts.`,
    };
  }

  const evaluatedCount = ineffective + partial + verifiedEff;
  const weightedFailure =
    (ineffective * 1.0 + partial * 0.65 + verifiedEff * 0.12 + pending * 0.72) /
    activeActions.length;

  return {
    normalizedRisk: Number(Math.min(1, Math.max(0.1, weightedFailure)).toFixed(3)),
    dataStatus: pending > 0 ? 'Partial Data' : 'Measured',
    summary: `${verifiedEff} effective, ${partial} partial, ${ineffective} ineffective (${evaluatedCount} evaluated)`,
    missingNote:
      pending > 0 ? `${pending} CAPA action(s) still awaiting post-CAPA monitoring data.` : undefined,
  };
}

function buildFactorBreakdown(
  items: ComplaintRecord[],
  cohortMaxCount: number,
  refDate: Date,
  recurringPatternHits: number,
  weights: RiskScoringWeights,
  capaRecords?: CAPARecord[]
): {
  riskScore: number;
  riskLevel: RiskTier;
  factorBreakdown: PredictiveFactorDetail[];
  trendDirection: 'Increasing' | 'Stable' | 'Decreasing' | 'Single Period';
  recent90Count: number;
  prior90Count: number;
  dataCompletenessPercent: number;
  missingDataNotes: string[];
  capaSummary: string;
} {
  const normW = normalizeWeights(weights);
  const total = items.length;
  const cutoff90 = new Date(refDate.getTime() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const cutoff180 = new Date(refDate.getTime() - 180 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const recent90Count = items.filter((c) => c.complaintDate >= cutoff90).length;
  const prior90Count = items.filter(
    (c) => c.complaintDate >= cutoff180 && c.complaintDate < cutoff90
  ).length;
  const criticalCount = items.filter((c) => c.severity === 'Critical').length;
  const unresolvedCritical = items.filter(
    (c) => c.severity === 'Critical' && c.status !== 'Closed'
  ).length;
  const unresolvedTotal = items.filter((c) => c.status !== 'Closed').length;

  // 1. Historical Complaint Frequency (default 25%)
  const freqNorm = Math.min(1, total / Math.max(1, cohortMaxCount));

  // 2. Complaint Severity (default 20%)
  const avgSev =
    items.reduce((acc, c) => acc + SEVERITY_SCORE_MAP[c.severity], 0) / Math.max(1, total);
  const peakBoost = criticalCount > 0 ? 0.12 : 0;
  const sevNorm = Math.min(1, avgSev + peakBoost);

  // 3. Recent Complaint Trend (default 20%)
  let trendDirection: 'Increasing' | 'Stable' | 'Decreasing' | 'Single Period' = 'Single Period';
  let trendNorm = 0.5;
  let trendDataStatus: PredictiveFactorDetail['dataStatus'] = 'Measured';
  const missingDataNotes: string[] = [];

  if (total === 1) {
    trendDirection = 'Single Period';
    trendNorm = recent90Count > 0 ? 0.55 : 0.35;
    trendDataStatus = 'Partial Data';
    missingDataNotes.push('Only 1 historical complaint recorded; temporal trend slope is limited.');
  } else if (recent90Count > prior90Count) {
    trendDirection = 'Increasing';
    const growth = (recent90Count - prior90Count) / Math.max(1, prior90Count);
    trendNorm = Math.min(1, 0.65 + Math.min(0.35, growth * 0.25));
  } else if (recent90Count === prior90Count && recent90Count > 0) {
    trendDirection = 'Stable';
    trendNorm = Math.min(0.75, 0.45 + recent90Count * 0.08);
  } else if (recent90Count < prior90Count && recent90Count > 0) {
    trendDirection = 'Decreasing';
    trendNorm = Math.max(0.25, 0.4 - (prior90Count - recent90Count) * 0.05);
  } else {
    trendDirection = 'Decreasing';
    trendNorm = 0.2;
  }

  // 4. Recurrence Rate (default 15%)
  const catCounts = new Map<ComplaintCategory, number>();
  for (const c of items) {
    catCounts.set(c.category, (catCounts.get(c.category) ?? 0) + 1);
  }
  const repeatedCategoryComplaints = Array.from(catCounts.values())
    .filter((n) => n >= 2)
    .reduce((a, b) => a + b, 0);
  const categoryRecurrenceRatio = total > 0 ? repeatedCategoryComplaints / total : 0;
  const patternBoost = Math.min(0.35, recurringPatternHits * 0.15);
  const recurrenceNorm =
    total <= 1
      ? 0.25 // sparse single-complaint baseline rather than zero risk
      : Math.min(1, categoryRecurrenceRatio * 0.75 + patternBoost);

  // 5. Unresolved Critical Complaints (default 10%)
  const unresolvedCritNorm = Math.min(
    1,
    unresolvedCritical * 0.42 + (unresolvedTotal - unresolvedCritical) * 0.1
  );

  // 6. Corrective Action Effectiveness (default 10%)
  const capaEval = evaluateCapaFactor(items, capaRecords);
  if (capaEval.missingNote) missingDataNotes.push(capaEval.missingNote);

  // Check telemetry/RCA completeness for transparency
  const missingTelemetryCount = items.filter(
    (c) => !c.machineId?.trim() || !c.processParameters?.trim() || !c.testResults?.trim()
  ).length;
  if (missingTelemetryCount > 0) {
    missingDataNotes.push(
      `${missingTelemetryCount} of ${total} record(s) lack full machine ID, parameter, or test result telemetry.`
    );
  }
  const verifiedRcs = getVerifiedRootCauses(items);
  if (verifiedRcs.length === 0) {
    missingDataNotes.push('No manager-verified root cause recorded yet for this cohort.');
  }

  const completenessChecks = [
    total >= 2,
    trendDataStatus === 'Measured',
    capaEval.dataStatus === 'Measured',
    missingTelemetryCount < total,
    verifiedRcs.length > 0,
  ];
  const dataCompletenessPercent = Math.round(
    (completenessChecks.filter(Boolean).length / completenessChecks.length) * 100
  );

  const factors: PredictiveFactorDetail[] = [
    {
      key: 'historicalFrequency',
      label: 'Historical Complaint Frequency',
      weightPercent: normW.historicalFrequency,
      normalizedScore: Number(freqNorm.toFixed(3)),
      contributionPoints: Number((freqNorm * normW.historicalFrequency).toFixed(1)),
      rawSummary: `${total} complaint(s) vs cohort max ${cohortMaxCount}`,
      dataStatus: 'Measured',
    },
    {
      key: 'complaintSeverity',
      label: 'Complaint Severity',
      weightPercent: normW.complaintSeverity,
      normalizedScore: Number(sevNorm.toFixed(3)),
      contributionPoints: Number((sevNorm * normW.complaintSeverity).toFixed(1)),
      rawSummary: `${criticalCount} Critical, ${items.filter((i) => i.severity === 'High').length} High of ${total}`,
      dataStatus: 'Measured',
    },
    {
      key: 'recentTrend',
      label: 'Recent Complaint Trend (90d)',
      weightPercent: normW.recentTrend,
      normalizedScore: Number(trendNorm.toFixed(3)),
      contributionPoints: Number((trendNorm * normW.recentTrend).toFixed(1)),
      rawSummary: `${recent90Count} in last 90d vs ${prior90Count} in prior 90d (${trendDirection})`,
      dataStatus: trendDataStatus,
    },
    {
      key: 'recurrenceRate',
      label: 'Recurrence Rate',
      weightPercent: normW.recurrenceRate,
      normalizedScore: Number(recurrenceNorm.toFixed(3)),
      contributionPoints: Number((recurrenceNorm * normW.recurrenceRate).toFixed(1)),
      rawSummary: `${Math.round(categoryRecurrenceRatio * 100)}% repeat-category share · ${recurringPatternHits} pattern cluster(s)`,
      dataStatus: total <= 1 ? 'Partial Data' : 'Measured',
    },
    {
      key: 'unresolvedCritical',
      label: 'Unresolved Critical Backlog',
      weightPercent: normW.unresolvedCritical,
      normalizedScore: Number(unresolvedCritNorm.toFixed(3)),
      contributionPoints: Number((unresolvedCritNorm * normW.unresolvedCritical).toFixed(1)),
      rawSummary: `${unresolvedCritical} open Critical · ${unresolvedTotal} total open`,
      dataStatus: 'Measured',
    },
    {
      key: 'capaEffectiveness',
      label: 'CAPA Effectiveness',
      weightPercent: normW.capaEffectiveness,
      normalizedScore: Number(capaEval.normalizedRisk.toFixed(3)),
      contributionPoints: Number((capaEval.normalizedRisk * normW.capaEffectiveness).toFixed(1)),
      rawSummary: capaEval.summary,
      dataStatus: capaEval.dataStatus,
    },
  ];

  const rawSum = factors.reduce((acc, f) => acc + f.contributionPoints, 0);
  const riskScore = Math.max(0, Math.min(100, Math.round(rawSum)));
  const riskLevel = classifyRiskLevel(riskScore);

  return {
    riskScore,
    riskLevel,
    factorBreakdown: factors,
    trendDirection,
    recent90Count,
    prior90Count,
    dataCompletenessPercent,
    missingDataNotes,
    capaSummary: capaEval.summary,
  };
}

function buildPreventiveMeasuresForCategories(
  entityName: string,
  topCategories: ComplaintCategory[],
  kind: 'Product' | 'Process'
): string[] {
  const measures: string[] = [];
  const primary = topCategories[0];

  if (primary === 'Dimensional Defects') {
    measures.push(`Additional dimensional inspection (100% first-off / last-off CMM tolerance gate) for ${entityName}.`);
    measures.push('CNC machine calibration checks, spindle runout audit, and cutting tool condition inspection.');
  } else if (primary === 'Material Defects') {
    measures.push(`Raw material quality verification & incoming metallurgical/NDT screening for ${entityName}.`);
    measures.push('Supplier quality review on raw stock lot certifications and heat-treatment bath logs.');
  } else if (primary === 'Performance Issues') {
    measures.push(`Increased sampling frequency and endurance load/thermal bench verification for ${entityName}.`);
    measures.push('Preventive machine maintenance on torque/lubrication stations and assembly fixture calibration.');
  } else if (primary === 'Packaging Issues' || primary === 'Delivery Issues') {
    measures.push(`Pre-dispatch barrier seal strength sampling and automated shipping pack audit for ${entityName}.`);
  } else {
    measures.push(`Employee process training refresh and layered process audit (LPA) for ${entityName}.`);
  }

  if (kind === 'Product') {
    measures.push('Batch-level quarantine screening for adjacent production lots sharing tooling or raw material.');
  } else {
    measures.push('Preventive machine maintenance schedule review and operator SPC control-limit verification.');
  }
  return measures;
}

// ---------- MODULE 2 & 6: PRODUCT RISK PREDICTION ----------

export function computeProductRiskAssessments(
  complaints: ComplaintRecord[],
  weights: RiskScoringWeights = DEFAULT_RISK_WEIGHTS,
  capaRecords?: CAPARecord[]
): ProductRiskAssessment[] {
  const unique = deduplicateComplaints(complaints);
  if (unique.length === 0) return [];

  const refDate = getReferenceDate(unique);
  const patterns = detectRecurringDefects(unique, { observationDays: 365, chronicThreshold: 3 });
  const recurringPatterns = patterns.filter((p) => p.classification !== 'New Problem');

  const grouped = new Map<string, ComplaintRecord[]>();
  for (const c of unique) {
    const list = grouped.get(c.productName) ?? [];
    list.push(c);
    grouped.set(c.productName, list);
  }

  const cohortMax = Math.max(1, ...Array.from(grouped.values()).map((items) => items.length));
  const results: ProductRiskAssessment[] = [];

  for (const [productName, items] of grouped.entries()) {
    const productPatterns = recurringPatterns.filter((p) =>
      p.affectedProducts.includes(productName)
    );
    const evalRes = buildFactorBreakdown(
      items,
      cohortMax,
      refDate,
      productPatterns.length,
      weights,
      capaRecords
    );

    const catCounts = new Map<ComplaintCategory, number>();
    const batches = new Set<string>();
    for (const c of items) {
      catCounts.set(c.category, (catCounts.get(c.category) ?? 0) + 1);
      if (c.batchNumber.trim()) batches.add(c.batchNumber.trim());
    }
    const sortedCats = Array.from(catCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([cat]) => cat);

    const verifiedRootCauses = getVerifiedRootCauses(items);
    const aiHypothesesCount = countAiHypotheses(items);
    const actions = buildPreventiveMeasuresForCategories(productName, sortedCats, 'Product');

    const topFactors = [...evalRes.factorBreakdown]
      .sort((a, b) => b.contributionPoints - a.contributionPoints)
      .slice(0, 3)
      .map((f) => `${f.label} (${f.contributionPoints}/${f.weightPercent})`);

    results.push({
      productId: items[0]?.productId || 'N/A',
      productName,
      totalComplaints: items.length,
      recent90DayComplaints: evalRes.recent90Count,
      prior90DayComplaints: evalRes.prior90Count,
      criticalComplaints: items.filter((c) => c.severity === 'Critical').length,
      unresolvedCriticalComplaints: items.filter(
        (c) => c.severity === 'Critical' && c.status !== 'Closed'
      ).length,
      openComplaints: items.filter((c) => c.status !== 'Closed').length,
      affectedBatchesCount: batches.size,
      affectedBatches: Array.from(batches),
      recurringDefectsCount: productPatterns.length,
      verifiedRootCauses,
      aiHypothesesCount,
      trendDirection: evalRes.trendDirection,
      capaEffectivenessSummary: evalRes.capaSummary,
      riskScore: evalRes.riskScore,
      riskLevel: evalRes.riskLevel,
      dataCompletenessPercent: evalRes.dataCompletenessPercent,
      missingDataNotes: evalRes.missingDataNotes,
      factorBreakdown: evalRes.factorBreakdown,
      mainRiskFactors: topFactors,
      possibleFutureCategories: sortedCats.slice(0, 3),
      recommendedPreventiveAction: actions[0],
      recommendedPreventiveActions: actions,
      complaints: [...items].sort((a, b) => b.complaintDate.localeCompare(a.complaintDate)),
    });
  }

  return results.sort((a, b) => b.riskScore - a.riskScore || b.totalComplaints - a.totalComplaints);
}

// ---------- MODULE 3: MANUFACTURING PROCESS RISK PREDICTION ----------

export function computeProcessRiskAssessments(
  complaints: ComplaintRecord[],
  weights: RiskScoringWeights = DEFAULT_RISK_WEIGHTS,
  capaRecords?: CAPARecord[]
): ProcessRiskAssessment[] {
  const unique = deduplicateComplaints(complaints);
  const refDate = getReferenceDate(unique);
  const patterns = detectRecurringDefects(unique, { observationDays: 365, chronicThreshold: 3 });
  const recurringPatterns = patterns.filter((p) => p.classification !== 'New Problem');

  const byFamily = new Map<string, ComplaintRecord[]>();
  for (const fam of STANDARD_PROCESS_FAMILIES) {
    byFamily.set(fam, []);
  }
  for (const c of unique) {
    const fam = classifyStandardProcessFamily(c.processName);
    const key = fam === 'Other' ? c.processName || 'Other' : fam;
    const arr = byFamily.get(key) ?? [];
    arr.push(c);
    byFamily.set(key, arr);
  }

  const cohortMax = Math.max(
    1,
    ...Array.from(byFamily.values()).map((items) => items.length)
  );

  const results: ProcessRiskAssessment[] = [];

  for (const [processName, items] of byFamily.entries()) {
    if (items.length === 0) {
      results.push({
        processName,
        observedShopProcesses: [],
        complaintCount: 0,
        criticalComplaints: 0,
        openComplaints: 0,
        unresolvedCriticalComplaints: 0,
        recurringDefectsCount: 0,
        verifiedRootCauses: [],
        aiHypothesesCount: 0,
        associatedDefectModes: [],
        trendDirection: 'Insufficient Data',
        riskScore: null,
        riskLevel: 'INSUFFICIENT DATA',
        dataCompletenessPercent: 0,
        missingDataNotes: [
          `No complaints associated with ${processName} in current dataset. Risk score withheld rather than assuming zero defect risk.`,
        ],
        factorBreakdown: [],
        mainRiskFactors: ['No associated complaint records available'],
        suggestedPreventiveMeasures: [
          `Maintain scheduled preventive maintenance & SPC sampling for ${processName}.`,
        ],
        complaints: [],
      });
      continue;
    }

    const shopVariants = Array.from(new Set(items.map((c) => c.processName)));
    const procPatterns = recurringPatterns.filter((p) =>
      p.relatedProcesses.some((rp) => shopVariants.includes(rp))
    );
    const evalRes = buildFactorBreakdown(
      items,
      cohortMax,
      refDate,
      procPatterns.length,
      weights,
      capaRecords
    );

    const catCounts = new Map<ComplaintCategory, number>();
    const machineCounts = new Map<string, number>();
    for (const c of items) {
      catCounts.set(c.category, (catCounts.get(c.category) ?? 0) + 1);
      if (c.machineId?.trim()) {
        machineCounts.set(c.machineId.trim(), (machineCounts.get(c.machineId.trim()) ?? 0) + 1);
      }
    }
    const sortedCats = Array.from(catCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([cat]) => cat);

    const repeatedMachines = Array.from(machineCounts.entries())
      .filter(([, cnt]) => cnt >= 2)
      .map(([m, cnt]) => `${m} (${cnt}×)`);

    const associatedDefectModes: string[] = [];
    if ((catCounts.get('Dimensional Defects') ?? 0) >= 2) {
      associatedDefectModes.push(`Repeated dimensional defects (${catCounts.get('Dimensional Defects')})`);
    }
    if ((catCounts.get('Material Defects') ?? 0) >= 2) {
      associatedDefectModes.push(`Repeated material defects (${catCounts.get('Material Defects')})`);
    }
    if (repeatedMachines.length > 0) {
      associatedDefectModes.push(`Repeated machine associations: ${repeatedMachines.join(', ')}`);
    }
    if (evalRes.trendDirection === 'Increasing') {
      associatedDefectModes.push('Increasing recent 90-day frequency');
    }
    if (associatedDefectModes.length === 0) {
      associatedDefectModes.push(sortedCats[0] ?? 'Observed complaint cluster');
    }

    const verifiedRootCauses = getVerifiedRootCauses(items);
    const aiHypothesesCount = countAiHypotheses(items);
    const topFactors = [...evalRes.factorBreakdown]
      .sort((a, b) => b.contributionPoints - a.contributionPoints)
      .slice(0, 3)
      .map((f) => `${f.label} (${f.contributionPoints}/${f.weightPercent})`);

    results.push({
      processName,
      observedShopProcesses: shopVariants,
      complaintCount: items.length,
      criticalComplaints: items.filter((c) => c.severity === 'Critical').length,
      openComplaints: items.filter((c) => c.status !== 'Closed').length,
      unresolvedCriticalComplaints: items.filter(
        (c) => c.severity === 'Critical' && c.status !== 'Closed'
      ).length,
      recurringDefectsCount: procPatterns.length,
      verifiedRootCauses,
      aiHypothesesCount,
      associatedDefectModes,
      trendDirection:
        evalRes.trendDirection === 'Single Period' ? 'Insufficient Data' : evalRes.trendDirection,
      riskScore: evalRes.riskScore,
      riskLevel: evalRes.riskLevel,
      dataCompletenessPercent: evalRes.dataCompletenessPercent,
      missingDataNotes: evalRes.missingDataNotes,
      factorBreakdown: evalRes.factorBreakdown,
      mainRiskFactors: topFactors,
      suggestedPreventiveMeasures: buildPreventiveMeasuresForCategories(
        processName,
        sortedCats,
        'Process'
      ),
      complaints: [...items].sort((a, b) => b.complaintDate.localeCompare(a.complaintDate)),
    });
  }

  return results.sort((a, b) => {
    const scoreA = a.riskScore ?? -1;
    const scoreB = b.riskScore ?? -1;
    return scoreB - scoreA || b.complaintCount - a.complaintCount;
  });
}

// ---------- MODULE 4: BATCH RISK ASSESSMENT ----------

export function computeBatchRiskAssessments(
  complaints: ComplaintRecord[],
  productRisks: ProductRiskAssessment[]
): BatchRiskAssessment[] {
  const unique = deduplicateComplaints(complaints);
  const productRiskMap = new Map(productRisks.map((p) => [p.productName, p]));

  const byBatch = new Map<string, ComplaintRecord[]>();
  for (const c of unique) {
    const key = c.batchNumber.trim() || 'UNSPECIFIED';
    const arr = byBatch.get(key) ?? [];
    arr.push(c);
    byBatch.set(key, arr);
  }

  const assessments: BatchRiskAssessment[] = [];

  for (const [batchNumber, items] of byBatch.entries()) {
    const anchor = items[0];
    const productAssessment = productRiskMap.get(anchor.productName);
    const machineIds = Array.from(
      new Set(items.map((i) => i.machineId?.trim()).filter((m): m is string => Boolean(m)))
    );

    const hasMfgDate = Boolean(anchor.manufacturingDate?.trim() && anchor.manufacturingDate !== '—');
    const hasProcess = Boolean(anchor.processName?.trim());
    const hasParams = items.some((i) => Boolean(i.processParameters?.trim()));
    const hasTests = items.some(
      (i) => Boolean(i.testResults?.trim()) || Boolean(i.actualValue?.trim())
    );
    const hasMachine = machineIds.length > 0;

    const telemetryAvailable: string[] = [];
    const missingFields: string[] = [];
    if (hasMfgDate) telemetryAvailable.push(`Mfg Date: ${anchor.manufacturingDate}`);
    else missingFields.push('Manufacturing Date');
    if (hasMachine) telemetryAvailable.push(`Machine: ${machineIds.join(', ')}`);
    else missingFields.push('Machine ID');
    if (hasParams) telemetryAvailable.push('Process Parameters');
    else missingFields.push('Process Parameters');
    if (hasTests) telemetryAvailable.push('Inspection / Test Results');
    else missingFields.push('Inspection / Test Results');

    const verifiedRootCauses = getVerifiedRootCauses(items);
    const hasOpenDefect = items.some((i) => i.status !== 'Closed');
    const hasFailedInspection = items.some((i) => {
      const text = `${i.testResults ?? ''} ${i.description ?? ''}`.toLowerCase();
      return /fail|out of spec|exceed|crack|defect|leak|burr|void|delaminat/.test(text);
    });

    // Insufficient batch info guard
    if (batchNumber === 'UNSPECIFIED' || (!hasMfgDate && !hasParams && !hasTests && items.length < 2)) {
      assessments.push({
        batchNumber,
        productId: anchor.productId,
        productName: anchor.productName,
        manufacturingDate: anchor.manufacturingDate || 'Not Recorded',
        processName: anchor.processName || 'Not Recorded',
        machineIds,
        assessmentStatus: 'Insufficient Batch Information',
        riskScore: null,
        riskLevel: 'INSUFFICIENT DATA',
        telemetryAvailable,
        missingFields,
        riskFactors: [
          `Insufficient batch telemetry (${missingFields.join(', ')} missing) — risk score withheld.`,
        ],
        verifiedRootCauses,
        recommendedInspection:
          'Obtain batch router, machine ID, and receiving inspection sheets before releasing stock.',
        complaints: items,
      });
      continue;
    }

    // Score calculation combining batch defect evidence + parent product/process pattern exposure
    const sevMax = Math.max(...items.map((i) => SEVERITY_SCORE_MAP[i.severity]));
    const multiBatchComplaintScore = items.length >= 2 ? 25 : 10;
    const severityPoints = sevMax * 25;
    const openDefectPoints = hasOpenDefect ? 18 : 6;
    const productExposurePoints = ((productAssessment?.riskScore ?? 40) / 100) * 20;
    const missingPenalty = !hasParams || !hasTests ? 8 : 0; // conservative uncertainty when telemetry sparse

    const rawScore =
      multiBatchComplaintScore +
      severityPoints +
      openDefectPoints +
      productExposurePoints +
      missingPenalty;
    const riskScore = Math.max(0, Math.min(100, Math.round(rawScore)));
    const riskLevel = classifyRiskLevel(riskScore);

    let assessmentStatus: BatchAssessmentStatus;
    if (verifiedRootCauses.length > 0 || (hasOpenDefect && hasFailedInspection)) {
      assessmentStatus = 'Confirmed Defect History';
    } else if (riskScore >= 45 || (productAssessment?.riskLevel === 'HIGH' && hasOpenDefect)) {
      assessmentStatus = 'Estimated Elevated Risk';
    } else {
      assessmentStatus = 'Monitored Baseline';
    }

    const riskFactors: string[] = [];
    if (items.length >= 2) {
      riskFactors.push(`${items.length} customer complaints linked to this batch`);
    } else {
      riskFactors.push(`1 customer complaint linked (${anchor.severity} severity)`);
    }
    if (productAssessment && productAssessment.recurringDefectsCount > 0) {
      riskFactors.push(
        `Product exhibits ${productAssessment.recurringDefectsCount} recurring defect pattern(s)`
      );
    }
    if (hasOpenDefect) riskFactors.push('Contains unresolved complaint(s)');
    if (verifiedRootCauses.length > 0) {
      riskFactors.push(`Verified RC: ${verifiedRootCauses[0]}`);
    }
    if (missingFields.length > 0) {
      riskFactors.push(`Missing telemetry: ${missingFields.join(', ')}`);
    }

    let recommendedInspection = 'Standard sampling verification per control plan.';
    if (assessmentStatus === 'Confirmed Defect History') {
      recommendedInspection = `Immediate 100% quarantine sorting & ${anchor.testType || 'dimensional/NDT'} re-inspection for ${batchNumber} remnants.`;
    } else if (riskLevel === 'HIGH') {
      recommendedInspection = `Perform tightened AQL inspection on ${batchNumber} and adjacent ${anchor.processName} lots.`;
    } else if (riskLevel === 'MEDIUM') {
      recommendedInspection = `Verify ${anchor.testType || 'critical-to-quality'} parameters on next outgoing sample of ${batchNumber}.`;
    }

    assessments.push({
      batchNumber,
      productId: anchor.productId,
      productName: anchor.productName,
      manufacturingDate: anchor.manufacturingDate || 'Not Recorded',
      processName: anchor.processName,
      machineIds,
      assessmentStatus,
      riskScore,
      riskLevel,
      telemetryAvailable,
      missingFields,
      riskFactors,
      verifiedRootCauses,
      recommendedInspection,
      complaints: items,
    });
  }

  return assessments.sort((a, b) => {
    const scoreA = a.riskScore ?? -1;
    const scoreB = b.riskScore ?? -1;
    return scoreB - scoreA || b.complaints.length - a.complaints.length;
  });
}

// ---------- MODULE 5: DETERMINISTIC MONTHLY TIME-SERIES FORECASTING ----------

function addMonths(ym: string, offset: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function predictSingleStep(
  history: number[],
  method: ForecastMethodId,
  horizonStep: number
): number {
  const n = history.length;
  if (n === 0) return 0;

  if (method === 'moving_average') {
    const window = history.slice(-Math.min(3, n));
    const avg = window.reduce((a, b) => a + b, 0) / window.length;
    return Math.max(0, avg);
  }

  if (method === 'exponential_smoothing') {
    const alpha = 0.4;
    let level = history[0];
    for (let i = 1; i < n; i++) {
      level = alpha * history[i] + (1 - alpha) * level;
    }
    return Math.max(0, level);
  }

  // Linear Trend (Ordinary Least Squares over time index t = 0..n-1)
  if (n < 2) return Math.max(0, history[0]);
  const meanX = (n - 1) / 2;
  const meanY = history.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - meanX;
    num += dx * (history[i] - meanY);
    den += dx * dx;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  return Math.max(0, intercept + slope * (n - 1 + horizonStep));
}

export function computeMonthlyComplaintForecast(
  complaints: ComplaintRecord[],
  method: ForecastMethodId = 'exponential_smoothing'
): TimeSeriesForecastResult {
  const unique = deduplicateComplaints(complaints);
  const monthCounts = new Map<string, number>();

  for (const c of unique) {
    const ym = c.complaintDate.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(ym)) {
      monthCounts.set(ym, (monthCounts.get(ym) ?? 0) + 1);
    }
  }

  const rawMonths = Array.from(monthCounts.keys()).sort();
  const methodLabel =
    method === 'moving_average'
      ? '3-Month Moving Average (SMA-3)'
      : method === 'exponential_smoothing'
        ? 'Exponential Smoothing (alpha = 0.40)'
        : 'Linear Trend Regression (OLS)';

  if (rawMonths.length < 3) {
    return {
      sufficientData: false,
      insufficientReason: `Only ${rawMonths.length} distinct month(s) of complaint data available. At least 3 historical months are required to generate mathematical forecasts without inventing trends.`,
      methodUsed: method,
      methodLabel,
      historicalMonthsCount: rawMonths.length,
      observedStartMonth: rawMonths[0] ?? 'N/A',
      observedEndMonth: rawMonths[rawMonths.length - 1] ?? 'N/A',
      trendDirection: 'Insufficient Data',
      trendSlopePerMonth: 0,
      backtestMetrics: {
        evaluatedMonths: 0,
        mae: null,
        rmse: null,
        note: 'Insufficient historical months for walk-forward evaluation.',
      },
      horizons: [],
      timeline: rawMonths.map((m) => ({
        month: m,
        label: formatMonthLabel(m),
        actualCount: monthCounts.get(m) ?? 0,
        predictedCount: null,
        lowerBound: null,
        upperBound: null,
        isForecast: false,
      })),
    };
  }

  // Build continuous calendar month sequence from first to latest month
  const startYm = rawMonths[0];
  const endYm = rawMonths[rawMonths.length - 1];
  const continuousMonths: string[] = [];
  let cursor = startYm;
  let safety = 0;
  while (cursor <= endYm && safety < 120) {
    continuousMonths.push(cursor);
    cursor = addMonths(cursor, 1);
    safety++;
  }

  const series = continuousMonths.map((m) => monthCounts.get(m) ?? 0);
  const n = series.length;

  // Walk-forward time-based backtest starting from index 3
  const errors: number[] = [];
  for (let t = 3; t < n; t++) {
    const train = series.slice(0, t);
    const pred = predictSingleStep(train, method, 1);
    errors.push(series[t] - pred);
  }

  const mae =
    errors.length > 0
      ? Number((errors.reduce((acc, e) => acc + Math.abs(e), 0) / errors.length).toFixed(2))
      : null;
  const rmse =
    errors.length > 0
      ? Number(
          Math.sqrt(errors.reduce((acc, e) => acc + e * e, 0) / errors.length).toFixed(2)
        )
      : null;

  const sampleStd = (() => {
    const mean = series.reduce((a, b) => a + b, 0) / n;
    const variance = series.reduce((acc, v) => acc + (v - mean) ** 2, 0) / Math.max(1, n - 1);
    return Math.sqrt(variance);
  })();
  const sigma = rmse !== null && rmse > 0 ? rmse : Math.max(0.8, sampleStd);

  // Slope over historical window
  const meanX = (n - 1) / 2;
  const meanY = series.reduce((a, b) => a + b, 0) / n;
  let slopeNum = 0;
  let slopeDen = 0;
  for (let i = 0; i < n; i++) {
    slopeNum += (i - meanX) * (series[i] - meanY);
    slopeDen += (i - meanX) ** 2;
  }
  const slope = slopeDen === 0 ? 0 : Number((slopeNum / slopeDen).toFixed(2));
  const trendDirection: TimeSeriesForecastResult['trendDirection'] =
    slope > 0.12 ? 'Increasing' : slope < -0.12 ? 'Decreasing' : 'Stable';

  const timeline: ForecastTimelinePoint[] = continuousMonths.map((m, idx) => ({
    month: m,
    label: formatMonthLabel(m),
    actualCount: series[idx],
    predictedCount: idx === n - 1 ? series[idx] : null,
    lowerBound: idx === n - 1 ? series[idx] : null,
    upperBound: idx === n - 1 ? series[idx] : null,
    isForecast: false,
  }));

  const futurePoints: Array<{ pred: number; low: number; high: number }> = [];
  let rollingSeries = [...series];
  for (let h = 1; h <= 6; h++) {
    const rawPred =
      method === 'linear_trend'
        ? predictSingleStep(series, method, h)
        : predictSingleStep(rollingSeries, method, 1);
    const predRounded = Number(rawPred.toFixed(1));
    const margin = Number((1.28 * sigma * Math.sqrt(h)).toFixed(1)); // ~80% empirical prediction band expanding with sqrt(h)
    const lowerBound = Number(Math.max(0, predRounded - margin).toFixed(1));
    const upperBound = Number((predRounded + margin).toFixed(1));
    const futureMonth = addMonths(endYm, h);

    timeline.push({
      month: futureMonth,
      label: formatMonthLabel(futureMonth),
      actualCount: null,
      predictedCount: predRounded,
      lowerBound,
      upperBound,
      isForecast: true,
    });

    futurePoints.push({ pred: predRounded, low: lowerBound, high: upperBound });
    rollingSeries = [...rollingSeries, predRounded];
  }

  const buildHorizon = (
    horizonLabel: ForecastHorizonSummary['horizonLabel'],
    monthsAhead: number
  ): ForecastHorizonSummary => {
    const slice = futurePoints.slice(0, monthsAhead);
    const predictedTotal = Math.round(slice.reduce((a, p) => a + p.pred, 0));
    const lowerBoundTotal = Math.max(0, Math.floor(slice.reduce((a, p) => a + p.low, 0)));
    const upperBoundTotal = Math.ceil(slice.reduce((a, p) => a + p.high, 0));
    return {
      horizonLabel,
      monthsAhead,
      predictedTotal,
      monthlyAverage: Number((predictedTotal / monthsAhead).toFixed(1)),
      lowerBoundTotal,
      upperBoundTotal,
    };
  };

  return {
    sufficientData: true,
    methodUsed: method,
    methodLabel,
    historicalMonthsCount: n,
    observedStartMonth: startYm,
    observedEndMonth: endYm,
    trendDirection,
    trendSlopePerMonth: slope,
    backtestMetrics: {
      evaluatedMonths: errors.length,
      mae,
      rmse,
      note:
        errors.length > 0
          ? `Walk-forward 1-step holdout across ${errors.length} historical month(s).`
          : 'Fewer than 4 continuous months; backtest error approximated via sample standard deviation.',
    },
    horizons: [
      buildHorizon('Next Month', 1),
      buildHorizon('Next 3 Months', 3),
      buildHorizon('Next 6 Months', 6),
    ],
    timeline,
  };
}

// ---------- MODULE 7: PREDICTIVE ALERT CANDIDATE GENERATOR ----------

function shortHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).toUpperCase().slice(0, 6);
}

export function detectPredictiveAlertCandidates(
  complaints: ComplaintRecord[],
  productRisks: ProductRiskAssessment[],
  processRisks: ProcessRiskAssessment[],
  batchRisks: BatchRiskAssessment[],
  capaRecords?: CAPARecord[]
): PredictiveAlert[] {
  const unique = deduplicateComplaints(complaints);
  const todayIso = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();
  const candidates: PredictiveAlert[] = [];

  // 1. High-risk products
  productRisks
    .filter((p) => p.riskLevel === 'HIGH')
    .forEach((p) => {
      candidates.push({
        id: `ALT-PROD-${p.productId}`,
        conditionKey: `HIGH_PRODUCT:${p.productName}`,
        alertType: 'High-Risk Product',
        targetEntity: p.productName,
        targetKind: 'Product',
        riskLevel: 'HIGH',
        reason: `Risk score ${p.riskScore}/100 across ${p.totalComplaints} complaints (${p.unresolvedCriticalComplaints} unresolved Critical).`,
        detectionDate: todayIso,
        recommendedAction: p.recommendedPreventiveAction,
        status: 'New',
        assignedTo: 'R. Deshmukh',
        investigationNotes: '',
        updatedAt: nowIso,
      });
    });

  // 2. Increasing process trends
  processRisks
    .filter((pr) => pr.trendDirection === 'Increasing' && pr.riskLevel !== 'INSUFFICIENT DATA')
    .forEach((pr) => {
      candidates.push({
        id: `ALT-PROC-${pr.processName.replace(/\s+/g, '-').toUpperCase()}`,
        conditionKey: `PROC_TREND:${pr.processName}`,
        alertType: 'Increasing Process Trend',
        targetEntity: pr.processName,
        targetKind: 'Process',
        riskLevel: pr.riskLevel === 'HIGH' ? 'HIGH' : 'MEDIUM',
        reason: `Recent 90-day complaints increased for ${pr.processName} (${pr.complaintCount} total, risk ${pr.riskScore}/100).`,
        detectionDate: todayIso,
        recommendedAction: pr.suggestedPreventiveMeasures[0] ?? 'Conduct layered process audit.',
        status: 'New',
        assignedTo: 'Process Engineering Lead',
        investigationNotes: '',
        updatedAt: nowIso,
      });
    });

  // 3. Multiple batches showing similar defects (product + category across >= 2 distinct batches)
  const batchClusters = new Map<string, { product: string; category: string; batches: Set<string>; severity: RiskTier }>();
  for (const c of unique) {
    const key = `${c.productName}__${c.category}`;
    const cur = batchClusters.get(key) ?? {
      product: c.productName,
      category: c.category,
      batches: new Set<string>(),
      severity: 'MEDIUM',
    };
    if (c.batchNumber.trim()) cur.batches.add(c.batchNumber.trim());
    if (c.severity === 'Critical') cur.severity = 'HIGH';
    batchClusters.set(key, cur);
  }
  for (const [key, cluster] of batchClusters.entries()) {
    if (cluster.batches.size >= 2) {
      const slug = key
        .replace(/[^A-Z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 18)
        .toUpperCase();
      candidates.push({
        id: `ALT-BATCH-${slug}-${shortHash(key)}`,
        conditionKey: `MULTI_BATCH:${key}`,
        alertType: 'Multi-Batch Defect Cluster',
        targetEntity: `${cluster.product} (${cluster.batches.size} batches)`,
        targetKind: 'Batch',
        riskLevel: cluster.severity,
        reason: `${cluster.batches.size} distinct production batches affected by ${cluster.category}.`,
        detectionDate: todayIso,
        recommendedAction: `Audit shared tooling/material lots across batches: ${Array.from(cluster.batches).slice(0, 3).join(', ')}.`,
        status: 'New',
        assignedTo: 'Supplier & Incoming QA',
        investigationNotes: '',
        updatedAt: nowIso,
      });
    }
  }

  // 4. Recurring / Chronic defects
  const patterns = detectRecurringDefects(unique, { observationDays: 365, chronicThreshold: 3 });
  patterns
    .filter((pt) => pt.classification === 'Chronic Problem')
    .slice(0, 6)
    .forEach((pt) => {
      candidates.push({
        id: `ALT-REC-${pt.patternId}`,
        conditionKey: `CHRONIC_PATTERN:${pt.patternTitle}`,
        alertType: 'Recurring Defect Pattern',
        targetEntity: pt.affectedProducts[0] || pt.patternTitle,
        targetKind: 'Product',
        riskLevel: 'HIGH',
        reason: `Chronic pattern (${pt.occurrences} occurrences from ${pt.firstOccurrence} to ${pt.mostRecentOccurrence}).`,
        detectionDate: todayIso,
        recommendedAction: `Verify systemic root cause across ${pt.relatedProcesses.join(', ')} and audit prior CAPA effectiveness.`,
        status: 'New',
        assignedTo: 'R. Deshmukh',
        investigationNotes: '',
        updatedAt: nowIso,
      });
    });

  // 5. Unresolved critical complaints
  unique
    .filter((c) => c.severity === 'Critical' && c.status !== 'Closed')
    .forEach((c) => {
      candidates.push({
        id: `ALT-CRIT-${c.id}`,
        conditionKey: `UNRESOLVED_CRITICAL:${c.id}`,
        alertType: 'Unresolved Critical Complaint',
        targetEntity: `${c.id} · ${c.productName}`,
        targetKind: 'Product',
        riskLevel: 'HIGH',
        reason: `Critical complaint remains "${c.status}" (Batch ${c.batchNumber}, customer ${c.customerName}).`,
        detectionDate: c.complaintDate,
        recommendedAction: `Expedite containment & verified root cause closure for ${c.id}.`,
        status: 'New',
        assignedTo: c.assignedManager || 'R. Deshmukh',
        investigationNotes: '',
        updatedAt: nowIso,
      });
    });

  // 6. Previously implemented CAPA appears ineffective OR Critical/High CAPA is Overdue
  const coveredComplaintIds = new Set((capaRecords ?? []).map((cp) => cp.complaintId));

  (capaRecords ?? []).forEach((cp) => {
    const effStatus = resolveEffectiveCapaStatus(cp, todayIso);
    if (cp.effectiveness.decision === 'Ineffective' || effStatus === 'Ineffective') {
      const recurringCount = unique.filter(
        (c) =>
          c.id !== cp.complaintId &&
          c.productName === cp.productName &&
          c.category === cp.defectCategory &&
          c.complaintDate >= cp.createdDate
      ).length;
      candidates.push({
        id: `ALT-CAPA-INEFF-${cp.id}`,
        conditionKey: `INEFFECTIVE_CAPA:${cp.id}`,
        alertType: 'Ineffective CAPA',
        targetEntity: `${cp.id} · ${cp.productName}`,
        targetKind: 'CAPA',
        riskLevel: 'HIGH',
        reason: `CAPA ${cp.id} evaluated as Ineffective (Before: ${cp.effectiveness.complaintsBefore}, After: ${cp.effectiveness.complaintsAfter ?? 'Pending'})${recurringCount > 0 ? ` with ${recurringCount} subsequent ${cp.defectCategory} complaint(s)` : ''}.`,
        detectionDate: cp.effectiveness.verifiedDate?.slice(0, 10) || todayIso,
        recommendedAction: `Re-open root cause verification for ${cp.complaintId} (${cp.manufacturingProcess}) and issue revised containment & corrective action.`,
        status: 'New',
        assignedTo: cp.owner || 'R. Deshmukh',
        investigationNotes: '',
        updatedAt: nowIso,
      });
    }

    if (
      effStatus === 'Overdue' &&
      (cp.priority === 'Urgent' || cp.priority === 'High')
    ) {
      candidates.push({
        id: `ALT-CAPA-OVD-${cp.id}`,
        conditionKey: `OVERDUE_CRITICAL_CAPA:${cp.id}`,
        alertType: 'Overdue Critical CAPA',
        targetEntity: `${cp.id} · ${cp.productName}`,
        targetKind: 'CAPA',
        riskLevel: 'HIGH',
        reason: `${cp.priority} priority CAPA (${cp.responsibleDepartment}) passed target completion date ${cp.targetCompletionDate} at ${cp.progressPercent}% progress.`,
        detectionDate: todayIso,
        recommendedAction: `Escalate overdue ${cp.priority} CAPA ${cp.id} with ${cp.owner} and verify containment controls for Batch ${cp.batchNumber}.`,
        status: 'New',
        assignedTo: cp.owner || 'R. Deshmukh',
        investigationNotes: '',
        updatedAt: nowIso,
      });
    }
  });

  unique.forEach((c) => {
    if (coveredComplaintIds.has(c.id)) return;
    c.capaActions
      .filter((a) => a.approvalStatus !== 'Rejected')
      .forEach((a) => {
        const eff = deriveEffectivenessStatus(a);
        if (eff === 'Ineffective') {
          candidates.push({
            id: `ALT-CAPA-${a.id}`,
            conditionKey: `INEFFECTIVE_CAPA:${a.id}`,
            alertType: 'Ineffective CAPA',
            targetEntity: `${c.productName} (${c.id})`,
            targetKind: 'CAPA',
            riskLevel: 'HIGH',
            reason: `CAPA "${a.title}" evaluated as Ineffective (Before: ${a.effectivenessTracking.complaintsBefore}, After: ${a.effectivenessTracking.complaintsAfter}).`,
            detectionDate: a.effectivenessTracking.evaluatedAt?.slice(0, 10) || todayIso,
            recommendedAction: `Re-open root cause verification for ${c.id} and replace ineffective corrective action.`,
            status: 'New',
            assignedTo: a.responsiblePerson || 'R. Deshmukh',
            investigationNotes: '',
            updatedAt: nowIso,
          });
        }
      });
  });

  // Batch high risk highlight if not already covered
  batchRisks
    .filter((b) => b.assessmentStatus === 'Estimated Elevated Risk' && b.riskLevel === 'HIGH')
    .slice(0, 3)
    .forEach((b) => {
      candidates.push({
        id: `ALT-BEST-${b.batchNumber}-${shortHash(`${b.batchNumber}:${b.productId}`)}`,
        conditionKey: `BATCH_EST:${b.batchNumber}:${b.productId}`,
        alertType: 'Multi-Batch Defect Cluster',
        targetEntity: `${b.batchNumber} (${b.productName})`,
        targetKind: 'Batch',
        riskLevel: 'HIGH',
        reason: `Estimated elevated batch risk (${b.riskScore}/100) based on parent product and process pattern.`,
        detectionDate: todayIso,
        recommendedAction: b.recommendedInspection,
        status: 'New',
        assignedTo: 'Inspection Lab Lead',
        investigationNotes: '',
        updatedAt: nowIso,
      });
    });

  // 7. Post-CAPA recurrence & compromised previously-Effective CAPA alerts (Stage 8)
  if ((capaRecords ?? []).length > 0) {
    const postCapaRecurrences = detectPostCapaRecurrences(unique, capaRecords ?? []);
    postCapaRecurrences
      .filter((m) => m.classification === 'Confirmed Recurrence')
      .slice(0, 8)
      .forEach((m) => {
        const wasMarkedEffective = m.relatedCapaDecision === 'Effective' || m.relatedCapaStatus === 'Effective';
        candidates.push({
          id: `ALT-POSTCAPA-${m.relatedCapaId}-${m.complaintId}`,
          conditionKey: `POST_CAPA_REC:${m.relatedCapaId}:${m.complaintId}`,
          alertType: 'Post-CAPA Recurrence',
          targetEntity: `${m.relatedCapaId} -> ${m.complaintId} (${m.productName})`,
          targetKind: 'CAPA',
          riskLevel: 'HIGH',
          reason: wasMarkedEffective
            ? `Previously Effective CAPA ${m.relatedCapaId} appears ineffective due to recurring complaint ${m.complaintId} (${m.matchDimensions.join(', ')}).`
            : `Confirmed recurring ${m.category} complaint ${m.complaintId} occurred after CAPA ${m.relatedCapaId} (${m.capaReferenceDate}).`,
          detectionDate: m.complaintDate,
          recommendedAction: `Re-evaluate CAPA ${m.relatedCapaId} effectiveness, re-verify root cause, and check containment on Batch ${m.batchNumber}.`,
          status: 'New',
          assignedTo: 'R. Deshmukh',
          investigationNotes: '',
          updatedAt: nowIso,
        });
      });

    // 8. Verification period completed & awaiting effectiveness review
    (capaRecords ?? []).forEach((cp) => {
      const effSt = resolveEffectiveCapaStatus(cp, todayIso);
      const completionRef = cp.actualCompletionDate || cp.targetCompletionDate;
      if (
        cp.managerCompletionApproved &&
        cp.effectiveness.decision === 'Pending' &&
        (effSt === 'Pending Verification' || (completionRef && completionRef <= todayIso))
      ) {
        candidates.push({
          id: `ALT-VERIF-${cp.id}`,
          conditionKey: `VERIF_DUE:${cp.id}`,
          alertType: 'Verification Period Completed',
          targetEntity: `${cp.id} · ${cp.productName}`,
          targetKind: 'CAPA',
          riskLevel: cp.priority === 'Urgent' || cp.priority === 'High' ? 'HIGH' : 'MEDIUM',
          reason: `CAPA ${cp.id} implementation is complete (${cp.effectiveness.postPeriod || 'monitoring period'}) and awaits Quality Manager effectiveness verification.`,
          detectionDate: todayIso,
          recommendedAction: `Record post-CAPA complaint count and verification evidence for ${cp.id} in Effectiveness Monitoring.`,
          status: 'New',
          assignedTo: cp.owner || 'R. Deshmukh',
          investigationNotes: '',
          updatedAt: nowIso,
        });
      }
    });
  }

  return candidates;
}

// ---------- MODULE 9: PREVENTIVE ACTION CANDIDATE GENERATOR ----------

export function generatePreventiveActionCandidates(
  productRisks: ProductRiskAssessment[],
  processRisks: ProcessRiskAssessment[]
): PreventiveActionPlan[] {
  const nowIso = new Date().toISOString();
  const targetDefault = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const plans: PreventiveActionPlan[] = [];

  const classifyCategory = (title: string): string => {
    const lower = title.toLowerCase();
    if (/dimensional|cmm|tolerance/.test(lower)) return 'Additional Dimensional Inspection';
    if (/calibrat|runout/.test(lower)) return 'CNC Machine Calibration Checks';
    if (/tool|wear|dressing/.test(lower)) return 'Cutting Tool Condition Inspection';
    if (/material|metallurg|ndt/.test(lower)) return 'Raw Material Quality Verification';
    if (/supplier/.test(lower)) return 'Supplier Quality Review';
    if (/maintenance/.test(lower)) return 'Preventive Machine Maintenance';
    if (/sampl|aql/.test(lower)) return 'Increased Sampling Frequency';
    if (/training|lpa|audit/.test(lower)) return 'Employee Process Training';
    return 'Preventive Control Plan Update';
  };

  productRisks
    .filter((p) => p.riskLevel === 'HIGH' || p.riskLevel === 'MEDIUM')
    .forEach((p) => {
      p.recommendedPreventiveActions.forEach((act, idx) => {
        const planKey = `PROD:${p.productName}:${idx}`;
        plans.push({
          id: `PREV-P-${p.productId}-${idx + 1}`,
          planKey,
          targetEntity: p.productName,
          targetKind: 'Product',
          riskLevel: p.riskLevel,
          actionCategory: classifyCategory(act),
          title: act,
          rationale: `Risk Score ${p.riskScore}/100 (${p.riskLevel}) — ${p.mainRiskFactors[0] ?? 'Historical defect pressure'}.`,
          status: 'Recommended',
          responsiblePerson: 'R. Deshmukh',
          targetDate: targetDefault,
          verificationResults: '',
          updatedAt: nowIso,
        });
      });
    });

  processRisks
    .filter(
      (pr) => pr.riskLevel === 'HIGH' || pr.riskLevel === 'MEDIUM'
    )
    .forEach((pr) => {
      pr.suggestedPreventiveMeasures.forEach((act, idx) => {
        const planKey = `PROC:${pr.processName}:${idx}`;
        plans.push({
          id: `PREV-PR-${pr.processName.replace(/[^A-Z0-9]+/gi, '').slice(0, 8).toUpperCase()}-${shortHash(pr.processName)}-${idx + 1}`,
          planKey,
          targetEntity: pr.processName,
          targetKind: 'Process',
          riskLevel: pr.riskLevel as RiskTier,
          actionCategory: classifyCategory(act),
          title: act,
          rationale: `Process Risk Score ${pr.riskScore}/100 (${pr.riskLevel}) — ${pr.associatedDefectModes[0] ?? 'Observed process cluster'}.`,
          status: 'Recommended',
          responsiblePerson: 'Manufacturing Process Engineer',
          targetDate: targetDefault,
          verificationResults: '',
          updatedAt: nowIso,
        });
      });
    });

  return plans;
}

// ---------- MODULE 10: PREDICTION HISTORY & ACTUAL COMPARISON ----------

export function createSeedPredictionHistory(
  complaints: ComplaintRecord[],
  productRisks: ProductRiskAssessment[]
): PredictionHistoryEntry[] {
  const unique = deduplicateComplaints(complaints);
  const months = Array.from(
    new Set(
      unique
        .map((c) => c.complaintDate.slice(0, 7))
        .filter((m) => /^\d{4}-\d{2}$/.test(m))
    )
  ).sort();

  if (months.length < 4) return [];

  // Create transparent historical snapshot records evaluated against later observed months in the dataset
  const entries: PredictionHistoryEntry[] = [];
  const sampleIndices = [
    Math.max(2, months.length - 3),
    Math.max(3, months.length - 2),
    months.length - 1,
  ];

  Array.from(new Set(sampleIndices)).forEach((idx, i) => {
    const forecastMonth = months[idx];
    const priorSeries = months.slice(0, idx).map((m) =>
      unique.filter((c) => c.complaintDate.slice(0, 7) === m).length
    );
    const predCount = Math.round(predictSingleStep(priorSeries, 'exponential_smoothing', 1));
    const predDate = `${months[idx - 1]}-28`;

    entries.push({
      id: `PHIST-PLANT-${forecastMonth}`,
      predictionDate: predDate,
      targetEntity: 'Plant Overall Monthly Volume',
      entityKind: 'Plant Overall',
      riskScore: productRisks[0]?.riskScore ?? 65,
      riskLevel: productRisks[0]?.riskLevel ?? 'MEDIUM',
      forecastPeriod: forecastMonth,
      predictedComplaintCount: predCount,
      actualComplaintCount: null,
      evaluationStatus: 'Pending Elapsed Data',
      methodNote: `Historical backtest snapshot #${i + 1} (SES alpha=0.40)`,
    });
  });

  if (productRisks[0] && months.length >= 2) {
    const latestMonth = months[months.length - 1];
    const priorProdCount = unique.filter(
      (c) =>
        c.productName === productRisks[0].productName &&
        c.complaintDate.slice(0, 7) === months[months.length - 2]
    ).length;
    entries.push({
      id: `PHIST-PROD-${latestMonth}`,
      predictionDate: `${months[months.length - 2]}-28`,
      targetEntity: productRisks[0].productName,
      entityKind: 'Product',
      riskScore: productRisks[0].riskScore,
      riskLevel: productRisks[0].riskLevel,
      forecastPeriod: latestMonth,
      predictedComplaintCount: Math.max(1, priorProdCount),
      actualComplaintCount: null,
      evaluationStatus: 'Pending Elapsed Data',
      methodNote: 'High-risk product monthly check',
    });
  }

  return evaluatePredictionHistory(entries, unique);
}

export function evaluatePredictionHistory(
  entries: PredictionHistoryEntry[],
  complaints: ComplaintRecord[]
): PredictionHistoryEntry[] {
  const unique = deduplicateComplaints(complaints);
  const observedMonths = new Set(
    unique.map((c) => c.complaintDate.slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m))
  );
  const latestObservedMonth = Array.from(observedMonths).sort().pop() ?? '';

  return entries.map((entry) => {
    const isElapsed =
      /^\d{4}-\d{2}$/.test(entry.forecastPeriod) &&
      latestObservedMonth !== '' &&
      entry.forecastPeriod <= latestObservedMonth;

    if (!isElapsed) {
      return {
        ...entry,
        actualComplaintCount: null,
        evaluationStatus: 'Pending Elapsed Data',
      };
    }

    let actualCount = 0;
    if (entry.entityKind === 'Plant Overall') {
      actualCount = unique.filter((c) => c.complaintDate.slice(0, 7) === entry.forecastPeriod).length;
    } else if (entry.entityKind === 'Product') {
      actualCount = unique.filter(
        (c) =>
          c.productName === entry.targetEntity &&
          c.complaintDate.slice(0, 7) === entry.forecastPeriod
      ).length;
    } else {
      actualCount = unique.filter(
        (c) =>
          (c.processName === entry.targetEntity ||
            classifyStandardProcessFamily(c.processName) === entry.targetEntity) &&
          c.complaintDate.slice(0, 7) === entry.forecastPeriod
      ).length;
    }

    let evaluationStatus: PredictionEvaluationStatus = 'Pending Elapsed Data';
    if (entry.predictedComplaintCount !== null) {
      const pred = entry.predictedComplaintCount;
      const diff = actualCount - pred;
      const tolerance = Math.max(1, Math.round(pred * 0.2));
      if (Math.abs(diff) <= tolerance) {
        evaluationStatus = 'Accurate (Within +/-20%)';
      } else if (diff > 0) {
        evaluationStatus = 'Under-Predicted';
      } else {
        evaluationStatus = 'Over-Predicted';
      }
    }

    return {
      ...entry,
      actualComplaintCount: actualCount,
      evaluationStatus,
    };
  });
}

// ---------- MODULE 11: COMPREHENSIVE CSV REPORT EXPORT ----------

export function exportPredictiveQualityReportCsv(params: {
  products: ProductRiskAssessment[];
  processes: ProcessRiskAssessment[];
  batches: BatchRiskAssessment[];
  forecast: TimeSeriesForecastResult;
  alerts: PredictiveAlert[];
  preventivePlans: PreventiveActionPlan[];
}) {
  const headers = [
    'Report Section',
    'Entity / Target',
    'Risk Score / Forecast',
    'Level / Status',
    'Primary Drivers / Scope',
    'Recommended Preventive Action / Evaluation',
  ];

  const rows: Array<Array<unknown>> = [];

  params.products.forEach((p) => {
    rows.push([
      'Product Risk Prediction',
      `${p.productId} - ${p.productName}`,
      `${p.riskScore}/100`,
      p.riskLevel,
      p.mainRiskFactors.join(' | '),
      p.recommendedPreventiveAction,
    ]);
  });

  params.processes.forEach((pr) => {
    rows.push([
      'Process Risk Prediction',
      pr.processName,
      pr.riskScore !== null ? `${pr.riskScore}/100` : 'Insufficient Data',
      pr.riskLevel,
      pr.associatedDefectModes.join(' | ') || 'No complaints recorded',
      pr.suggestedPreventiveMeasures[0] ?? '',
    ]);
  });

  params.batches.slice(0, 25).forEach((b) => {
    rows.push([
      'Batch Risk Assessment',
      `${b.batchNumber} (${b.productName})`,
      b.riskScore !== null ? `${b.riskScore}/100` : 'Insufficient Data',
      `${b.riskLevel} · ${b.assessmentStatus}`,
      b.riskFactors.join(' | '),
      b.recommendedInspection,
    ]);
  });

  if (params.forecast.sufficientData) {
    params.forecast.horizons.forEach((h) => {
      rows.push([
        'Complaint Volume Forecast',
        h.horizonLabel,
        `${h.predictedTotal} predicted (${h.lowerBoundTotal}-${h.upperBoundTotal} range)`,
        params.forecast.trendDirection,
        params.forecast.methodLabel,
        `Monthly avg ${h.monthlyAverage}`,
      ]);
    });
  }

  params.alerts.forEach((a) => {
    rows.push([
      'Predictive Alert',
      `${a.id} · ${a.targetEntity}`,
      a.alertType,
      `${a.riskLevel} · ${a.status}`,
      a.reason,
      a.recommendedAction,
    ]);
  });

  params.preventivePlans.forEach((pl) => {
    rows.push([
      'Preventive Action Plan',
      `${pl.targetEntity} (${pl.actionCategory})`,
      pl.riskLevel,
      pl.status,
      pl.title,
      `Owner: ${pl.responsiblePerson} | Target: ${pl.targetDate}${pl.verificationResults ? ` | Result: ${pl.verificationResults}` : ''}`,
    ]);
  });

  downloadCsvFile('q-intelligence-predictive-quality-report.csv', headers, rows);
}
