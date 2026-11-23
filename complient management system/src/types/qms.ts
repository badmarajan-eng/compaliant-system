export type ComplaintCategory =
  | 'Product Quality'
  | 'Dimensional Defects'
  | 'Material Defects'
  | 'Performance Issues'
  | 'Delivery Issues'
  | 'Packaging Issues'
  | 'Other';

export type SeverityLevel = 'Low' | 'Medium' | 'High' | 'Critical';

export type PriorityLevel = 'Low' | 'Normal' | 'High' | 'Urgent';

export type ComplaintStatus =
  | 'New'
  | 'Under Investigation'
  | 'Root Cause Identified'
  | 'Corrective Action In Progress'
  | 'Verification Pending'
  | 'Closed';

export type VerificationStatus = 'Pending Review' | 'Verified' | 'Rejected';

export type CAPAKind = 'Corrective' | 'Preventive';

export type CAPAApprovalStatus = 'Pending' | 'Accepted' | 'Rejected';

export type CAPACompletionStatus =
  | 'Not Started'
  | 'In Progress'
  | 'Completed'
  | 'Overdue';

export type EffectivenessStatus =
  | 'Pending Verification Data'
  | 'Verified Effective'
  | 'Partially Effective'
  | 'Ineffective';

export interface ComplaintHistoryEntry {
  id: string;
  timestamp: string;
  action: string;
  fromStatus?: string;
  toStatus?: string;
  actor: string;
  notes?: string;
}

export interface PossibleCauseHypothesis {
  id: string;
  cause: string;
  reason: string;
  evidenceAvailable: string;
  additionalVerificationRequired: string;
}

export interface ManagerCauseDecision {
  causeId: string;
  status: VerificationStatus;
  notes?: string;
}

export interface ManagerVerificationRecord {
  decision: 'Pending' | 'Accepted' | 'Rejected';
  confirmedCategory: ComplaintCategory;
  confirmedSeverity: SeverityLevel;
  causeDecisions: ManagerCauseDecision[];
  investigationNotes: string;
  reviewedBy: string;
  reviewedAt: string;
}

export interface AIClassificationResult {
  analysisId: string;
  complaintId: string;
  predictedCategory: ComplaintCategory;
  suggestedSeverity: SeverityLevel;
  defectKeywords: string[];
  mainQualityIssue: string;
  analysisSummary: string;
  possibleCauses: PossibleCauseHypothesis[];
  historicalPattern: string;
  recommendedInvestigationSteps: string[];
  confidence: {
    score: number;
    explanation: string;
  };
  analyzedAt: string;
  modelName?: string;
  sourceFingerprint: string;
  managerVerification?: ManagerVerificationRecord;
}

export type SixMCategory =
  | 'Machine'
  | 'Material'
  | 'Method'
  | 'Manpower'
  | 'Measurement'
  | 'Environment';

export type RcaHypothesisStatus =
  | 'Pending Review'
  | 'Verified'
  | 'Rejected'
  | 'Further Investigation';

export interface FiveWhysStep {
  level: number;
  question: string;
  answer: string;
  origin: 'AI Illustrative Path' | 'Manager Edited';
  evidenceNote: string;
  validatedByManager: boolean;
  validatedAt?: string;
}

export interface RootCauseHypothesis {
  id: string;
  title: string;
  description: string;
  category6M?: SixMCategory;
  origin?: 'AI Hypothesis' | 'Historical Pattern' | 'Manager Added';
  likelihood: 'Low' | 'Medium' | 'High';
  supportingEvidence: string;
  evidenceSupported?: boolean;
  relatedComplaintIds?: string[];
  whySuspected?: string;
  missingInformation?: string;
  recommendedVerificationMethod?: string;
  suggestedCorrectiveAction?: string;
  confidenceExplanation?: string;
  affectedProcessOrProduct: string;
  investigationSteps: string[];
  managerStatus: RcaHypothesisStatus;
  managerNotes?: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface RootCauseAnalysisRecord {
  hypotheses: RootCauseHypothesis[];
  relatedComplaintIds: string[];
  confidenceLevel: 'Low' | 'Medium' | 'High';
  confidenceExplanation: string;
  disclaimer: string;
  insufficientEvidenceNotice?: string;
  fiveWhys?: FiveWhysStep[];
  manualVerifiedRootCause?: string;
  verifiedCategory6M?: SixMCategory;
  verifiedEvidence?: string;
  verifiedBy?: string;
  verifiedDate?: string;
  managerInvestigationNotes?: string;
  generatedAt: string;
}

export interface CAPAEffectivenessTracking {
  complaintsBefore: number;
  complaintsAfter: number | null;
  monitoringWindowDays: number;
  verifiedEffective: boolean | null;
  evaluationNotes: string;
  evaluatedAt?: string;
  evaluatedBy?: string;
}

export interface CAPAActionItem {
  id: string;
  kind: CAPAKind;
  actionSubtype: string;
  title: string;
  description: string;
  origin: 'AI Recommended' | 'Manager Added';
  approvalStatus: CAPAApprovalStatus;
  responsiblePerson: string;
  targetDate: string;
  completionStatus: CAPACompletionStatus;
  verificationResult: string;
  verifiedDate?: string;
  effectivenessTracking: CAPAEffectivenessTracking;
}

export interface ComplaintRecord {
  id: string;
  customerName: string;
  customerId?: string;
  contactEmail?: string;
  productName: string;
  productId: string;
  batchNumber: string;
  manufacturingDate: string;
  complaintDate: string;
  category: ComplaintCategory;
  description: string;
  severity: SeverityLevel;
  processName: string;
  machineId?: string;
  processParameters: string;
  temperature?: string;
  pressure?: string;
  productionShift?: string;
  operatorId?: string;
  testType?: string;
  expectedValue?: string;
  actualValue?: string;
  testResults: string;
  inspectionNotes?: string;
  assignedManager?: string;
  priority?: PriorityLevel;
  status: ComplaintStatus;
  resolutionDate?: string;
  isDemoData: boolean;
  history?: ComplaintHistoryEntry[];
  aiClassification?: AIClassificationResult;
  aiAnalysisHistory?: AIClassificationResult[];
  rootCauseAnalysis?: RootCauseAnalysisRecord;
  capaActions: CAPAActionItem[];
}

export interface AITrendExplanation {
  executiveSummary: string;
  majorQualityObservations?: string[];
  frequentlyRecurringDefects?: string[];
  mostAffectedProducts?: string[];
  processRelatedPatterns?: string[];
  possibleReasonsForTrends?: string[];
  areasRequiringInvestigation?: string[];
  suggestedPreventiveMeasures?: string[];
  dataLimitationsNote?: string;
  keyDrivers: string[];
  chronicIssueHighlights: string[];
  emergingRisks: string[];
  recommendedFocusAreas: string[];
  generatedAt: string;
}

export type RiskTier = 'LOW' | 'MEDIUM' | 'HIGH';

export interface RiskFactorContribution {
  factor: string;
  weightPercent: number;
  rawValue: string;
  contributionScore: number;
}

export interface EntityRiskPrediction {
  entityName: string;
  entityCode?: string;
  entityType: 'Product' | 'Process';
  riskScore: number;
  riskTier: RiskTier;
  totalComplaints: number;
  openComplaints: number;
  criticalCount: number;
  criticalOrHighCount: number;
  recent90DayCount: number;
  recurrenceRatePercent: number;
  possibleFutureCategories: ComplaintCategory[];
  riskFactors: RiskFactorContribution[];
  recommendedPreventiveActions: string[];
}

export type ModuleId =
  | 'dashboard'
  | 'complaints'
  | 'classification'
  | 'root-cause'
  | 'analytics'
  | 'risk-prediction'
  | 'capa'
  | 'effectiveness'
  | 'reports'
  | 'alerts';

// ---------- PREDICTIVE QUALITY INTELLIGENCE ENGINE ----------

export interface RiskScoringWeights {
  historicalFrequency: number; // default 25
  complaintSeverity: number; // default 20
  recentTrend: number; // default 20
  recurrenceRate: number; // default 15
  unresolvedCritical: number; // default 10
  capaEffectiveness: number; // default 10
}

export interface PredictiveFactorDetail {
  key: keyof RiskScoringWeights;
  label: string;
  weightPercent: number;
  normalizedScore: number; // 0 to 1
  contributionPoints: number;
  rawSummary: string;
  dataStatus: 'Measured' | 'Partial Data' | 'Data Missing (Neutral Baseline)';
}

export interface ProductRiskAssessment {
  productId: string;
  productName: string;
  totalComplaints: number;
  recent90DayComplaints: number;
  prior90DayComplaints: number;
  criticalComplaints: number;
  unresolvedCriticalComplaints: number;
  openComplaints: number;
  affectedBatchesCount: number;
  affectedBatches: string[];
  recurringDefectsCount: number;
  verifiedRootCauses: string[];
  aiHypothesesCount: number;
  trendDirection: 'Increasing' | 'Stable' | 'Decreasing' | 'Single Period';
  capaEffectivenessSummary: string;
  riskScore: number;
  riskLevel: RiskTier;
  dataCompletenessPercent: number;
  missingDataNotes: string[];
  factorBreakdown: PredictiveFactorDetail[];
  mainRiskFactors: string[];
  possibleFutureCategories: ComplaintCategory[];
  recommendedPreventiveAction: string;
  recommendedPreventiveActions: string[];
  complaints: ComplaintRecord[];
}

export interface ProcessRiskAssessment {
  processName: string;
  observedShopProcesses: string[];
  complaintCount: number;
  criticalComplaints: number;
  openComplaints: number;
  unresolvedCriticalComplaints: number;
  recurringDefectsCount: number;
  verifiedRootCauses: string[];
  aiHypothesesCount: number;
  associatedDefectModes: string[];
  trendDirection: 'Increasing' | 'Stable' | 'Decreasing' | 'Insufficient Data';
  riskScore: number | null;
  riskLevel: RiskTier | 'INSUFFICIENT DATA';
  dataCompletenessPercent: number;
  missingDataNotes: string[];
  factorBreakdown: PredictiveFactorDetail[];
  mainRiskFactors: string[];
  suggestedPreventiveMeasures: string[];
  complaints: ComplaintRecord[];
}

export type BatchAssessmentStatus =
  | 'Confirmed Defect History'
  | 'Estimated Elevated Risk'
  | 'Monitored Baseline'
  | 'Insufficient Batch Information';

export interface BatchRiskAssessment {
  batchNumber: string;
  productId: string;
  productName: string;
  manufacturingDate: string;
  processName: string;
  machineIds: string[];
  assessmentStatus: BatchAssessmentStatus;
  riskScore: number | null;
  riskLevel: RiskTier | 'INSUFFICIENT DATA';
  telemetryAvailable: string[];
  missingFields: string[];
  riskFactors: string[];
  verifiedRootCauses: string[];
  recommendedInspection: string;
  complaints: ComplaintRecord[];
}

export type ForecastMethodId = 'moving_average' | 'exponential_smoothing' | 'linear_trend';

export interface ForecastTimelinePoint {
  month: string; // YYYY-MM
  label: string;
  actualCount: number | null;
  predictedCount: number | null;
  lowerBound: number | null;
  upperBound: number | null;
  isForecast: boolean;
}

export interface ForecastHorizonSummary {
  horizonLabel: 'Next Month' | 'Next 3 Months' | 'Next 6 Months';
  monthsAhead: number;
  predictedTotal: number;
  monthlyAverage: number;
  lowerBoundTotal: number;
  upperBoundTotal: number;
}

export interface TimeSeriesForecastResult {
  sufficientData: boolean;
  insufficientReason?: string;
  methodUsed: ForecastMethodId;
  methodLabel: string;
  historicalMonthsCount: number;
  observedStartMonth: string;
  observedEndMonth: string;
  trendDirection: 'Increasing' | 'Stable' | 'Decreasing' | 'Insufficient Data';
  trendSlopePerMonth: number;
  backtestMetrics: {
    evaluatedMonths: number;
    mae: number | null;
    rmse: number | null;
    note: string;
  };
  horizons: ForecastHorizonSummary[];
  timeline: ForecastTimelinePoint[];
}

export type PredictiveAlertType =
  | 'High-Risk Product'
  | 'Increasing Process Trend'
  | 'Multi-Batch Defect Cluster'
  | 'Recurring Defect Pattern'
  | 'Unresolved Critical Complaint'
  | 'Ineffective CAPA'
  | 'Overdue Critical CAPA'
  | 'Post-CAPA Recurrence'
  | 'Verification Period Completed';

export type PredictiveAlertStatus =
  | 'New'
  | 'Acknowledged'
  | 'Under Investigation'
  | 'Resolved';

export interface PredictiveAlert {
  id: string;
  conditionKey: string;
  alertType: PredictiveAlertType;
  targetEntity: string;
  targetKind: 'Product' | 'Process' | 'Batch' | 'CAPA';
  riskLevel: RiskTier;
  reason: string;
  detectionDate: string;
  recommendedAction: string;
  status: PredictiveAlertStatus;
  assignedTo: string;
  investigationNotes: string;
  updatedAt: string;
}

export type PreventivePlanStatus =
  | 'Recommended'
  | 'Accepted'
  | 'In Progress'
  | 'Implemented'
  | 'Verified Effective'
  | 'Rejected';

export interface PreventiveActionPlan {
  id: string;
  planKey: string;
  targetEntity: string;
  targetKind: 'Product' | 'Process';
  riskLevel: RiskTier;
  actionCategory: string;
  title: string;
  rationale: string;
  status: PreventivePlanStatus;
  responsiblePerson: string;
  targetDate: string;
  verificationResults: string;
  updatedAt: string;
}

export type PredictionEvaluationStatus =
  | 'Pending Elapsed Data'
  | 'Accurate (Within +/-20%)'
  | 'Under-Predicted'
  | 'Over-Predicted';

export interface PredictionHistoryEntry {
  id: string;
  predictionDate: string;
  targetEntity: string;
  entityKind: 'Product' | 'Process' | 'Plant Overall';
  riskScore: number;
  riskLevel: RiskTier;
  forecastPeriod: string; // e.g., "2026-10" or "2026-12"
  predictedComplaintCount: number | null;
  actualComplaintCount: number | null;
  evaluationStatus: PredictionEvaluationStatus;
  methodNote: string;
}

export interface AIPredictiveInsight {
  executiveSummary: string;
  mainFutureQualityConcerns: string[];
  productsRequiringAttention: string[];
  processesRequiringInvestigation: string[];
  possibleFutureComplaintCategories: string[];
  suggestedPreventiveActions: string[];
  managementRecommendations: string[];
  governanceLimitationNote: string;
  generatedAt: string;
}

// ---------- STAGE 7: FULL CAPA MANAGEMENT MODULE ----------

export type CAPAWorkflowStatus =
  | 'New'
  | 'Assigned'
  | 'In Progress'
  | 'Pending Verification'
  | 'Effective'
  | 'Ineffective'
  | 'Closed'
  | 'Overdue';

export type CAPAActionSectionType = 'Containment' | 'Corrective' | 'Preventive';

export type CAPARootCauseStatus =
  | 'Verified'
  | 'Unverified Hypothesis'
  | 'Pending Investigation';

export type CAPAEffectivenessDecision =
  | 'Pending'
  | 'Effective'
  | 'Ineffective'
  | 'Inconclusive';

export interface CAPAPlanTask {
  id: string;
  actionType: CAPAActionSectionType;
  actionSubtype: string;
  title: string;
  description: string;
  origin: 'AI Recommended' | 'Manager Added';
  approvalStatus: CAPAApprovalStatus;
  isProvisional?: boolean;
  responsiblePerson: string;
  responsibleDepartment: string;
  startDate: string;
  targetDate: string;
  completionDate?: string;
  progressPercent: number;
  status: CAPACompletionStatus;
  managerApprovedCompletion?: boolean;
  requiredResources?: string;
  suggestedVerificationMethod?: string;
  expectedImprovement?: string;
  supportingEvidence?: string;
  implementationEvidence: string;
  managerComments: string;
}

export interface CAPAStatusHistoryEntry {
  id: string;
  timestamp: string;
  action: string;
  fromStatus?: string;
  toStatus?: string;
  actor: string;
  notes?: string;
}

export interface CAPAEvidenceAttachment {
  id: string;
  fileName: string;
  fileType: string;
  fileSizeKb: number;
  uploadedAt: string;
  notes: string;
}

export interface CAPAEffectivenessVerification {
  baselinePeriod: string;
  postPeriod: string;
  observationSampleSizeOk: boolean;
  complaintsBefore: number;
  complaintsAfter: number | null;
  productionVolumeBefore: number | null;
  productionVolumeAfter: number | null;
  defectRateBefore: number | null;
  defectRateAfter: number | null;
  repeatDefectOccurred: boolean | null;
  verificationMethod: string;
  verificationEvidence: string;
  decision: CAPAEffectivenessDecision;
  isProvisionalComparison: boolean;
  insufficientDataNotice?: string;
  verifiedDate?: string;
  reviewer?: string;
  comments: string;
}

export interface CAPARecord {
  id: string;
  complaintId: string;
  customerName: string;
  productId: string;
  productName: string;
  batchNumber: string;
  defectCategory: ComplaintCategory;
  manufacturingProcess: string;
  machineId: string;
  rootCause: string;
  rootCauseVerificationStatus: CAPARootCauseStatus;
  evidence: string;
  priority: PriorityLevel;
  owner: string;
  responsibleDepartment: string;
  createdDate: string;
  startDate: string;
  targetCompletionDate: string;
  actualCompletionDate?: string;
  status: CAPAWorkflowStatus;
  progressPercent: number;
  description: string;
  containmentActions: CAPAPlanTask[];
  correctiveActions: CAPAPlanTask[];
  preventiveActions: CAPAPlanTask[];
  attachments: CAPAEvidenceAttachment[];
  comments: string;
  managerCompletionApproved: boolean;
  history: CAPAStatusHistoryEntry[];
  effectiveness: CAPAEffectivenessVerification;
  isDemoData: boolean;
}

export interface EnhancedAICapaRecommendationItem {
  actionType: CAPAActionSectionType;
  actionSubtype: string;
  title: string;
  description: string;
  requiredResources: string;
  responsibleDepartment: string;
  suggestedOwnerRole: string;
  suggestedVerificationMethod: string;
  expectedImprovement: string;
  supportingEvidence: string;
  targetDays: number;
}

export interface EnhancedGeneratedCAPAResponse {
  isProvisional: boolean;
  provisionalNotice: string;
  containmentActions: EnhancedAICapaRecommendationItem[];
  correctiveActions: EnhancedAICapaRecommendationItem[];
  preventiveActions: EnhancedAICapaRecommendationItem[];
  implementationNotes: string;
  generatedAt: string;
}

// ---------- STAGE 8: EFFECTIVENESS MONITORING & FINAL REPORTING ----------

export type RecurrenceClassification =
  | 'Confirmed Recurrence'
  | 'Possible Recurrence'
  | 'New Unrelated Complaint';

export interface RecurringPostCapaMatch {
  id: string;
  complaintId: string;
  complaintDate: string;
  productName: string;
  processName: string;
  machineId: string;
  batchNumber: string;
  category: ComplaintCategory;
  severity: SeverityLevel;
  description: string;
  relatedCapaId: string;
  relatedCapaStatus: CAPAWorkflowStatus;
  relatedCapaDecision: CAPAEffectivenessDecision;
  capaReferenceDate: string;
  classification: RecurrenceClassification;
  matchDimensions: string[];
  descriptionSimilarityPercent: number;
  verifiedRootCauseMatch: boolean;
  explanation: string;
}

export interface BeforeAfterAnalysisSummary {
  scopeLabel: string;
  evaluatedCapasCount: number;
  complaintsBefore: number;
  complaintsAfter: number | null;
  defectsBefore: number;
  defectsAfter: number | null;
  productionVolumeBefore: number | null;
  productionVolumeAfter: number | null;
  defectRateBefore: number | null;
  defectRateAfter: number | null;
  reductionPercent: number | null;
  reductionDisplay: string;
  hasComparableBaseline: boolean;
  provisionalCountsOnly: boolean;
  processPerformanceSummary: string;
  notes: string;
}

export interface QualityScorecardIndicator {
  id: string;
  label: string;
  currentValue: string;
  previousValue: string;
  deltaText: string;
  trendDirection: 'Improved' | 'Deteriorated' | 'Unchanged' | 'Insufficient Data';
  explanation: string;
  dataAvailability: 'Complete' | 'Partial' | 'Insufficient Data';
}

export interface AIEffectivenessInsights {
  executiveSummary: string;
  majorImprovements: string[];
  areasWithRecurringProblems: string[];
  productsRequiringAttention: string[];
  processesWithRepeatedDefects: string[];
  capaEffectivenessObservations: string[];
  qualityImprovementOpportunities: string[];
  recommendedNextSteps: string[];
  dataSufficiencyNote: string;
  generatedAt: string;
}
