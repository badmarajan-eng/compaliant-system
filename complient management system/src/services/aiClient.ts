import type {
  AIClassificationResult,
  AITrendExplanation,
  ComplaintRecord,
  RootCauseAnalysisRecord,
} from '../types/qms';
import {
  computeComplaintFingerprint,
  selectRelatedHistoricalComplaints,
} from '../utils/aiAnalysisUtils';
import { findMatchingHistoricalComplaints } from '../utils/rcaUtils';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      'Network connection failed while reaching the Q-INTELLIGENCE backend. Check that the server is running and retry.'
    );
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      (data && typeof data.error === 'string' && data.error) ||
      `AI service request failed with status ${response.status}.`;
    throw new Error(message);
  }
  return data as T;
}

interface RawClassificationApiResponse {
  complaintId: string;
  predictedCategory: AIClassificationResult['predictedCategory'];
  suggestedSeverity: AIClassificationResult['suggestedSeverity'];
  defectKeywords: string[];
  mainQualityIssue: string;
  analysisSummary: string;
  possibleCauses: Array<{
    cause: string;
    reason: string;
    evidenceAvailable: string;
    additionalVerificationRequired: string;
  }>;
  historicalPattern: string;
  recommendedInvestigationSteps: string[];
  confidence: {
    score: number;
    explanation: string;
  };
  analyzedAt: string;
  modelName?: string;
}

export async function requestComplaintClassification(
  complaint: ComplaintRecord,
  allComplaints: ComplaintRecord[] = []
): Promise<AIClassificationResult> {
  if (!complaint.description || complaint.description.trim().length < 5) {
    throw new Error(
      'Complaint description is empty or too short. Edit the complaint to add a defect description before running AI analysis.'
    );
  }
  if (!complaint.id || !complaint.productName || !complaint.customerName) {
    throw new Error(
      'Missing mandatory complaint metadata (Complaint ID, Product Name, or Customer Name).'
    );
  }

  const historicalComplaints = selectRelatedHistoricalComplaints(
    complaint,
    allComplaints,
    14
  );

  const raw = await postJson<RawClassificationApiResponse>('/api/ai/classify', {
    complaint,
    historicalComplaints,
  });

  if (
    !raw ||
    !raw.predictedCategory ||
    !raw.suggestedSeverity ||
    !Array.isArray(raw.possibleCauses) ||
    !raw.confidence
  ) {
    throw new Error(
      'Received an incomplete AI classification response from the server. Please retry.'
    );
  }

  const analyzedAt = raw.analyzedAt || new Date().toISOString();
  const analysisId = `AI-${complaint.id}-${Date.now()}`;

  return {
    analysisId,
    complaintId: raw.complaintId || complaint.id,
    predictedCategory: raw.predictedCategory,
    suggestedSeverity: raw.suggestedSeverity,
    defectKeywords: raw.defectKeywords ?? [],
    mainQualityIssue: raw.mainQualityIssue,
    analysisSummary: raw.analysisSummary,
    possibleCauses: raw.possibleCauses.map((c, idx) => ({
      id: `${analysisId}-CAUSE-${idx + 1}`,
      cause: c.cause,
      reason: c.reason,
      evidenceAvailable: c.evidenceAvailable,
      additionalVerificationRequired: c.additionalVerificationRequired,
    })),
    historicalPattern: raw.historicalPattern,
    recommendedInvestigationSteps: raw.recommendedInvestigationSteps ?? [],
    confidence: raw.confidence,
    analyzedAt,
    modelName: raw.modelName,
    sourceFingerprint: computeComplaintFingerprint(complaint),
    managerVerification: {
      decision: 'Pending',
      confirmedCategory: raw.predictedCategory,
      confirmedSeverity: raw.suggestedSeverity,
      causeDecisions: raw.possibleCauses.map((_, idx) => ({
        causeId: `${analysisId}-CAUSE-${idx + 1}`,
        status: 'Pending Review',
      })),
      investigationNotes: '',
      reviewedBy: '',
      reviewedAt: '',
    },
  };
}

export async function requestRootCauseAnalysis(
  complaint: ComplaintRecord,
  allComplaints: ComplaintRecord[]
): Promise<RootCauseAnalysisRecord> {
  if (!complaint.description || complaint.description.trim().length < 5) {
    throw new Error(
      'Complaint description is empty or insufficient for root cause analysis.'
    );
  }

  const matched = findMatchingHistoricalComplaints(complaint, allComplaints, 16);
  const historicalComplaints = matched.map((m) => ({
    id: m.complaint.id,
    productName: m.complaint.productName,
    productId: m.complaint.productId,
    batchNumber: m.complaint.batchNumber,
    category: m.complaint.category,
    severity: m.complaint.severity,
    processName: m.complaint.processName,
    machineId: m.complaint.machineId,
    processParameters: m.complaint.processParameters,
    testResults: m.complaint.testResults,
    description: m.complaint.description,
    verifiedRootCause:
      m.complaint.rootCauseAnalysis?.manualVerifiedRootCause ||
      m.complaint.rootCauseAnalysis?.hypotheses.find(
        (h) => h.managerStatus === 'Verified'
      )?.title,
    correctiveAction: m.correctiveAction,
    effectivenessStatus: m.effectivenessStatus,
  }));

  return postJson<RootCauseAnalysisRecord>('/api/ai/root-cause', {
    complaint,
    historicalComplaints,
  });
}

export async function requestCapaRecommendations(
  complaint: ComplaintRecord,
  allComplaints: ComplaintRecord[] = [],
  predictiveContext?: {
    productRiskScore?: number;
    productRiskLevel?: string;
    processRiskScore?: number | null;
    processRiskLevel?: string;
    mainRiskFactors?: string[];
  }
): Promise<import('../types/qms').EnhancedGeneratedCAPAResponse> {
  const rootCauseHypotheses =
    complaint.rootCauseAnalysis?.hypotheses.map((h) => ({
      title: h.title,
      description: h.description,
      managerStatus: h.managerStatus,
    })) ?? [];

  const matched =
    allComplaints.length > 0
      ? findMatchingHistoricalComplaints(complaint, allComplaints, 10)
      : [];
  const historicalComplaints = matched.map((m) => ({
    id: m.complaint.id,
    productName: m.complaint.productName,
    productId: m.complaint.productId,
    batchNumber: m.complaint.batchNumber,
    category: m.complaint.category,
    severity: m.complaint.severity,
    processName: m.complaint.processName,
    machineId: m.complaint.machineId,
    processParameters: m.complaint.processParameters,
    testResults: m.complaint.testResults,
    description: m.complaint.description,
    verifiedRootCause:
      m.complaint.rootCauseAnalysis?.manualVerifiedRootCause ||
      m.complaint.rootCauseAnalysis?.hypotheses.find((h) => h.managerStatus === 'Verified')
        ?.title,
    correctiveAction: m.correctiveAction,
    effectivenessStatus: m.effectivenessStatus,
  }));

  const verifiedHyp = complaint.rootCauseAnalysis?.hypotheses.find(
    (h) => h.managerStatus === 'Verified'
  );
  const verifiedRootCause =
    complaint.rootCauseAnalysis?.manualVerifiedRootCause?.trim() || verifiedHyp?.title || '';
  const verifiedEvidence =
    complaint.rootCauseAnalysis?.verifiedEvidence?.trim() ||
    verifiedHyp?.managerNotes?.trim() ||
    verifiedHyp?.supportingEvidence ||
    '';

  return postJson<import('../types/qms').EnhancedGeneratedCAPAResponse>('/api/ai/capa', {
    complaint,
    rootCauseHypotheses,
    historicalComplaints,
    verifiedRootCause,
    verifiedEvidence,
    rootCauseVerified: Boolean(verifiedRootCause),
    predictiveRiskFactors: predictiveContext,
  });
}

export async function requestTrendExplanation(
  trendSummary: Record<string, unknown>
): Promise<AITrendExplanation> {
  return postJson<AITrendExplanation>('/api/ai/explain-trends', { trendSummary });
}

export async function requestPredictiveInsights(
  predictiveSummary: Record<string, unknown>
): Promise<import('../types/qms').AIPredictiveInsight> {
  return postJson<import('../types/qms').AIPredictiveInsight>('/api/ai/explain-predictions', {
    predictiveSummary,
  });
}

export async function requestEffectivenessInsights(
  effectivenessSummary: Record<string, unknown>
): Promise<import('../types/qms').AIEffectivenessInsights> {
  return postJson<import('../types/qms').AIEffectivenessInsights>('/api/ai/effectiveness-insights', {
    effectivenessSummary,
  });
}
