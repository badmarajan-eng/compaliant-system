import type {
  AIClassificationResult,
  ComplaintCategory,
  ComplaintRecord,
  SeverityLevel,
} from '../types/qms';

export interface HistoricalComplaintContext {
  id: string;
  productName: string;
  productId: string;
  batchNumber: string;
  category: string;
  severity: string;
  processName: string;
  complaintDate: string;
  description: string;
  testResults: string;
  verifiedRootCause?: string;
}

/**
 * Deterministic fingerprint of complaint telemetry analyzed by Gemini.
 * If any of these fields change after an analysis is saved, that analysis
 * is flagged as outdated while preserving its full history.
 */
export function computeComplaintFingerprint(complaint: ComplaintRecord): string {
  const parts = [
    complaint.id,
    complaint.customerName,
    complaint.productName,
    complaint.productId,
    complaint.batchNumber,
    complaint.category,
    complaint.severity,
    complaint.description,
    complaint.processName,
    complaint.machineId ?? '',
    complaint.processParameters,
    complaint.temperature ?? '',
    complaint.pressure ?? '',
    complaint.testType ?? '',
    complaint.expectedValue ?? '',
    complaint.actualValue ?? '',
    complaint.testResults,
  ];
  return parts.map((p) => p.trim()).join('|');
}

/**
 * Selects the most relevant historical complaints (matching product, process,
 * batch, or category) to pass to Gemini for pattern comparison.
 */
export function selectRelatedHistoricalComplaints(
  target: ComplaintRecord,
  allComplaints: ComplaintRecord[],
  limit = 14
): HistoricalComplaintContext[] {
  const scored = allComplaints
    .filter((c) => c.id !== target.id)
    .map((c) => {
      let score = 0;
      if (c.productId === target.productId || c.productName === target.productName) score += 4;
      if (c.processName === target.processName) score += 3;
      if (c.category === target.category) score += 2;
      if (c.batchNumber === target.batchNumber) score += 3;
      return { record: c, score };
    })
    .sort(
      (a, b) =>
        b.score - a.score || b.record.complaintDate.localeCompare(a.record.complaintDate)
    )
    .slice(0, limit);

  return scored.map(({ record: c }) => ({
    id: c.id,
    productName: c.productName,
    productId: c.productId,
    batchNumber: c.batchNumber,
    category: c.category,
    severity: c.severity,
    processName: c.processName,
    complaintDate: c.complaintDate,
    description: c.description,
    testResults: c.testResults,
    verifiedRootCause:
      c.rootCauseAnalysis?.manualVerifiedRootCause ||
      c.rootCauseAnalysis?.hypotheses.find((h) => h.managerStatus === 'Verified')?.title,
  }));
}

/**
 * Safely hydrates legacy stored AIClassificationResult shapes into the
 * structured schema without losing saved data in LocalStorage.
 */
export function hydrateAIClassificationResult(
  raw: unknown,
  complaint: ComplaintRecord
): AIClassificationResult | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;

  const validCategories: ComplaintCategory[] = [
    'Product Quality',
    'Dimensional Defects',
    'Material Defects',
    'Performance Issues',
    'Delivery Issues',
    'Packaging Issues',
    'Other',
  ];
  const validSeverities: SeverityLevel[] = ['Low', 'Medium', 'High', 'Critical'];

  const predictedCategory = validCategories.includes(r.predictedCategory as ComplaintCategory)
    ? (r.predictedCategory as ComplaintCategory)
    : complaint.category;

  const rawSev = (r.suggestedSeverity ?? r.recommendedSeverity) as SeverityLevel;
  const suggestedSeverity = validSeverities.includes(rawSev) ? rawSev : complaint.severity;

  const confObj =
    r.confidence && typeof r.confidence === 'object'
      ? (r.confidence as Record<string, unknown>)
      : null;

  const score = confObj
    ? Math.max(0, Math.min(100, Math.round(Number(confObj.score) || 0)))
    : Math.max(0, Math.min(100, Math.round(Number(r.confidenceScore) || 75)));

  const explanation =
    (confObj && typeof confObj.explanation === 'string' && confObj.explanation) ||
    (typeof r.severityJustification === 'string' && r.severityJustification) ||
    'Confidence derived from available defect description, process parameters, and inspection records.';

  const possibleCauses = Array.isArray(r.possibleCauses)
    ? r.possibleCauses
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map((item, idx) => ({
          id: typeof item.id === 'string' && item.id ? item.id : `CAUSE-${idx + 1}`,
          cause: String(item.cause || ''),
          reason: String(item.reason || ''),
          evidenceAvailable: String(item.evidenceAvailable || ''),
          additionalVerificationRequired: String(item.additionalVerificationRequired || ''),
        }))
    : [];

  const historicalPattern =
    typeof r.historicalPattern === 'string' && r.historicalPattern.trim()
      ? r.historicalPattern
      : Array.isArray(r.qualityPatterns) && r.qualityPatterns.length > 0
      ? (r.qualityPatterns as string[]).join(' ')
      : 'No historical pattern summary recorded.';

  return {
    analysisId:
      typeof r.analysisId === 'string' && r.analysisId
        ? r.analysisId
        : `AI-${complaint.id}-${String(r.analyzedAt || Date.now())}`,
    complaintId: typeof r.complaintId === 'string' && r.complaintId ? r.complaintId : complaint.id,
    predictedCategory,
    suggestedSeverity,
    defectKeywords: Array.isArray(r.defectKeywords) ? r.defectKeywords.map(String) : [],
    mainQualityIssue:
      typeof r.mainQualityIssue === 'string' && r.mainQualityIssue
        ? r.mainQualityIssue
        : String(r.analysisSummary || complaint.description),
    analysisSummary: String(r.analysisSummary || ''),
    possibleCauses,
    historicalPattern,
    recommendedInvestigationSteps: Array.isArray(r.recommendedInvestigationSteps)
      ? r.recommendedInvestigationSteps.map(String)
      : [],
    confidence: {
      score,
      explanation,
    },
    analyzedAt: typeof r.analyzedAt === 'string' ? r.analyzedAt : new Date().toISOString(),
    modelName: typeof r.modelName === 'string' ? r.modelName : undefined,
    sourceFingerprint:
      typeof r.sourceFingerprint === 'string' && r.sourceFingerprint
        ? r.sourceFingerprint
        : computeComplaintFingerprint(complaint),
    managerVerification: r.managerVerification as AIClassificationResult['managerVerification'],
  };
}
