import type {
  ComplaintCategory,
  ComplaintRecord,
  RiskTier,
  SeverityLevel,
} from '../types/qms';
import { downloadCsvFile } from './csvUtils';
import {
  ALL_CATEGORIES,
  computeProductRiskPredictions,
  computeProcessRiskPredictions,
  computeReductionPercent,
  deriveEffectivenessStatus,
  getReferenceDate,
} from './qmsAnalytics';

export interface AnalyticsFilterState {
  startDate: string;
  endDate: string;
  productName: string;
  customerName: string;
  batchNumber: string;
  category: string;
  severity: string;
  processName: string;
}

export const DEFAULT_ANALYTICS_FILTERS: AnalyticsFilterState = {
  startDate: '',
  endDate: '',
  productName: 'ALL',
  customerName: 'ALL',
  batchNumber: 'ALL',
  category: 'ALL',
  severity: 'ALL',
  processName: 'ALL',
};

export function deduplicateComplaints(complaints: ComplaintRecord[]): ComplaintRecord[] {
  const seen = new Set<string>();
  const result: ComplaintRecord[] = [];
  for (const c of complaints) {
    const key = c.id.trim().toUpperCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(c);
  }
  return result;
}

export function applyAnalyticsFilters(
  complaints: ComplaintRecord[],
  filters: AnalyticsFilterState
): ComplaintRecord[] {
  const unique = deduplicateComplaints(complaints);
  return unique.filter((c) => {
    if (filters.startDate && c.complaintDate < filters.startDate) return false;
    if (filters.endDate && c.complaintDate > filters.endDate) return false;
    if (filters.productName !== 'ALL' && c.productName !== filters.productName) return false;
    if (filters.customerName !== 'ALL' && c.customerName !== filters.customerName) return false;
    if (filters.batchNumber !== 'ALL' && c.batchNumber !== filters.batchNumber) return false;
    if (filters.category !== 'ALL' && c.category !== filters.category) return false;
    if (filters.severity !== 'ALL' && c.severity !== filters.severity) return false;
    if (filters.processName !== 'ALL' && c.processName !== filters.processName) return false;
    return true;
  });
}

// ---------- MODULE 1: KPIs ----------

export interface AnalyticsDashboardKpis {
  totalComplaints: number;
  productsAffected: number;
  processesAffected: number;
  recurringDefectsCount: number;
  topComplaintCategory: { name: string; count: number } | null;
  mostAffectedProduct: { name: string; count: number } | null;
  mostAffectedProcess: { name: string; count: number } | null;
}

export function computeAnalyticsDashboardKpis(
  complaints: ComplaintRecord[],
  recurringCount: number
): AnalyticsDashboardKpis {
  const unique = deduplicateComplaints(complaints);
  const prodCounts = new Map<string, number>();
  const procCounts = new Map<string, number>();
  const catCounts = new Map<string, number>();

  for (const c of unique) {
    prodCounts.set(c.productName, (prodCounts.get(c.productName) ?? 0) + 1);
    procCounts.set(c.processName, (procCounts.get(c.processName) ?? 0) + 1);
    catCounts.set(c.category, (catCounts.get(c.category) ?? 0) + 1);
  }

  const pickTop = (map: Map<string, number>) => {
    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return sorted[0] ? { name: sorted[0][0], count: sorted[0][1] } : null;
  };

  return {
    totalComplaints: unique.length,
    productsAffected: prodCounts.size,
    processesAffected: procCounts.size,
    recurringDefectsCount: recurringCount,
    topComplaintCategory: pickTop(catCounts),
    mostAffectedProduct: pickTop(prodCounts),
    mostAffectedProcess: pickTop(procCounts),
  };
}

// ---------- MODULE 2: PRODUCT-WISE ANALYSIS ----------

export type TrendDirection = 'Increasing' | 'Stable' | 'Improving' | 'Single Period';

export interface ProductAnalyticsRow {
  productId: string;
  productName: string;
  totalComplaints: number;
  criticalComplaints: number;
  mostCommonDefect: string;
  affectedBatchesCount: number;
  trendDirection: TrendDirection;
  trendDetail: string;
  riskLevel: RiskTier;
  riskScore: number;
  complaints: ComplaintRecord[];
}

export function computeProductAnalytics(complaints: ComplaintRecord[]): ProductAnalyticsRow[] {
  const unique = deduplicateComplaints(complaints);
  if (unique.length === 0) return [];

  const riskByProduct = new Map(
    computeProductRiskPredictions(unique).map((r) => [r.entityName, r])
  );
  const refDate = getReferenceDate(unique);
  const cutoff90 = new Date(refDate.getTime() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const cutoff180 = new Date(refDate.getTime() - 180 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const grouped = new Map<string, ComplaintRecord[]>();
  for (const c of unique) {
    const arr = grouped.get(c.productName) ?? [];
    arr.push(c);
    grouped.set(c.productName, arr);
  }

  const rows: ProductAnalyticsRow[] = [];
  for (const [productName, items] of grouped.entries()) {
    const catMap = new Map<string, number>();
    const batches = new Set<string>();
    let criticalComplaints = 0;

    for (const c of items) {
      catMap.set(c.category, (catMap.get(c.category) ?? 0) + 1);
      if (c.batchNumber) batches.add(c.batchNumber);
      if (c.severity === 'Critical') criticalComplaints += 1;
    }

    const topDefect = Array.from(catMap.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Other';

    const recent90 = items.filter((c) => c.complaintDate >= cutoff90).length;
    const prior90 = items.filter(
      (c) => c.complaintDate >= cutoff180 && c.complaintDate < cutoff90
    ).length;

    let trendDirection: TrendDirection = 'Single Period';
    let trendDetail = `${recent90} in last 90d`;
    if (items.length > 1) {
      if (recent90 > prior90) {
        trendDirection = 'Increasing';
        trendDetail = `${recent90} recent vs ${prior90} prior 90d`;
      } else if (recent90 < prior90) {
        trendDirection = 'Improving';
        trendDetail = `${recent90} recent vs ${prior90} prior 90d`;
      } else {
        trendDirection = 'Stable';
        trendDetail = `${recent90} recent vs ${prior90} prior 90d`;
      }
    }

    const risk = riskByProduct.get(productName);
    rows.push({
      productId: items[0]?.productId ?? 'PRD-N/A',
      productName,
      totalComplaints: items.length,
      criticalComplaints,
      mostCommonDefect: topDefect,
      affectedBatchesCount: batches.size,
      trendDirection,
      trendDetail,
      riskLevel: risk?.riskTier ?? 'LOW',
      riskScore: risk?.riskScore ?? 0,
      complaints: [...items].sort((a, b) => b.complaintDate.localeCompare(a.complaintDate)),
    });
  }

  return rows.sort((a, b) => b.totalComplaints - a.totalComplaints || b.criticalComplaints - a.criticalComplaints);
}

// ---------- MODULE 3: BATCH-WISE ANALYSIS ----------

export interface BatchAnalyticsRow {
  batchNumber: string;
  productName: string;
  totalComplaints: number;
  criticalCount: number;
  defectCategories: string[];
  manufacturingDate: string;
  processName: string;
  verifiedRootCauses: string[];
  aiHypothesesOnlyCount: number;
  complaintFrequencyShare: number;
  isRepeated: boolean;
  complaints: ComplaintRecord[];
}

export function computeBatchAnalytics(complaints: ComplaintRecord[]): BatchAnalyticsRow[] {
  const unique = deduplicateComplaints(complaints);
  const total = unique.length || 1;
  const grouped = new Map<string, ComplaintRecord[]>();

  for (const c of unique) {
    const key = c.batchNumber || 'UNSPECIFIED';
    const arr = grouped.get(key) ?? [];
    arr.push(c);
    grouped.set(key, arr);
  }

  const rows: BatchAnalyticsRow[] = [];
  for (const [batchNumber, items] of grouped.entries()) {
    const cats = new Set<string>();
    const verified = new Set<string>();
    let aiOnly = 0;
    let criticalCount = 0;

    for (const c of items) {
      cats.add(c.category);
      if (c.severity === 'Critical') criticalCount += 1;
      if (c.rootCauseAnalysis?.manualVerifiedRootCause?.trim()) {
        verified.add(c.rootCauseAnalysis.manualVerifiedRootCause.trim());
      }
      const verifiedHyps =
        c.rootCauseAnalysis?.hypotheses.filter((h) => h.managerStatus === 'Verified') ?? [];
      verifiedHyps.forEach((h) => verified.add(h.title));
      const pendingHyps =
        c.rootCauseAnalysis?.hypotheses.filter((h) => h.managerStatus !== 'Verified') ?? [];
      if (verifiedHyps.length === 0 && !c.rootCauseAnalysis?.manualVerifiedRootCause) {
        aiOnly += pendingHyps.length;
      }
    }

    rows.push({
      batchNumber,
      productName: Array.from(new Set(items.map((i) => i.productName))).join(', '),
      totalComplaints: items.length,
      criticalCount,
      defectCategories: Array.from(cats),
      manufacturingDate: items[0]?.manufacturingDate ?? '—',
      processName: Array.from(new Set(items.map((i) => i.processName))).join(', '),
      verifiedRootCauses: Array.from(verified),
      aiHypothesesOnlyCount: aiOnly,
      complaintFrequencyShare: Number(((items.length / total) * 100).toFixed(1)),
      isRepeated: items.length >= 2,
      complaints: [...items].sort((a, b) => b.complaintDate.localeCompare(a.complaintDate)),
    });
  }

  return rows.sort((a, b) => b.totalComplaints - a.totalComplaints || b.criticalCount - a.criticalCount);
}

// ---------- MODULE 4: CUSTOMER-WISE ANALYSIS ----------

export interface CustomerAnalyticsRow {
  customerName: string;
  totalComplaints: number;
  mostReportedDefect: string;
  affectedProducts: string[];
  criticalComplaints: number;
  monthlyFrequency: number;
  activeMonths: number;
  complaints: ComplaintRecord[];
}

export function computeCustomerAnalytics(complaints: ComplaintRecord[]): CustomerAnalyticsRow[] {
  const unique = deduplicateComplaints(complaints);
  const grouped = new Map<string, ComplaintRecord[]>();

  for (const c of unique) {
    const arr = grouped.get(c.customerName) ?? [];
    arr.push(c);
    grouped.set(c.customerName, arr);
  }

  const allDates = unique.map((c) => c.complaintDate).filter(Boolean).sort();
  let spanMonths = 1;
  if (allDates.length >= 2) {
    const start = new Date(allDates[0]).getTime();
    const end = new Date(allDates[allDates.length - 1]).getTime();
    if (!Number.isNaN(start) && !Number.isNaN(end)) {
      spanMonths = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24 * 30.4)) + 1);
    }
  }

  const rows: CustomerAnalyticsRow[] = [];
  for (const [customerName, items] of grouped.entries()) {
    const catMap = new Map<string, number>();
    const prods = new Set<string>();
    const months = new Set<string>();
    let criticalComplaints = 0;

    for (const c of items) {
      catMap.set(c.category, (catMap.get(c.category) ?? 0) + 1);
      prods.add(c.productName);
      months.add(c.complaintDate.slice(0, 7));
      if (c.severity === 'Critical') criticalComplaints += 1;
    }

    const mostReportedDefect =
      Array.from(catMap.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Other';

    rows.push({
      customerName,
      totalComplaints: items.length,
      mostReportedDefect,
      affectedProducts: Array.from(prods),
      criticalComplaints,
      monthlyFrequency: Number((items.length / spanMonths).toFixed(2)),
      activeMonths: months.size,
      complaints: [...items].sort((a, b) => b.complaintDate.localeCompare(a.complaintDate)),
    });
  }

  return rows.sort((a, b) => b.totalComplaints - a.totalComplaints || b.criticalComplaints - a.criticalComplaints);
}

// ---------- MODULE 5: PROCESS-WISE ANALYSIS ----------

export type StandardProcessFamily =
  | 'CNC Machining'
  | 'Welding'
  | 'Casting'
  | 'Grinding'
  | 'Assembly'
  | 'Heat Treatment'
  | 'Packaging'
  | 'Other';

export const STANDARD_PROCESS_FAMILIES: StandardProcessFamily[] = [
  'CNC Machining',
  'Welding',
  'Casting',
  'Grinding',
  'Assembly',
  'Heat Treatment',
  'Packaging',
];

export function classifyStandardProcessFamily(processName: string): StandardProcessFamily {
  const lower = processName.toLowerCase();
  if (/grind/.test(lower)) return 'Grinding';
  if (/cnc|machin|milling|turning|lathe|broach/.test(lower)) return 'CNC Machining';
  if (/weld|braz/.test(lower)) return 'Welding';
  if (/cast|foundry|mold|mould/.test(lower)) return 'Casting';
  if (/heat treat|forging|hardening|quench|temper|anneal/.test(lower)) return 'Heat Treatment';
  if (/packag|dispatch|shipping|crate|seal/.test(lower)) return 'Packaging';
  if (/assembl|winding|impregnat|mount|fit/.test(lower)) return 'Assembly';
  return 'Other';
}

export interface ProcessAnalyticsRow {
  processName: string;
  standardFamily: StandardProcessFamily;
  complaintCount: number;
  criticalCount: number;
  defectCategories: string[];
  affectedProducts: string[];
  affectedBatches: string[];
  verifiedRootCauses: string[];
  aiSuggestedCount: number;
  riskTier: RiskTier;
  riskScore: number;
  complaints: ComplaintRecord[];
}

export function computeProcessAnalytics(complaints: ComplaintRecord[]): ProcessAnalyticsRow[] {
  const unique = deduplicateComplaints(complaints);
  const riskByProcess = new Map(
    computeProcessRiskPredictions(unique).map((r) => [r.entityName, r])
  );

  const grouped = new Map<string, ComplaintRecord[]>();
  for (const c of unique) {
    const arr = grouped.get(c.processName) ?? [];
    arr.push(c);
    grouped.set(c.processName, arr);
  }

  const rows: ProcessAnalyticsRow[] = [];
  for (const [processName, items] of grouped.entries()) {
    const cats = new Set<string>();
    const prods = new Set<string>();
    const batches = new Set<string>();
    const verified = new Set<string>();
    let aiCount = 0;
    let criticalCount = 0;

    for (const c of items) {
      cats.add(c.category);
      prods.add(c.productName);
      if (c.batchNumber) batches.add(c.batchNumber);
      if (c.severity === 'Critical') criticalCount += 1;

      if (c.rootCauseAnalysis?.manualVerifiedRootCause?.trim()) {
        verified.add(c.rootCauseAnalysis.manualVerifiedRootCause.trim());
      }
      const vHyps =
        c.rootCauseAnalysis?.hypotheses.filter((h) => h.managerStatus === 'Verified') ?? [];
      vHyps.forEach((h) => verified.add(h.title));
      const unvHyps =
        c.rootCauseAnalysis?.hypotheses.filter((h) => h.managerStatus !== 'Verified') ?? [];
      aiCount += unvHyps.length;
    }

    const risk = riskByProcess.get(processName);
    rows.push({
      processName,
      standardFamily: classifyStandardProcessFamily(processName),
      complaintCount: items.length,
      criticalCount,
      defectCategories: Array.from(cats),
      affectedProducts: Array.from(prods),
      affectedBatches: Array.from(batches),
      verifiedRootCauses: Array.from(verified),
      aiSuggestedCount: aiCount,
      riskTier: risk?.riskTier ?? 'LOW',
      riskScore: risk?.riskScore ?? 0,
      complaints: [...items].sort((a, b) => b.complaintDate.localeCompare(a.complaintDate)),
    });
  }

  return rows.sort((a, b) => b.complaintCount - a.complaintCount || b.criticalCount - a.criticalCount);
}

// ---------- MODULE 6: PARETO ANALYSIS (80/20 RULE) ----------

export interface ParetoItem {
  name: string;
  count: number;
  percentage: number;
  cumulativeCount: number;
  cumulativePercent: number;
  isVitalFew80: boolean;
}

export function computeParetoAnalysis(
  complaints: ComplaintRecord[],
  dimension: 'category' | 'product' | 'process' = 'category'
): ParetoItem[] {
  const unique = deduplicateComplaints(complaints);
  if (unique.length === 0) return [];

  const counts = new Map<string, number>();
  for (const c of unique) {
    const key =
      dimension === 'product'
        ? c.productName
        : dimension === 'process'
          ? c.processName
          : c.category;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const total = unique.length;
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  let cumulativeCount = 0;
  let reached80 = false;

  return sorted.map(([name, count]) => {
    cumulativeCount += count;
    const percentage = Number(((count / total) * 100).toFixed(1));
    const cumulativePercent = Number(((cumulativeCount / total) * 100).toFixed(1));
    const isVitalFew80 = !reached80;
    if (cumulativePercent >= 80) {
      reached80 = true;
    }
    return {
      name,
      count,
      percentage,
      cumulativeCount,
      cumulativePercent,
      isVitalFew80,
    };
  });
}

// ---------- MODULE 7: RECURRING & CHRONIC DEFECT DETECTION ----------

export type DefectPatternClassification = 'New Problem' | 'Recurring Problem' | 'Chronic Problem';

export interface RecurringDetectionConfig {
  observationDays: number | null; // null = full dataset
  chronicThreshold: number; // default 3 (>= 2)
}

export interface DetectedDefectPattern {
  patternId: string;
  patternTitle: string;
  category: ComplaintCategory;
  classification: DefectPatternClassification;
  occurrences: number;
  firstOccurrence: string;
  mostRecentOccurrence: string;
  relatedComplaintIds: string[];
  affectedProducts: string[];
  relatedProcesses: string[];
  relatedMachines: string[];
  previousCorrectiveActions: string[];
  verifiedRootCauses: string[];
  matchingDimensions: string[];
}

const TOKEN_STOP = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'were', 'was', 'are', 'after',
  'during', 'into', 'than', 'high', 'low', 'part', 'parts', 'unit', 'units', 'batch',
  'spec', 'test', 'line', 'customer', 'reported', 'found', 'measured', 'above', 'below',
]);

function descriptionTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9.+/-]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !TOKEN_STOP.has(t))
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

export function detectRecurringDefects(
  complaints: ComplaintRecord[],
  config: RecurringDetectionConfig = { observationDays: null, chronicThreshold: 3 }
): DetectedDefectPattern[] {
  const unique = deduplicateComplaints(complaints);
  if (unique.length === 0) return [];

  const chronicThreshold = Math.max(2, config.chronicThreshold);
  const refDate = getReferenceDate(unique);
  const scoped =
    config.observationDays && config.observationDays > 0
      ? unique.filter((c) => {
          const cutoff = new Date(
            refDate.getTime() - config.observationDays! * 24 * 60 * 60 * 1000
          )
            .toISOString()
            .slice(0, 10);
          return c.complaintDate >= cutoff;
        })
      : unique;

  if (scoped.length === 0) return [];

  // Cluster complaints by (category + product) OR shared (category + process + machine/verifiedRC/high description similarity)
  interface Cluster {
    items: ComplaintRecord[];
    tokens: Set<string>;
    dimensions: Set<string>;
  }

  const clusters: Cluster[] = [];
  const sortedScoped = [...scoped].sort((a, b) => a.complaintDate.localeCompare(b.complaintDate));

  for (const c of sortedScoped) {
    const cTokens = descriptionTokens(`${c.description} ${c.testResults}`);
    const cVerified = c.rootCauseAnalysis?.manualVerifiedRootCause?.trim().toLowerCase() ?? '';
    let matchedCluster: Cluster | null = null;

    for (const cl of clusters) {
      const anchor = cl.items[0];
      if (anchor.category !== c.category) continue;

      const dims: string[] = ['Same defect category'];
      let match = false;

      if (anchor.productName === c.productName) {
        dims.push('Same product');
        match = true;
      }
      if (anchor.processName === c.processName && anchor.machineId && anchor.machineId === c.machineId) {
        dims.push(`Same process & machine (${c.machineId})`);
        match = true;
      }
      if (cVerified && cl.items.some((x) => (x.rootCauseAnalysis?.manualVerifiedRootCause?.trim().toLowerCase() ?? '') === cVerified)) {
        dims.push('Shared verified root cause');
        match = true;
      }
      if (!match && anchor.processName === c.processName && jaccardSimilarity(cl.tokens, cTokens) >= 0.25) {
        dims.push('Same process & similar defect signature');
        match = true;
      }
      if (!match && jaccardSimilarity(cl.tokens, cTokens) >= 0.35) {
        dims.push('Similar defect description');
        match = true;
      }

      if (match) {
        if (anchor.processName === c.processName && !dims.some((d) => d.includes('process'))) {
          dims.push('Same manufacturing process');
        }
        const batchPrefA = anchor.batchNumber.split('-').slice(0, 2).join('-');
        const batchPrefC = c.batchNumber.split('-').slice(0, 2).join('-');
        if (batchPrefA && batchPrefA === batchPrefC && anchor.batchNumber !== c.batchNumber) {
          dims.push('Related batch series');
        } else if (anchor.batchNumber === c.batchNumber) {
          dims.push('Same batch');
        }
        dims.forEach((d) => cl.dimensions.add(d));
        matchedCluster = cl;
        break;
      }
    }

    if (matchedCluster) {
      matchedCluster.items.push(c);
      for (const t of cTokens) matchedCluster.tokens.add(t);
    } else {
      clusters.push({
        items: [c],
        tokens: new Set(cTokens),
        dimensions: new Set(['Single occurrence baseline']),
      });
    }
  }

  const patterns: DetectedDefectPattern[] = clusters.map((cl, idx) => {
    const items = cl.items;
    const count = items.length;
    // Strict governance: single complaint NEVER classified as Chronic or Recurring
    const classification: DefectPatternClassification =
      count === 1
        ? 'New Problem'
        : count >= chronicThreshold
          ? 'Chronic Problem'
          : 'Recurring Problem';

    const dates = items.map((i) => i.complaintDate).sort();
    const products = Array.from(new Set(items.map((i) => i.productName)));
    const processes = Array.from(new Set(items.map((i) => i.processName)));
    const machines = Array.from(
      new Set(items.map((i) => i.machineId).filter((m): m is string => Boolean(m?.trim())))
    );
    const verifiedRcs = Array.from(
      new Set(
        items
          .map((i) => i.rootCauseAnalysis?.manualVerifiedRootCause?.trim())
          .filter((v): v is string => Boolean(v))
      )
    );
    const prevCapas = Array.from(
      new Set(
        items.flatMap((i) =>
          i.capaActions
            .filter((a) => a.approvalStatus !== 'Rejected')
            .map((a) => `${a.title} (${a.completionStatus})`)
        )
      )
    );

    const anchor = items[0];
    const patternTitle =
      products.length === 1
        ? `${products[0]} — ${anchor.category}`
        : `${anchor.category} (${processes[0]})`;

    const dimsList = Array.from(cl.dimensions).filter(
      (d) => !(count > 1 && d === 'Single occurrence baseline')
    );

    return {
      patternId: `PAT-${String(idx + 1).padStart(3, '0')}`,
      patternTitle,
      category: anchor.category,
      classification,
      occurrences: count,
      firstOccurrence: dates[0] ?? '—',
      mostRecentOccurrence: dates[dates.length - 1] ?? '—',
      relatedComplaintIds: items.map((i) => i.id),
      affectedProducts: products,
      relatedProcesses: processes,
      relatedMachines: machines,
      previousCorrectiveActions: prevCapas,
      verifiedRootCauses: verifiedRcs,
      matchingDimensions: dimsList,
    };
  });

  const rankOrder: Record<DefectPatternClassification, number> = {
    'Chronic Problem': 0,
    'Recurring Problem': 1,
    'New Problem': 2,
  };

  return patterns.sort(
    (a, b) =>
      rankOrder[a.classification] - rankOrder[b.classification] ||
      b.occurrences - a.occurrences ||
      b.mostRecentOccurrence.localeCompare(a.mostRecentOccurrence)
  );
}

// ---------- MODULE 8: CORRELATION & PARAMETER ANALYSIS ----------

export type NumericParamKey =
  | 'temperature'
  | 'pressure'
  | 'machineSpeed'
  | 'feedRate'
  | 'toolOffset'
  | 'materialHardness'
  | 'dimensionalValue'
  | 'severityScore';

export interface ParameterMeta {
  key: NumericParamKey;
  label: string;
  unit: string;
}

export const ANALYZED_PARAMETERS: ParameterMeta[] = [
  { key: 'temperature', label: 'Temperature', unit: '°C' },
  { key: 'pressure', label: 'Pressure', unit: 'bar' },
  { key: 'machineSpeed', label: 'Machine Speed', unit: 'RPM' },
  { key: 'feedRate', label: 'Feed Rate', unit: 'mm/rev or mm/min' },
  { key: 'toolOffset', label: 'Tool Offset', unit: 'mm' },
  { key: 'materialHardness', label: 'Material Hardness', unit: 'HRC' },
  { key: 'dimensionalValue', label: 'Dimensional Reading', unit: 'mm' },
  { key: 'severityScore', label: 'Severity Score', unit: '1–4 scale' },
];

const SEVERITY_NUM: Record<SeverityLevel, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
};

function parseFirstNumber(str: string | undefined): number | null {
  if (!str) return null;
  const m = str.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const val = Number(m[0]);
  return Number.isFinite(val) ? val : null;
}

export interface ExtractedComplaintTelemetry {
  complaint: ComplaintRecord;
  values: Record<NumericParamKey, number | null>;
  productionShift: string | null;
}

function matchFirstInSegments(segments: string[], regex: RegExp): RegExpMatchArray | null {
  for (const seg of segments) {
    const m = seg.match(regex);
    if (m) return m;
  }
  return null;
}

/**
 * Extracts ONLY genuinely recorded measurements from explicit fields and
 * structured parameter/test text. Never invents missing values.
 */
export function extractComplaintTelemetry(c: ComplaintRecord): ExtractedComplaintTelemetry {
  const params = c.processParameters ?? '';
  const test = c.testResults ?? '';
  const paramSegments = params
    .split(/[|;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const testSegments = test
    .split(/[|;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const allSegments = [...paramSegments, ...testSegments];

  // Temperature (°C)
  let temperature = parseFirstNumber(c.temperature);
  if (temperature === null) {
    const m = matchFirstInSegments(
      allSegments,
      /(?:billet\s*temp|quench\s*oil|heat\s*seal\s*temp|resin\s*temp|bake|rig\s*temp|temp(?:erature)?)[^0-9|;\n-]*(-?\d+(?:\.\d+)?)\s*(?:°?\s*C\b)/i
    );
    if (m) temperature = Number(m[1]);
  }

  // Pressure (bar) — normalize mbar/psi to bar only when unit is explicit
  let pressure = parseFirstNumber(c.pressure);
  if (pressure === null) {
    const mBar = matchFirstInSegments(
      allSegments,
      /(?:coolant|flush\s*pressure|fixture\s*clamp|pressure|vacuum)[^0-9|;\n-]*(-?\d+(?:\.\d+)?)\s*(mbar|bar|psi)\b/i
    );
    if (mBar) {
      const raw = Number(mBar[1]);
      const unit = mBar[2].toLowerCase();
      pressure =
        unit === 'mbar'
          ? Number((raw / 1000).toFixed(4))
          : unit === 'psi'
            ? Number((raw * 0.06895).toFixed(2))
            : raw;
    }
  }

  // Machine Speed (RPM)
  let machineSpeed: number | null = null;
  const mRpm = matchFirstInSegments(
    allSegments,
    /(?:wheel\s*speed|tap\s*speed|spindle\s*speed|speed|rpm)[^0-9|;\n-]*(\d+(?:\.\d+)?)\s*RPM\b/i
  );
  if (mRpm) machineSpeed = Number(mRpm[1]);

  // Feed Rate
  let feedRate: number | null = null;
  const mFeed = matchFirstInSegments(
    allSegments,
    /feed[^0-9|;\n-]*(\d+(?:\.\d+)?)\s*(?:mm\/rev|mm\/min)\b/i
  );
  if (mFeed) feedRate = Number(mFeed[1]);

  // Tool Offset (explicit mm mentions only; never match mm/min or mm/rev)
  let toolOffset: number | null = null;
  const mOffset = matchFirstInSegments(
    allSegments,
    /(?:tool\s*offset|offset)[^0-9+|;\n-]*([+-]?\d+(?:\.\d+)?)\s*mm(?![a-z/])/i
  );
  if (mOffset) toolOffset = Number(mOffset[1]);

  // Material Hardness (HRC)
  let materialHardness: number | null = null;
  const mHrc = matchFirstInSegments(
    allSegments,
    /(?:rockwell\s*c|core\s*hardness|hardness)[^0-9|;\n]*(\d+(?:\.\d+)?)\s*HRC\b/i
  );
  if (mHrc) materialHardness = Number(mHrc[1]);

  // Dimensional measurement (mm)
  const actualRaw = c.actualValue?.trim() ?? '';
  const actualHasNonLengthUnit = /(?:°?\s*C\b|\bbar\b|\bpsi\b|\bmbar\b|\bhrc\b|\brpm\b|%)/i.test(actualRaw);
  let dimensionalValue = actualHasNonLengthUnit ? null : parseFirstNumber(actualRaw);
  if (dimensionalValue === null) {
    const mDim = matchFirstInSegments(
      testSegments,
      /(?:cmm\s*runout|micrometer\s*od|flatness|width|pitch\s*dia|case\s*depth|linear\s*indication)[^0-9+|;\n-]*([+-]?\d+(?:\.\d+)?)\s*mm(?![a-z/])/i
    );
    if (mDim) dimensionalValue = Number(mDim[1]);
  }

  const productionShift = c.productionShift?.trim() || null;

  return {
    complaint: c,
    values: {
      temperature: Number.isFinite(temperature as number) ? temperature : null,
      pressure: Number.isFinite(pressure as number) ? pressure : null,
      machineSpeed: Number.isFinite(machineSpeed as number) ? machineSpeed : null,
      feedRate: Number.isFinite(feedRate as number) ? feedRate : null,
      toolOffset: Number.isFinite(toolOffset as number) ? toolOffset : null,
      materialHardness: Number.isFinite(materialHardness as number) ? materialHardness : null,
      dimensionalValue: Number.isFinite(dimensionalValue as number) ? dimensionalValue : null,
      severityScore: SEVERITY_NUM[c.severity],
    },
    productionShift,
  };
}

function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3) return null;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  if (den === 0) return null;
  return Number((num / den).toFixed(3));
}

function rankArray(vals: number[]): number[] {
  const indexed = vals.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(vals.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[indexed[k].i] = avgRank;
    i = j + 1;
  }
  return ranks;
}

function spearmanCorrelation(xs: number[], ys: number[]): number | null {
  if (xs.length < 3) return null;
  return pearsonCorrelation(rankArray(xs), rankArray(ys));
}

export interface CorrelationPairResult {
  paramX: NumericParamKey;
  labelX: string;
  paramY: NumericParamKey;
  labelY: string;
  sampleSize: number;
  missingCount: number;
  pearsonR: number | null;
  spearmanRho: number | null;
  status: 'Computed' | 'Insufficient Observations' | 'Zero Variance';
  strengthLabel: string;
  limitationNote: string;
}

export interface ParameterCoverageSummary {
  key: NumericParamKey;
  label: string;
  unit: string;
  observedCount: number;
  missingCount: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  rangeBuckets: Array<{
    bandLabel: string;
    complaints: number;
    criticalOrHigh: number;
  }>;
}

export interface ShiftBreakdownRow {
  shift: string;
  complaints: number;
  criticalOrHigh: number;
  sharePercent: number;
}

export interface CorrelationAnalysisResult {
  totalRecords: number;
  telemetryRows: ExtractedComplaintTelemetry[];
  parameterCoverage: ParameterCoverageSummary[];
  severityCorrelations: CorrelationPairResult[];
  pairwiseMatrix: CorrelationPairResult[];
  shiftBreakdown: ShiftBreakdownRow[];
  shiftMissingCount: number;
  globalMethodNote: string;
}

export function computeParameterCorrelations(
  complaints: ComplaintRecord[]
): CorrelationAnalysisResult {
  const unique = deduplicateComplaints(complaints);
  const telemetryRows = unique.map(extractComplaintTelemetry);
  const totalRecords = unique.length;

  const parameterCoverage: ParameterCoverageSummary[] = ANALYZED_PARAMETERS.map((meta) => {
    const observed = telemetryRows
      .map((t) => t.values[meta.key])
      .filter((v): v is number => v !== null);
    const missingCount = totalRecords - observed.length;
    const min = observed.length > 0 ? Math.min(...observed) : null;
    const max = observed.length > 0 ? Math.max(...observed) : null;
    const mean =
      observed.length > 0
        ? Number((observed.reduce((a, b) => a + b, 0) / observed.length).toFixed(2))
        : null;

    const rangeBuckets: ParameterCoverageSummary['rangeBuckets'] = [];
    if (observed.length >= 3 && min !== null && max !== null && max > min) {
      const span = max - min;
      const b1 = min + span / 3;
      const b2 = min + (2 * span) / 3;
      const bands = [
        { label: `Low (${min.toFixed(1)}–${b1.toFixed(1)})`, test: (v: number) => v <= b1 },
        { label: `Mid (${b1.toFixed(1)}–${b2.toFixed(1)})`, test: (v: number) => v > b1 && v <= b2 },
        { label: `High (${b2.toFixed(1)}–${max.toFixed(1)})`, test: (v: number) => v > b2 },
      ];
      bands.forEach((b) => {
        const matching = telemetryRows.filter((r) => {
          const val = r.values[meta.key];
          return val !== null && b.test(val);
        });
        rangeBuckets.push({
          bandLabel: b.label,
          complaints: matching.length,
          criticalOrHigh: matching.filter(
            (m) => m.complaint.severity === 'Critical' || m.complaint.severity === 'High'
          ).length,
        });
      });
    }

    return {
      key: meta.key,
      label: meta.label,
      unit: meta.unit,
      observedCount: observed.length,
      missingCount,
      min,
      max,
      mean,
      rangeBuckets,
    };
  });

  const computePair = (metaX: ParameterMeta, metaY: ParameterMeta): CorrelationPairResult => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const row of telemetryRows) {
      const vx = row.values[metaX.key];
      const vy = row.values[metaY.key];
      if (vx !== null && vy !== null) {
        xs.push(vx);
        ys.push(vy);
      }
    }
    const sampleSize = xs.length;
    const missingCount = totalRecords - sampleSize;

    if (sampleSize < 3) {
      return {
        paramX: metaX.key,
        labelX: metaX.label,
        paramY: metaY.key,
        labelY: metaY.label,
        sampleSize,
        missingCount,
        pearsonR: null,
        spearmanRho: null,
        status: 'Insufficient Observations',
        strengthLabel: `Insufficient (n=${sampleSize} < 3)`,
        limitationNote: `Only ${sampleSize} paired record(s) with recorded values (${missingCount} missing). Minimum n=3 required without inventing data.`,
      };
    }

    const r = pearsonCorrelation(xs, ys);
    const rho = spearmanCorrelation(xs, ys);

    if (r === null && rho === null) {
      return {
        paramX: metaX.key,
        labelX: metaX.label,
        paramY: metaY.key,
        labelY: metaY.label,
        sampleSize,
        missingCount,
        pearsonR: null,
        spearmanRho: null,
        status: 'Zero Variance',
        strengthLabel: 'No variation in sample',
        limitationNote: `All ${sampleSize} paired records share constant values; correlation cannot be computed.`,
      };
    }

    const absMax = Math.max(Math.abs(r ?? 0), Math.abs(rho ?? 0));
    const dir = (r ?? rho ?? 0) >= 0 ? 'Positive' : 'Negative';
    const mag = absMax >= 0.7 ? 'Strong' : absMax >= 0.4 ? 'Moderate' : 'Weak';
    const smallSampleFlag =
      sampleSize < 8 ? ` Small sample (n=${sampleSize}) limits statistical power.` : '';

    return {
      paramX: metaX.key,
      labelX: metaX.label,
      paramY: metaY.key,
      labelY: metaY.label,
      sampleSize,
      missingCount,
      pearsonR: r,
      spearmanRho: rho,
      status: 'Computed',
      strengthLabel: `${mag} ${dir}`,
      limitationNote: `Observed across n=${sampleSize} records (${missingCount} missing).${smallSampleFlag} Correlation does not prove causation.`,
    };
  };

  const severityMeta = ANALYZED_PARAMETERS.find((p) => p.key === 'severityScore')!;
  const processParams = ANALYZED_PARAMETERS.filter((p) => p.key !== 'severityScore');

  const severityCorrelations = processParams.map((p) => computePair(p, severityMeta));

  const pairwiseMatrix: CorrelationPairResult[] = [];
  for (let i = 0; i < ANALYZED_PARAMETERS.length; i++) {
    for (let j = i + 1; j < ANALYZED_PARAMETERS.length; j++) {
      pairwiseMatrix.push(computePair(ANALYZED_PARAMETERS[i], ANALYZED_PARAMETERS[j]));
    }
  }

  const shiftMap = new Map<string, ComplaintRecord[]>();
  let shiftMissingCount = 0;
  for (const row of telemetryRows) {
    if (!row.productionShift) {
      shiftMissingCount += 1;
      continue;
    }
    const arr = shiftMap.get(row.productionShift) ?? [];
    arr.push(row.complaint);
    shiftMap.set(row.productionShift, arr);
  }

  const shiftTotal = Math.max(1, totalRecords - shiftMissingCount);
  const shiftBreakdown: ShiftBreakdownRow[] = Array.from(shiftMap.entries())
    .map(([shift, items]) => ({
      shift,
      complaints: items.length,
      criticalOrHigh: items.filter((i) => i.severity === 'Critical' || i.severity === 'High').length,
      sharePercent: Number(((items.length / shiftTotal) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.complaints - a.complaints);

  return {
    totalRecords,
    telemetryRows,
    parameterCoverage,
    severityCorrelations,
    pairwiseMatrix,
    shiftBreakdown,
    shiftMissingCount,
    globalMethodNote:
      'Values are extracted exclusively from recorded complaint parameters and test logs. Correlation coefficients (Pearson r / Spearman rho) measure linear or monotonic co-variation only and NEVER prove manufacturing root-cause causation.',
  };
}

// ---------- MODULE 9: QUALITY HEATMAP ----------

export type HeatmapMode =
  | 'product-category'
  | 'process-category'
  | 'batch-category'
  | 'product-process';

export interface HeatmapMatrix {
  rowTitle: string;
  colLabels: string[];
  rows: Array<{
    rowLabel: string;
    total: number;
    cells: Array<{
      colLabel: string;
      count: number;
      criticalCount: number;
      complaintIds: string[];
    }>;
  }>;
  maxCellCount: number;
  repeatedClusterCount: number;
}

export function computeQualityHeatmap(
  complaints: ComplaintRecord[],
  mode: HeatmapMode
): HeatmapMatrix {
  const unique = deduplicateComplaints(complaints);
  const rowKeysSet = new Set<string>();
  const colKeysSet = new Set<string>();

  const getRow = (c: ComplaintRecord) => {
    if (mode === 'process-category') return c.processName;
    if (mode === 'batch-category') return c.batchNumber || 'UNSPECIFIED';
    return c.productName;
  };
  const getCol = (c: ComplaintRecord) => {
    if (mode === 'product-process') return c.processName;
    return c.category;
  };

  for (const c of unique) {
    rowKeysSet.add(getRow(c));
    colKeysSet.add(getCol(c));
  }

  const colLabels =
    mode === 'product-process'
      ? Array.from(colKeysSet).sort()
      : ALL_CATEGORIES.filter((cat) => colKeysSet.has(cat));

  const rowLabels = Array.from(rowKeysSet).sort((a, b) => {
    const ca = unique.filter((c) => getRow(c) === a).length;
    const cb = unique.filter((c) => getRow(c) === b).length;
    return cb - ca || a.localeCompare(b);
  });

  const limitedRowLabels = mode === 'batch-category' ? rowLabels.slice(0, 20) : rowLabels;

  let maxCellCount = 1;
  let repeatedClusterCount = 0;

  const rows = limitedRowLabels.map((rowLabel) => {
    const rowItems = unique.filter((c) => getRow(c) === rowLabel);
    const cells = colLabels.map((colLabel) => {
      const matches = rowItems.filter((c) => getCol(c) === colLabel);
      const count = matches.length;
      if (count > maxCellCount) maxCellCount = count;
      if (count >= 2) repeatedClusterCount += 1;
      return {
        colLabel,
        count,
        criticalCount: matches.filter((m) => m.severity === 'Critical').length,
        complaintIds: matches.map((m) => m.id),
      };
    });
    return {
      rowLabel,
      total: rowItems.length,
      cells,
    };
  });

  const rowTitle =
    mode === 'process-category'
      ? 'Manufacturing Process'
      : mode === 'batch-category'
        ? 'Production Batch'
        : 'Product Name';

  return {
    rowTitle,
    colLabels,
    rows,
    maxCellCount,
    repeatedClusterCount,
  };
}

// ---------- MODULE 10: TIME-BASED TREND ANALYSIS ----------

export interface TimeTrendBucket {
  periodKey: string;
  label: string;
  total: number;
  open: number;
  closed: number;
  critical: number;
}

export function computeTimeTrends(
  complaints: ComplaintRecord[],
  granularity: 'monthly' | 'quarterly' | 'yearly'
): TimeTrendBucket[] {
  const unique = deduplicateComplaints(complaints);
  const map = new Map<string, TimeTrendBucket>();

  for (const c of unique) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(c.complaintDate)) continue;
    const year = c.complaintDate.slice(0, 4);
    const monthNum = Number(c.complaintDate.slice(5, 7));

    let periodKey = year;
    let label = year;
    if (granularity === 'monthly') {
      periodKey = c.complaintDate.slice(0, 7);
      const d = new Date(Number(year), monthNum - 1, 1);
      label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    } else if (granularity === 'quarterly') {
      const q = Math.floor((monthNum - 1) / 3) + 1;
      periodKey = `${year}-Q${q}`;
      label = `Q${q} ${year}`;
    }

    const bucket = map.get(periodKey) ?? {
      periodKey,
      label,
      total: 0,
      open: 0,
      closed: 0,
      critical: 0,
    };
    bucket.total += 1;
    if (c.status === 'Closed') bucket.closed += 1;
    else bucket.open += 1;
    if (c.severity === 'Critical') bucket.critical += 1;
    map.set(periodKey, bucket);
  }

  return Array.from(map.values()).sort((a, b) => a.periodKey.localeCompare(b.periodKey));
}

export interface MultiSeriesTimePoint {
  month: string;
  label: string;
  [seriesName: string]: string | number;
}

export function computeCategoryTimeTrends(complaints: ComplaintRecord[]): {
  seriesKeys: ComplaintCategory[];
  points: MultiSeriesTimePoint[];
} {
  const unique = deduplicateComplaints(complaints);
  const activeCats = ALL_CATEGORIES.filter((cat) => unique.some((c) => c.category === cat));
  const map = new Map<string, MultiSeriesTimePoint>();

  for (const c of unique) {
    const month = c.complaintDate.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    let pt = map.get(month);
    if (!pt) {
      const [y, m] = month.split('-');
      const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', {
        month: 'short',
        year: '2-digit',
      });
      pt = { month, label };
      activeCats.forEach((cat) => {
        pt![cat] = 0;
      });
      map.set(month, pt);
    }
    pt[c.category] = Number(pt[c.category] ?? 0) + 1;
  }

  return {
    seriesKeys: activeCats,
    points: Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month)),
  };
}

export function computeProductTimeTrends(
  complaints: ComplaintRecord[],
  topN = 5
): {
  seriesKeys: string[];
  points: MultiSeriesTimePoint[];
} {
  const unique = deduplicateComplaints(complaints);
  const topProducts = computeProductAnalytics(unique)
    .slice(0, topN)
    .map((p) => p.productName);
  const topSet = new Set(topProducts);
  const map = new Map<string, MultiSeriesTimePoint>();

  for (const c of unique) {
    const month = c.complaintDate.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    let pt = map.get(month);
    if (!pt) {
      const [y, m] = month.split('-');
      const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', {
        month: 'short',
        year: '2-digit',
      });
      pt = { month, label };
      topProducts.forEach((p) => {
        pt![p] = 0;
      });
      map.set(month, pt);
    }
    if (topSet.has(c.productName)) {
      pt[c.productName] = Number(pt[c.productName] ?? 0) + 1;
    }
  }

  return {
    seriesKeys: topProducts,
    points: Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month)),
  };
}

export interface BeforeAfterCapaComparisonRow {
  capaId: string;
  complaintId: string;
  productName: string;
  actionTitle: string;
  complaintsBefore: number;
  complaintsAfter: number;
  reductionPercent: number | null;
  effectivenessStatus: string;
}

export function computeBeforeAfterCapaStats(
  complaints: ComplaintRecord[]
): BeforeAfterCapaComparisonRow[] {
  const unique = deduplicateComplaints(complaints);
  const rows: BeforeAfterCapaComparisonRow[] = [];

  for (const c of unique) {
    for (const a of c.capaActions) {
      if (a.approvalStatus === 'Rejected') continue;
      if (
        a.effectivenessTracking.complaintsAfter !== null &&
        a.effectivenessTracking.complaintsAfter !== undefined
      ) {
        rows.push({
          capaId: a.id,
          complaintId: c.id,
          productName: c.productName,
          actionTitle: a.title,
          complaintsBefore: a.effectivenessTracking.complaintsBefore,
          complaintsAfter: a.effectivenessTracking.complaintsAfter,
          reductionPercent: computeReductionPercent(
            a.effectivenessTracking.complaintsBefore,
            a.effectivenessTracking.complaintsAfter
          ),
          effectivenessStatus: deriveEffectivenessStatus(a),
        });
      }
    }
  }

  return rows;
}

// ---------- MODULE 12: CSV EXPORT HELPERS ----------

export function exportAnalyticsDatasetCsv(
  complaints: ComplaintRecord[],
  productRows: ProductAnalyticsRow[],
  batchRows: BatchAnalyticsRow[],
  processRows: ProcessAnalyticsRow[],
  paretoRows: ParetoItem[],
  recurringRows: DetectedDefectPattern[]
) {
  const headers = [
    'Section',
    'Entity / Pattern',
    'Secondary Key',
    'Complaint Count',
    'Critical Count',
    'Share / Cumulative %',
    'Classification / Risk',
    'Details / Verified Root Causes',
  ];

  const rows: Array<Array<unknown>> = [];

  paretoRows.forEach((p) => {
    rows.push([
      'Pareto (80/20)',
      p.name,
      p.isVitalFew80 ? 'Vital Few <=80%' : 'Tail >80%',
      p.count,
      '',
      `${p.percentage}% (Cum: ${p.cumulativePercent}%)`,
      p.isVitalFew80 ? 'Major Contributor' : 'Minor Contributor',
      `Total filtered complaints: ${complaints.length}`,
    ]);
  });

  productRows.forEach((p) => {
    rows.push([
      'Product Analysis',
      p.productName,
      p.productId,
      p.totalComplaints,
      p.criticalComplaints,
      `${p.affectedBatchesCount} batch(es)`,
      `${p.riskLevel} (${p.riskScore}/100) · ${p.trendDirection}`,
      `Top defect: ${p.mostCommonDefect}`,
    ]);
  });

  batchRows.forEach((b) => {
    rows.push([
      'Batch Analysis',
      b.batchNumber,
      b.productName,
      b.totalComplaints,
      b.criticalCount,
      `${b.complaintFrequencyShare}%`,
      b.isRepeated ? 'Repeated Batch' : 'Single Incident',
      b.verifiedRootCauses.length > 0
        ? `Verified RC: ${b.verifiedRootCauses.join('; ')}`
        : 'No verified root cause recorded',
    ]);
  });

  processRows.forEach((pr) => {
    rows.push([
      'Process Analysis',
      pr.processName,
      pr.standardFamily,
      pr.complaintCount,
      pr.criticalCount,
      `${pr.affectedBatches.length} batch(es)`,
      `${pr.riskTier} (${pr.riskScore}/100)`,
      pr.verifiedRootCauses.length > 0
        ? `Verified RC: ${pr.verifiedRootCauses.join('; ')}`
        : `Unverified AI hypotheses: ${pr.aiSuggestedCount}`,
    ]);
  });

  recurringRows.forEach((r) => {
    rows.push([
      'Recurring & Chronic Detection',
      r.patternTitle,
      r.category,
      r.occurrences,
      '',
      `${r.firstOccurrence} to ${r.mostRecentOccurrence}`,
      r.classification,
      `IDs: ${r.relatedComplaintIds.join(', ')}`,
    ]);
  });

  downloadCsvFile('q-intelligence-quality-analytics-summary.csv', headers, rows);
}
