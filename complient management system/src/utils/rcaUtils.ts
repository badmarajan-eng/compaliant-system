import type {
  ComplaintRecord,
  RootCauseHypothesis,
  SixMCategory,
} from '../types/qms';
import { deriveEffectivenessStatus } from './qmsAnalytics';

export const ALL_6M_CATEGORIES: SixMCategory[] = [
  'Machine',
  'Material',
  'Method',
  'Manpower',
  'Measurement',
  'Environment',
];

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
  'after',
  'during',
  'under',
  'into',
  'than',
  'more',
  'less',
  'high',
  'low',
  'part',
  'parts',
  'unit',
  'units',
  'batch',
  'spec',
  'test',
  'line',
]);

function extractTokens(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9.+/-]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
  return new Set(tokens);
}

function tokenOverlapCount(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const t of a) {
    if (b.has(t)) count += 1;
  }
  return count;
}

export function infer6MCategory(
  hypothesis: Pick<RootCauseHypothesis, 'category6M' | 'title' | 'description' | 'affectedProcessOrProduct'>
): SixMCategory {
  if (hypothesis.category6M && ALL_6M_CATEGORIES.includes(hypothesis.category6M)) {
    return hypothesis.category6M;
  }
  const text = `${hypothesis.title} ${hypothesis.description} ${hypothesis.affectedProcessOrProduct}`.toLowerCase();
  if (/gauge|cmm|micrometer|calibrat|sensor|inspect|test|metrology|instrument/.test(text)) {
    return 'Measurement';
  }
  if (/alloy|steel|resin|polymer|material|billet|impurity|quench oil|coating|adhesive|seal/.test(text)) {
    return 'Material';
  }
  if (/operator|shift|training|assembly|manual|technician|hand|human|skill/.test(text)) {
    return 'Manpower';
  }
  if (/humidity|ambient|temperature|moisture|dust|corrosion|environment|storage|transit/.test(text)) {
    return 'Environment';
  }
  if (/dresser|spindle|pump|vfd|grinder|cnc|machine|tool|fixture|press|heater|nozzle|valve|impeller/.test(text)) {
    return 'Machine';
  }
  return 'Method';
}

export interface HistoricalComplaintMatch {
  complaint: ComplaintRecord;
  relevanceScore: number;
  matchReasons: string[];
  recordedRootCause: string;
  correctiveAction: string;
  effectivenessStatus: string;
}

/**
 * Deterministic multi-factor comparison against existing dataset records.
 * Explicitly lists why each historical complaint is relevant without assuming
 * identical root causes.
 */
export function findMatchingHistoricalComplaints(
  target: ComplaintRecord,
  allComplaints: ComplaintRecord[],
  limit = 12
): HistoricalComplaintMatch[] {
  const targetDescTokens = extractTokens(target.description);
  const targetParamTokens = extractTokens(target.processParameters);
  const targetTestTokens = extractTokens(target.testResults);
  const targetBatchPrefix = target.batchNumber.split('-').slice(0, 2).join('-');
  const targetProductFamily = target.productName.split(' ').slice(0, 2).join(' ').toLowerCase();

  const matches: HistoricalComplaintMatch[] = [];

  for (const candidate of allComplaints) {
    if (candidate.id === target.id) continue;

    const reasons: string[] = [];
    let score = 0;

    if (
      candidate.productId === target.productId ||
      candidate.productName.toLowerCase() === target.productName.toLowerCase()
    ) {
      reasons.push('Same product');
      score += 5;
    } else if (
      targetProductFamily.length >= 4 &&
      candidate.productName.toLowerCase().includes(targetProductFamily)
    ) {
      reasons.push('Same product family');
      score += 2;
    }

    if (candidate.category === target.category) {
      reasons.push('Same complaint category');
      score += 3;
    }

    if (candidate.processName.toLowerCase() === target.processName.toLowerCase()) {
      reasons.push('Same manufacturing process');
      score += 4;
    }

    if (
      target.machineId &&
      candidate.machineId &&
      target.machineId.toLowerCase() === candidate.machineId.toLowerCase()
    ) {
      reasons.push(`Same Machine ID (${candidate.machineId})`);
      score += 4;
    }

    if (candidate.batchNumber === target.batchNumber) {
      reasons.push('Same batch number');
      score += 5;
    } else if (
      targetBatchPrefix.length >= 5 &&
      candidate.batchNumber.startsWith(targetBatchPrefix)
    ) {
      reasons.push('Related production batch series');
      score += 2;
    }

    const candDescTokens = extractTokens(candidate.description);
    if (tokenOverlapCount(targetDescTokens, candDescTokens) >= 2) {
      reasons.push('Similar defect description');
      score += 3;
    }

    const candParamTokens = extractTokens(candidate.processParameters);
    if (tokenOverlapCount(targetParamTokens, candParamTokens) >= 2) {
      reasons.push('Similar process parameters');
      score += 2;
    }

    const candTestTokens = extractTokens(candidate.testResults);
    if (tokenOverlapCount(targetTestTokens, candTestTokens) >= 2) {
      reasons.push('Similar test failure indicators');
      score += 2;
    }

    if (reasons.length === 0) continue;

    const verifiedHyp = candidate.rootCauseAnalysis?.hypotheses.find(
      (h) => h.managerStatus === 'Verified'
    );
    const recordedRootCause =
      candidate.rootCauseAnalysis?.manualVerifiedRootCause ||
      verifiedHyp?.title ||
      (candidate.rootCauseAnalysis?.hypotheses[0]
        ? `Unverified hypothesis: ${candidate.rootCauseAnalysis.hypotheses[0].title}`
        : 'Not yet investigated');

    const primaryCorrective =
      candidate.capaActions.find((a) => a.kind === 'Corrective') ??
      candidate.capaActions[0];
    const correctiveAction = primaryCorrective
      ? primaryCorrective.title
      : 'No corrective action recorded';

    const effectivenessStatus = primaryCorrective
      ? deriveEffectivenessStatus(primaryCorrective)
      : 'No CAPA tracking';

    // Boost records that have verified root causes so confirmed evidence is visible first
    if (
      candidate.rootCauseAnalysis?.manualVerifiedRootCause ||
      verifiedHyp
    ) {
      score += 2;
    }

    matches.push({
      complaint: candidate,
      relevanceScore: score,
      matchReasons: reasons,
      recordedRootCause,
      correctiveAction,
      effectivenessStatus,
    });
  }

  return matches
    .sort(
      (a, b) =>
        b.relevanceScore - a.relevanceScore ||
        b.complaint.complaintDate.localeCompare(a.complaint.complaintDate)
    )
    .slice(0, limit);
}

export interface RankedRootCauseItem {
  hypothesis: RootCauseHypothesis;
  category6M: SixMCategory;
  relatedComplaintCount: number;
  investigationPriority: 'Critical' | 'High' | 'Medium' | 'Low';
  priorityScore: number;
  rankingRationale: string;
}

/**
 * Transparent evidence-based ranking (no fabricated probabilistic percentages).
 */
export function rankRootCauseHypotheses(
  hypotheses: RootCauseHypothesis[],
  target: ComplaintRecord,
  matches: HistoricalComplaintMatch[]
): RankedRootCauseItem[] {
  const paramTestText = `${target.processParameters} ${target.testResults} ${target.processName}`.toLowerCase();
  const paramTokens = extractTokens(paramTestText);

  return hypotheses
    .map((h) => {
      const cat6M = infer6MCategory(h);
      const relatedIds = new Set(h.relatedComplaintIds ?? []);

      // Check how many historical matches reinforce or overlap this hypothesis
      const hypTokens = extractTokens(`${h.title} ${h.description}`);
      let historicalVerifiedOverlap = 0;
      for (const m of matches) {
        const isListed = relatedIds.has(m.complaint.id);
        const rcTokens = extractTokens(m.recordedRootCause);
        const textOverlap = tokenOverlapCount(hypTokens, rcTokens) >= 2;
        if (isListed || textOverlap) {
          relatedIds.add(m.complaint.id);
          if (
            m.complaint.rootCauseAnalysis?.manualVerifiedRootCause ||
            m.complaint.rootCauseAnalysis?.hypotheses.some(
              (hh) => hh.managerStatus === 'Verified'
            )
          ) {
            historicalVerifiedOverlap += 1;
          }
        }
      }

      const hasStrongEvidence =
        Boolean(h.supportingEvidence?.trim()) &&
        !/insufficient|none available|no direct/i.test(h.supportingEvidence);
      const processOverlap = tokenOverlapCount(hypTokens, paramTokens);

      let score = 0;
      if (h.managerStatus === 'Verified') score += 40;
      else if (h.managerStatus === 'Further Investigation') score += 20;
      else if (h.managerStatus === 'Pending Review') score += 10;
      else if (h.managerStatus === 'Rejected') score -= 35;

      if (hasStrongEvidence) score += 15;
      score += Math.min(20, relatedIds.size * 5);
      score += Math.min(20, historicalVerifiedOverlap * 8);
      score += Math.min(10, processOverlap * 3);
      if (h.likelihood === 'High') score += 8;
      else if (h.likelihood === 'Medium') score += 4;

      const priority: RankedRootCauseItem['investigationPriority'] =
        h.managerStatus === 'Rejected'
          ? 'Low'
          : score >= 45
          ? 'Critical'
          : score >= 30
          ? 'High'
          : score >= 18
          ? 'Medium'
          : 'Low';

      const reasons: string[] = [];
      if (h.managerStatus === 'Verified') reasons.push('Manager verified');
      else if (h.managerStatus === 'Further Investigation') reasons.push('Flagged for follow-up');
      else if (h.managerStatus === 'Rejected') reasons.push('Rejected by manager');

      if (hasStrongEvidence) reasons.push('Grounded in record evidence');
      else reasons.push('Limited direct evidence');

      if (relatedIds.size > 0) reasons.push(`${relatedIds.size} related historical case(s)`);
      if (historicalVerifiedOverlap > 0) {
        reasons.push(`${historicalVerifiedOverlap} matched verified historical RCA`);
      }
      if (processOverlap > 0) reasons.push('Matches process/test telemetry');

      return {
        hypothesis: h,
        category6M: cat6M,
        relatedComplaintCount: relatedIds.size,
        investigationPriority: priority,
        priorityScore: score,
        rankingRationale: reasons.join(' · '),
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore);
}

export interface RcaPortfolioMetrics {
  totalAnalyzed: number;
  totalHypothesesIdentified: number;
  pendingInvestigations: number;
  verifiedRootCauses: number;
  recurringPatternsCount: number;
  repeatedDefectProductsCount: number;
  repeatedDefectProducts: Array<{ productName: string; count: number }>;
  topRecurringPatterns: Array<{ pattern: string; count: number }>;
}

export function computeRcaPortfolioMetrics(
  complaints: ComplaintRecord[]
): RcaPortfolioMetrics {
  let totalAnalyzed = 0;
  let totalHypothesesIdentified = 0;
  let pendingInvestigations = 0;
  let verifiedRootCauses = 0;

  const productCounts = new Map<string, number>();
  const category6MCounts = new Map<string, number>();

  for (const c of complaints) {
    productCounts.set(c.productName, (productCounts.get(c.productName) ?? 0) + 1);

    const rca = c.rootCauseAnalysis;
    const hasVerifiedHyp = Boolean(
      rca?.hypotheses.some((h) => h.managerStatus === 'Verified')
    );
    const isVerified = Boolean(rca?.manualVerifiedRootCause?.trim()) || hasVerifiedHyp;

    if (rca) {
      totalAnalyzed += 1;
      totalHypothesesIdentified += rca.hypotheses.length;
      if (isVerified) {
        verifiedRootCauses += 1;
      } else {
        pendingInvestigations += 1;
      }

      const seenCats = new Set<string>();
      for (const h of rca.hypotheses) {
        if (h.managerStatus === 'Rejected') continue;
        const cat = infer6MCategory(h);
        const key = `${cat} (${c.processName})`;
        if (!seenCats.has(key)) {
          category6MCounts.set(key, (category6MCounts.get(key) ?? 0) + 1);
          seenCats.add(key);
        }
      }
    } else if (c.status !== 'Closed') {
      pendingInvestigations += 1;
    }
  }

  const repeatedDefectProducts = Array.from(productCounts.entries())
    .filter(([, count]) => count >= 2)
    .map(([productName, count]) => ({ productName, count }))
    .sort((a, b) => b.count - a.count);

  const topRecurringPatterns = Array.from(category6MCounts.entries())
    .filter(([, count]) => count >= 2)
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalAnalyzed,
    totalHypothesesIdentified,
    pendingInvestigations,
    verifiedRootCauses,
    recurringPatternsCount: topRecurringPatterns.length,
    repeatedDefectProductsCount: repeatedDefectProducts.length,
    repeatedDefectProducts,
    topRecurringPatterns,
  };
}

export interface RootCauseHistoryEntry {
  complaintId: string;
  productId: string;
  productName: string;
  batchNumber: string;
  processName: string;
  category6M: SixMCategory;
  identifiedRootCause: string;
  verificationStatus: 'Verified' | 'Pending Review' | 'Further Investigation';
  correctiveAction: string;
  verificationDate: string;
  verifiedBy: string;
  effectivenessResult: string;
}

export function buildHistoricalRootCauseDatabase(
  complaints: ComplaintRecord[]
): RootCauseHistoryEntry[] {
  const entries: RootCauseHistoryEntry[] = [];

  for (const c of complaints) {
    const rca = c.rootCauseAnalysis;
    if (!rca) continue;

    const verifiedHyp = rca.hypotheses.find((h) => h.managerStatus === 'Verified');
    const primaryHyp = verifiedHyp ?? rca.hypotheses.find((h) => h.managerStatus !== 'Rejected');
    const identifiedRootCause =
      rca.manualVerifiedRootCause?.trim() || primaryHyp?.title;

    if (!identifiedRootCause) continue;

    const isVerified = Boolean(rca.manualVerifiedRootCause?.trim()) || Boolean(verifiedHyp);
    const hasFurtherInv = rca.hypotheses.some(
      (h) => h.managerStatus === 'Further Investigation'
    );

    const corrective =
      c.capaActions.find((a) => a.kind === 'Corrective') ?? c.capaActions[0];

    entries.push({
      complaintId: c.id,
      productId: c.productId,
      productName: c.productName,
      batchNumber: c.batchNumber,
      processName: c.processName,
      category6M:
        rca.verifiedCategory6M ??
        (primaryHyp ? infer6MCategory(primaryHyp) : 'Method'),
      identifiedRootCause,
      verificationStatus: isVerified
        ? 'Verified'
        : hasFurtherInv
        ? 'Further Investigation'
        : 'Pending Review',
      correctiveAction: corrective?.title ?? primaryHyp?.suggestedCorrectiveAction ?? 'Pending CAPA',
      verificationDate:
        rca.verifiedDate ||
        verifiedHyp?.reviewedAt?.slice(0, 10) ||
        rca.generatedAt.slice(0, 10),
      verifiedBy:
        rca.verifiedBy ||
        verifiedHyp?.reviewedBy ||
        c.assignedManager ||
        'Quality Manager',
      effectivenessResult: corrective
        ? deriveEffectivenessStatus(corrective)
        : 'Pending Verification Data',
    });
  }

  return entries.sort((a, b) => b.verificationDate.localeCompare(a.verificationDate));
}
