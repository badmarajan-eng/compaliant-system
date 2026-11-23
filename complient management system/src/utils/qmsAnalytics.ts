import type {
  CAPAActionItem,
  ComplaintCategory,
  ComplaintRecord,
  EffectivenessStatus,
  EntityRiskPrediction,
  RiskTier,
  SeverityLevel,
} from '../types/qms';

export const ALL_CATEGORIES: ComplaintCategory[] = [
  'Product Quality',
  'Dimensional Defects',
  'Material Defects',
  'Performance Issues',
  'Delivery Issues',
  'Packaging Issues',
  'Other',
];

export const ALL_SEVERITIES: SeverityLevel[] = ['Low', 'Medium', 'High', 'Critical'];

export const ALL_COMPLAINT_STATUSES = [
  'New',
  'Under Investigation',
  'Root Cause Identified',
  'Corrective Action In Progress',
  'Verification Pending',
  'Closed',
] as const;

export const ALL_PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'] as const;

const SEVERITY_WEIGHT: Record<SeverityLevel, number> = {
  Low: 1,
  Medium: 2,
  High: 3.5,
  Critical: 5,
};

export function daysBetween(startIso: string, endIso: string): number | null {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  const diff = Math.round((end - start) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

export function getReferenceDate(complaints: ComplaintRecord[]): Date {
  let maxTime = 0;
  for (const c of complaints) {
    const t = new Date(c.complaintDate).getTime();
    if (!Number.isNaN(t) && t > maxTime) maxTime = t;
  }
  return maxTime > 0 ? new Date(maxTime) : new Date();
}

export interface DashboardKPIs {
  totalComplaints: number;
  openComplaints: number;
  closedComplaints: number;
  criticalComplaints: number;
  highRiskProductsCount: number;
  capaPendingCount: number;
  avgResolutionDays: number | null;
}

export function computeDashboardKPIs(
  complaints: ComplaintRecord[],
  productRisks: EntityRiskPrediction[]
): DashboardKPIs {
  const totalComplaints = complaints.length;
  const closedList = complaints.filter((c) => c.status === 'Closed');
  const closedComplaints = closedList.length;
  const openComplaints = totalComplaints - closedComplaints;
  const criticalComplaints = complaints.filter((c) => c.severity === 'Critical').length;
  const highRiskProductsCount = productRisks.filter((r) => r.riskTier === 'HIGH').length;
  const capaPendingCount = complaints.filter((c) => {
    const hasPendingAction = c.capaActions.some(
      (a) =>
        a.approvalStatus !== 'Rejected' &&
        a.completionStatus !== 'Completed'
    );
    const unresolvedWithoutCapa =
      c.status !== 'Closed' &&
      c.capaActions.filter((a) => a.approvalStatus !== 'Rejected').length === 0;
    return hasPendingAction || unresolvedWithoutCapa;
  }).length;

  const resolutionDurations: number[] = [];
  for (const c of closedList) {
    if (c.resolutionDate) {
      const days = daysBetween(c.complaintDate, c.resolutionDate);
      if (days !== null) resolutionDurations.push(days);
    }
  }

  const avgResolutionDays =
    resolutionDurations.length > 0
      ? Number(
          (
            resolutionDurations.reduce((acc, d) => acc + d, 0) /
            resolutionDurations.length
          ).toFixed(1)
        )
      : null;

  return {
    totalComplaints,
    openComplaints,
    closedComplaints,
    criticalComplaints,
    highRiskProductsCount,
    capaPendingCount,
    avgResolutionDays,
  };
}

export interface MonthlyTrendPoint {
  month: string;
  label: string;
  total: number;
  critical: number;
  open: number;
  closed: number;
}

export function computeMonthlyTrends(complaints: ComplaintRecord[]): MonthlyTrendPoint[] {
  const map = new Map<string, MonthlyTrendPoint>();
  for (const c of complaints) {
    const month = c.complaintDate.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    let entry = map.get(month);
    if (!entry) {
      const [y, m] = month.split('-');
      const d = new Date(Number(y), Number(m) - 1, 1);
      const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      entry = { month, label, total: 0, critical: 0, open: 0, closed: 0 };
      map.set(month, entry);
    }
    entry.total += 1;
    if (c.severity === 'Critical') entry.critical += 1;
    if (c.status === 'Closed') entry.closed += 1;
    else entry.open += 1;
  }

  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}

export interface DistributionItem {
  name: string;
  count: number;
  criticalCount: number;
  openCount: number;
  percentage: number;
}

export function computeGroupDistribution(
  complaints: ComplaintRecord[],
  keyFn: (c: ComplaintRecord) => string
): DistributionItem[] {
  const map = new Map<string, { count: number; criticalCount: number; openCount: number }>();
  for (const c of complaints) {
    const key = keyFn(c) || 'Unspecified';
    const current = map.get(key) ?? { count: 0, criticalCount: 0, openCount: 0 };
    current.count += 1;
    if (c.severity === 'Critical') current.criticalCount += 1;
    if (c.status !== 'Closed') current.openCount += 1;
    map.set(key, current);
  }
  const total = complaints.length || 1;
  return Array.from(map.entries())
    .map(([name, stats]) => ({
      name,
      count: stats.count,
      criticalCount: stats.criticalCount,
      openCount: stats.openCount,
      percentage: Number(((stats.count / total) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export interface ChronicIssueItem {
  productName: string;
  productId: string;
  category: ComplaintCategory;
  processName: string;
  count: number;
  criticalOrHigh: number;
  openCount: number;
  latestDate: string;
}

export function computeChronicIssues(complaints: ComplaintRecord[]): ChronicIssueItem[] {
  const map = new Map<string, ChronicIssueItem>();
  for (const c of complaints) {
    const key = `${c.productName}__${c.category}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        productName: c.productName,
        productId: c.productId,
        category: c.category,
        processName: c.processName,
        count: 1,
        criticalOrHigh: c.severity === 'Critical' || c.severity === 'High' ? 1 : 0,
        openCount: c.status !== 'Closed' ? 1 : 0,
        latestDate: c.complaintDate,
      });
    } else {
      existing.count += 1;
      if (c.severity === 'Critical' || c.severity === 'High') existing.criticalOrHigh += 1;
      if (c.status !== 'Closed') existing.openCount += 1;
      if (c.complaintDate > existing.latestDate) existing.latestDate = c.complaintDate;
    }
  }

  return Array.from(map.values())
    .filter((item) => item.count >= 2)
    .sort((a, b) => b.count - a.count || b.criticalOrHigh - a.criticalOrHigh);
}

function getPreventiveRecommendationsForEntity(
  entityName: string,
  topCategories: ComplaintCategory[],
  entityType: 'Product' | 'Process'
): string[] {
  const recs: string[] = [];
  const primary = topCategories[0];

  if (primary === 'Dimensional Defects') {
    recs.push(`Enforce automated SPC & first-off/last-off CMM verification on ${entityName}.`);
    recs.push('Shorten tool-wear / dressing replacement intervals and verify fixture datum stops.');
  } else if (primary === 'Material Defects') {
    recs.push(`Tighten incoming material certification checks & NDT screening (MPI/UT) for ${entityName}.`);
    recs.push('Audit thermal/quench cycle stability and polymer/oil concentration logs per shift.');
  } else if (primary === 'Performance Issues') {
    recs.push(`Add 100% endurance thermal/vibration gate testing prior to dispatch for ${entityName}.`);
    recs.push('Calibrate preload torque and lubrication dispense tolerances on assembly stations.');
  } else if (primary === 'Delivery Issues' || primary === 'Packaging Issues') {
    recs.push(`Implement pre-dispatch VCI seal peel testing and automated ASN/WMS hold alerts.`);
  } else {
    recs.push(`Conduct layered process audit (LPA) and update operator control plan for ${entityName}.`);
  }

  if (entityType === 'Product') {
    recs.push('Review historical batch-level containment and schedule FMEA control plan revision.');
  } else {
    recs.push('Schedule preventive maintenance calibration and operator cross-training on this process.');
  }
  return recs;
}

/**
 * Transparent, deterministic risk scoring model (0-100):
 * - Complaint Frequency vs cohort max (25 pts)
 * - Average & Peak Severity weight (25 pts)
 * - Category Recurrence Rate (20 pts)
 * - Recent 90-Day Trend Share (15 pts)
 * - Unresolved Critical/High Backlog (15 pts)
 */
function calculateEntityRisks(
  complaints: ComplaintRecord[],
  entityType: 'Product' | 'Process'
): EntityRiskPrediction[] {
  if (complaints.length === 0) return [];

  const refDate = getReferenceDate(complaints);
  const cutoff90 = new Date(refDate.getTime() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const grouped = new Map<string, ComplaintRecord[]>();
  for (const c of complaints) {
    const key = entityType === 'Product' ? c.productName : c.processName;
    const list = grouped.get(key) ?? [];
    list.push(c);
    grouped.set(key, list);
  }

  const maxCount = Math.max(
    1,
    ...Array.from(grouped.values()).map((items) => items.length)
  );

  const results: EntityRiskPrediction[] = [];

  for (const [entityName, items] of grouped.entries()) {
    const total = items.length;
    const openItems = items.filter((i) => i.status !== 'Closed');
    const criticalOnly = items.filter((i) => i.severity === 'Critical');
    const critHigh = items.filter((i) => i.severity === 'Critical' || i.severity === 'High');
    const unresolvedCritHigh = openItems.filter(
      (i) => i.severity === 'Critical' || i.severity === 'High'
    );
    const recentItems = items.filter((i) => i.complaintDate >= cutoff90);

    // 1. Frequency (25 pts)
    const freqScore = Math.min(25, (total / maxCount) * 25);

    // 2. Severity (25 pts)
    const avgSevWeight =
      items.reduce((acc, i) => acc + SEVERITY_WEIGHT[i.severity], 0) / total;
    const sevScore = Math.min(25, (avgSevWeight / 5) * 25);

    // 3. Recurrence Rate (20 pts): proportion of complaints belonging to repeated categories (>=2)
    const catCounts = new Map<ComplaintCategory, number>();
    for (const i of items) {
      catCounts.set(i.category, (catCounts.get(i.category) ?? 0) + 1);
    }
    const repeatedSum = Array.from(catCounts.values())
      .filter((n) => n >= 2)
      .reduce((a, b) => a + b, 0);
    const recurrenceRate = total > 0 ? repeatedSum / total : 0;
    const recurrenceScore = Math.min(20, recurrenceRate * 20);

    // 4. Recent 90-Day Trend Velocity (15 pts)
    const recentRatio = recentItems.length / Math.max(1, total);
    const recentVolumeBoost = Math.min(1, recentItems.length / 3);
    const trendScore = Math.min(15, (recentRatio * 0.5 + recentVolumeBoost * 0.5) * 15);

    // 5. Unresolved Critical/High Backlog (15 pts)
    const backlogScore = Math.min(
      15,
      unresolvedCritHigh.length * 6 + (openItems.length - unresolvedCritHigh.length) * 2
    );

    const rawTotal = freqScore + sevScore + recurrenceScore + trendScore + backlogScore;
    const riskScore = Math.max(0, Math.min(100, Math.round(rawTotal)));
    const riskTier: RiskTier =
      riskScore >= 70 ? 'HIGH' : riskScore >= 40 ? 'MEDIUM' : 'LOW';

    const sortedCategories = Array.from(catCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([cat]) => cat);

    results.push({
      entityName,
      entityCode: entityType === 'Product' ? items[0]?.productId : undefined,
      entityType,
      riskScore,
      riskTier,
      totalComplaints: total,
      openComplaints: openItems.length,
      criticalCount: criticalOnly.length,
      criticalOrHighCount: critHigh.length,
      recent90DayCount: recentItems.length,
      recurrenceRatePercent: Math.round(recurrenceRate * 100),
      possibleFutureCategories: sortedCategories.slice(0, 3),
      riskFactors: [
        {
          factor: 'Complaint Frequency',
          weightPercent: 25,
          rawValue: `${total} complaints (cohort max ${maxCount})`,
          contributionScore: Number(freqScore.toFixed(1)),
        },
        {
          factor: 'Weighted Severity',
          weightPercent: 25,
          rawValue: `${critHigh.length} High/Critical of ${total}`,
          contributionScore: Number(sevScore.toFixed(1)),
        },
        {
          factor: 'Category Recurrence Rate',
          weightPercent: 20,
          rawValue: `${Math.round(recurrenceRate * 100)}% repeated categories`,
          contributionScore: Number(recurrenceScore.toFixed(1)),
        },
        {
          factor: 'Recent 90-Day Trend',
          weightPercent: 15,
          rawValue: `${recentItems.length} incidents in last 90d`,
          contributionScore: Number(trendScore.toFixed(1)),
        },
        {
          factor: 'Unresolved Open Backlog',
          weightPercent: 15,
          rawValue: `${unresolvedCritHigh.length} open High/Crit, ${openItems.length} total open`,
          contributionScore: Number(backlogScore.toFixed(1)),
        },
      ],
      recommendedPreventiveActions: getPreventiveRecommendationsForEntity(
        entityName,
        sortedCategories,
        entityType
      ),
    });
  }

  return results.sort((a, b) => b.riskScore - a.riskScore || b.totalComplaints - a.totalComplaints);
}

export function computeProductRiskPredictions(complaints: ComplaintRecord[]): EntityRiskPrediction[] {
  return calculateEntityRisks(complaints, 'Product');
}

export function computeProcessRiskPredictions(complaints: ComplaintRecord[]): EntityRiskPrediction[] {
  return calculateEntityRisks(complaints, 'Process');
}

export function deriveEffectivenessStatus(action: CAPAActionItem): EffectivenessStatus {
  const { complaintsBefore, complaintsAfter, verifiedEffective, evaluationNotes } =
    action.effectivenessTracking;

  if (
    complaintsAfter === null ||
    complaintsAfter === undefined ||
    verifiedEffective === null ||
    !evaluationNotes.trim()
  ) {
    return 'Pending Verification Data';
  }

  if (verifiedEffective === true && complaintsAfter < complaintsBefore) {
    return 'Verified Effective';
  }

  if (complaintsAfter < complaintsBefore && verifiedEffective === false) {
    return 'Partially Effective';
  }

  return 'Ineffective';
}

export function computeReductionPercent(
  before: number,
  after: number | null
): number | null {
  if (after === null || after === undefined || before <= 0) return null;
  return Number((((before - after) / before) * 100).toFixed(1));
}
