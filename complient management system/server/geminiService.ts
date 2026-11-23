import { GoogleGenAI, Type } from '@google/genai';

const MODEL_NAME = 'gemini-2.5-flash';
const RCA_MODEL_NAME = 'gemini-2.5-flash';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    const err = new Error(
      'GEMINI_API_KEY is not configured on the server. Add your Gemini API key in Settings > Secrets to enable AI analysis.'
    );
    (err as Error & { statusCode?: number }).statusCode = 503;
    throw err;
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function parseJsonResponse<T>(rawText: string | undefined, context: string): T {
  if (!rawText || !rawText.trim()) {
    throw new Error(`Gemini returned an empty response for ${context}.`);
  }
  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error(`Failed to parse structured JSON output from Gemini for ${context}.`);
  }
}

async function withRetry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      const isNonRetryable =
        msg.includes('GEMINI_API_KEY') ||
        msg.includes('API_KEY_INVALID') ||
        msg.includes('PERMISSION_DENIED') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('429') ||
        msg.includes('400') ||
        msg.includes('403');
      if (isNonRetryable || attempt === retries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
  throw lastError;
}

export interface ComplaintInputPayload {
  id: string;
  customerName: string;
  productName: string;
  productId: string;
  batchNumber: string;
  manufacturingDate: string;
  complaintDate: string;
  category: string;
  description: string;
  severity: string;
  processName: string;
  machineId?: string;
  processParameters: string;
  temperature?: string;
  pressure?: string;
  testType?: string;
  expectedValue?: string;
  actualValue?: string;
  testResults: string;
  status: string;
}

export interface HistoricalComplaintSummary {
  id: string;
  productName: string;
  productId?: string;
  batchNumber: string;
  category: string;
  severity: string;
  processName: string;
  machineId?: string;
  processParameters?: string;
  testResults?: string;
  description: string;
  verifiedRootCause?: string;
  correctiveAction?: string;
  effectivenessStatus?: string;
}

// 1. Complaint classification
export async function classifyComplaintWithAI(complaint: ComplaintInputPayload) {
  const ai = getGeminiClient();

  const validCategories = [
    'Product Quality',
    'Dimensional Defects',
    'Material Defects',
    'Performance Issues',
    'Delivery Issues',
    'Packaging Issues',
    'Other',
  ];
  const validSeverities = ['Low', 'Medium', 'High', 'Critical'];

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [
        `Analyze and classify the following manufacturing customer complaint record.`,
        `Complaint ID: ${complaint.id}`,
        `Customer: ${complaint.customerName}`,
        `Product: ${complaint.productName} (${complaint.productId})`,
        `Batch Number: ${complaint.batchNumber}`,
        `Reported Category: ${complaint.category}`,
        `Reported Severity: ${complaint.severity}`,
        `Manufacturing Process: ${complaint.processName}`,
        `Process Parameters: ${complaint.processParameters}`,
        `Inspection / Test Results: ${complaint.testResults}`,
        `Complaint Description: ${complaint.description}`,
      ].join('\n'),
      config: {
        systemInstruction: [
          'You are a Senior Manufacturing Quality Assurance Engineer performing ISO 9001 complaint triage.',
          `Classify predictedCategory strictly as one of: ${validCategories.join(', ')}.`,
          `Classify recommendedSeverity strictly as one of: ${validSeverities.join(', ')}.`,
          'Provide 3-6 concise defectKeywords, 2-4 concrete qualityPatterns observed in the text/test results, a numerical confidenceScore (0-100), and a concise 2-3 sentence technical analysisSummary.',
        ].join(' '),
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            predictedCategory: {
              type: Type.STRING,
              description: 'Best matching complaint category from the allowed list.',
            },
            confidenceScore: {
              type: Type.NUMBER,
              description: 'Confidence score from 0 to 100.',
            },
            defectKeywords: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Technical defect keywords extracted from the complaint.',
            },
            recommendedSeverity: {
              type: Type.STRING,
              description: 'Low, Medium, High, or Critical based on safety, function, and spec deviation.',
            },
            severityJustification: {
              type: Type.STRING,
              description: 'Brief engineering rationale for the recommended severity.',
            },
            qualityPatterns: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Quality or failure patterns implied by the complaint and test data.',
            },
            analysisSummary: {
              type: Type.STRING,
              description: 'Concise technical summary of the complaint.',
            },
          },
          required: [
            'predictedCategory',
            'confidenceScore',
            'defectKeywords',
            'recommendedSeverity',
            'severityJustification',
            'qualityPatterns',
            'analysisSummary',
          ],
        },
      },
    });

    const parsed = parseJsonResponse<{
      predictedCategory: string;
      confidenceScore: number;
      defectKeywords: string[];
      recommendedSeverity: string;
      severityJustification: string;
      qualityPatterns: string[];
      analysisSummary: string;
    }>(response.text, 'complaint classification');

    const predictedCategory = validCategories.includes(parsed.predictedCategory)
      ? parsed.predictedCategory
      : complaint.category;
    const recommendedSeverity = validSeverities.includes(parsed.recommendedSeverity)
      ? parsed.recommendedSeverity
      : complaint.severity;

    return {
      predictedCategory,
      confidenceScore: Math.max(0, Math.min(100, Math.round(Number(parsed.confidenceScore) || 75))),
      defectKeywords: Array.isArray(parsed.defectKeywords) ? parsed.defectKeywords.slice(0, 8) : [],
      recommendedSeverity,
      severityJustification: String(parsed.severityJustification || ''),
      qualityPatterns: Array.isArray(parsed.qualityPatterns) ? parsed.qualityPatterns.slice(0, 6) : [],
      analysisSummary: String(parsed.analysisSummary || ''),
      analyzedAt: new Date().toISOString(),
    };
  });
}

// 2. Root cause analysis (6M Fishbone + Illustrative 5 Whys + Historical Comparison)
export async function analyzeRootCauseWithAI(
  complaint: ComplaintInputPayload,
  historicalComplaints: HistoricalComplaintSummary[]
) {
  const ai = getGeminiClient();

  const relevantHistory = historicalComplaints
    .filter((h) => h.id !== complaint.id)
    .slice(0, 6)
    .map((h) => ({
      id: h.id,
      productName: h.productName,
      batchNumber: h.batchNumber,
      category: h.category,
      severity: h.severity,
      processName: h.processName,
      machineId: h.machineId,
      processParameters: h.processParameters,
      testResults: h.testResults,
      description: h.description,
      verifiedRootCause: h.verifiedRootCause,
      correctiveAction: h.correctiveAction,
      effectivenessStatus: h.effectivenessStatus,
    }));

  const allowed6M = [
    'Machine',
    'Material',
    'Method',
    'Manpower',
    'Measurement',
    'Environment',
  ] as const;
  const allowedLevels = ['Low', 'Medium', 'High'] as const;

  const tStart = Date.now();
  console.log(`[RCA] Calling Gemini (${RCA_MODEL_NAME}) for ${complaint.id} with ${relevantHistory.length} historical matches...`);

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: RCA_MODEL_NAME,
      contents: [
        'TARGET COMPLAINT FOR 6M ROOT CAUSE INVESTIGATION:',
        JSON.stringify(
          {
            id: complaint.id,
            customerName: complaint.customerName,
            productName: complaint.productName,
            productId: complaint.productId,
            batchNumber: complaint.batchNumber,
            category: complaint.category,
            severity: complaint.severity,
            description: complaint.description,
            processName: complaint.processName,
            machineId: complaint.machineId || 'Not specified',
            processParameters: complaint.processParameters || 'Not specified',
            temperature: complaint.temperature || 'Not specified',
            pressure: complaint.pressure || 'Not specified',
            testType: complaint.testType || 'Not specified',
            expectedValue: complaint.expectedValue || 'Not specified',
            actualValue: complaint.actualValue || 'Not specified',
            testResults: complaint.testResults || 'Not specified',
          },
          null,
          2
        ),
        '',
        'RELEVANT HISTORICAL COMPLAINTS (INCLUDING VERIFIED ROOT CAUSES & CAPA EFFECTIVENESS):',
        JSON.stringify(relevantHistory, null, 2),
      ].join('\n'),
      config: {
        systemInstruction: [
          'You are a Principal Manufacturing Quality & Reliability Engineer conducting a structured Root Cause Analysis using 6M Fishbone Analysis (Machine, Material, Method, Manpower, Measurement, Environment) and an illustrative 5 Whys path.',
          'CRITICAL GOVERNANCE RULES:',
          '1. NEVER invent machine measurements, sensor readings, process conditions, or historical evidence that are not present in the JSON input.',
          '2. If machineId, temperature, pressure, expectedValue, actualValue, or testResults say "Not specified" or lack detail, explicitly note "Insufficient evidence in current record" in supportingEvidence and populate missingInformation and insufficientEvidenceNotice.',
          '3. NEVER claim any AI-generated hypothesis is a confirmed or proven root cause. Every candidate must be framed strictly as a suspected hypothesis requiring physical inspection, metrology, or test validation.',
          '4. Generate 4 distinct hypotheses across relevant 6M categories (Machine, Material, Method, Manpower, Measurement, Environment).',
          '5. Set origin strictly to "Historical Pattern" ONLY if a matched record in historicalComplaints explicitly shares a verifiedRootCause or similar failure pattern (and list those IDs in relatedComplaintIds); otherwise set origin to "AI Hypothesis".',
          '6. For each hypothesis include: title, description, category6M (one of the 6M names), origin ("AI Hypothesis" or "Historical Pattern"), likelihood ("Low", "Medium", or "High"), supportingEvidence, evidenceSupported (boolean: true only if actual measurements/test/historical data in the input support it), relatedComplaintIds (only IDs present in historicalComplaints), whySuspected, missingInformation, recommendedVerificationMethod, suggestedCorrectiveAction, confidenceExplanation (qualitative rationale — NO arbitrary numeric probability percentages), affectedProcessOrProduct, and 2 concise investigationSteps.',
          '7. Generate a 5-step illustrative fiveWhys array (levels 1 to 5: question, answer, evidenceNote) exploring a plausible causal chain. Frame each answer cautiously ("Possible...", "May indicate...") as an illustrative path for manager validation, not established fact.',
          '8. Classify overall confidenceLevel strictly as Low, Medium, or High with a transparent confidenceExplanation. Keep EVERY text field crisp and engineering-focused (1 short sentence, max 20 words per field).',
        ].join(' '),
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            hypotheses: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  category6M: { type: Type.STRING },
                  origin: { type: Type.STRING },
                  likelihood: { type: Type.STRING },
                  supportingEvidence: { type: Type.STRING },
                  evidenceSupported: { type: Type.BOOLEAN },
                  relatedComplaintIds: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  whySuspected: { type: Type.STRING },
                  missingInformation: { type: Type.STRING },
                  recommendedVerificationMethod: { type: Type.STRING },
                  suggestedCorrectiveAction: { type: Type.STRING },
                  confidenceExplanation: { type: Type.STRING },
                  affectedProcessOrProduct: { type: Type.STRING },
                  investigationSteps: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: [
                  'title',
                  'description',
                  'category6M',
                  'origin',
                  'likelihood',
                  'supportingEvidence',
                  'evidenceSupported',
                  'relatedComplaintIds',
                  'whySuspected',
                  'missingInformation',
                  'recommendedVerificationMethod',
                  'suggestedCorrectiveAction',
                  'confidenceExplanation',
                  'affectedProcessOrProduct',
                  'investigationSteps',
                ],
              },
            },
            fiveWhys: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  level: { type: Type.INTEGER },
                  question: { type: Type.STRING },
                  answer: { type: Type.STRING },
                  evidenceNote: { type: Type.STRING },
                },
                required: ['level', 'question', 'answer', 'evidenceNote'],
              },
            },
            relatedComplaintIds: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            confidenceLevel: { type: Type.STRING },
            confidenceExplanation: { type: Type.STRING },
            insufficientEvidenceNotice: { type: Type.STRING },
            disclaimer: { type: Type.STRING },
          },
          required: [
            'hypotheses',
            'fiveWhys',
            'relatedComplaintIds',
            'confidenceLevel',
            'confidenceExplanation',
            'insufficientEvidenceNotice',
            'disclaimer',
          ],
        },
      },
    });

    console.log(`[RCA] Gemini completed for ${complaint.id} in ${((Date.now() - tStart) / 1000).toFixed(1)}s`);

    const parsed = parseJsonResponse<{
      hypotheses: Array<{
        title: string;
        description: string;
        category6M: string;
        origin: string;
        likelihood: string;
        supportingEvidence: string;
        evidenceSupported: boolean;
        relatedComplaintIds: string[];
        whySuspected: string;
        missingInformation: string;
        recommendedVerificationMethod: string;
        suggestedCorrectiveAction: string;
        confidenceExplanation: string;
        affectedProcessOrProduct: string;
        investigationSteps: string[];
      }>;
      fiveWhys: Array<{
        level: number;
        question: string;
        answer: string;
        evidenceNote: string;
      }>;
      relatedComplaintIds: string[];
      confidenceLevel: string;
      confidenceExplanation: string;
      insufficientEvidenceNotice: string;
      disclaimer: string;
    }>(response.text, 'root cause analysis');

    if (!Array.isArray(parsed.hypotheses) || parsed.hypotheses.length === 0) {
      throw new Error('Gemini returned no root cause hypotheses for this complaint.');
    }

    const validHistoryIds = new Set(relevantHistory.map((h) => h.id));

    return {
      hypotheses: parsed.hypotheses.map((h, idx) => {
        const category6M = (allowed6M as readonly string[]).includes(h.category6M)
          ? h.category6M
          : 'Method';
        const filteredIds = (Array.isArray(h.relatedComplaintIds) ? h.relatedComplaintIds : []).filter(
          (id) => validHistoryIds.has(id)
        );
        const origin =
          h.origin === 'Historical Pattern' && filteredIds.length > 0
            ? ('Historical Pattern' as const)
            : ('AI Hypothesis' as const);

        return {
          id: `HYP-${complaint.id}-${idx + 1}`,
          title: String(h.title || `Hypothesis ${idx + 1}`),
          description: String(h.description || ''),
          category6M,
          origin,
          likelihood: (allowedLevels as readonly string[]).includes(h.likelihood)
            ? h.likelihood
            : 'Medium',
          supportingEvidence: String(
            h.supportingEvidence || 'Insufficient evidence in current record.'
          ),
          evidenceSupported: Boolean(h.evidenceSupported),
          relatedComplaintIds: filteredIds,
          whySuspected: String(h.whySuspected || ''),
          missingInformation: String(h.missingInformation || ''),
          recommendedVerificationMethod: String(h.recommendedVerificationMethod || ''),
          suggestedCorrectiveAction: String(h.suggestedCorrectiveAction || ''),
          confidenceExplanation: String(h.confidenceExplanation || ''),
          affectedProcessOrProduct: String(
            h.affectedProcessOrProduct || `${complaint.productName} / ${complaint.processName}`
          ),
          investigationSteps: Array.isArray(h.investigationSteps)
            ? h.investigationSteps.map(String)
            : [],
          managerStatus: 'Pending Review' as const,
        };
      }),
      fiveWhys: (Array.isArray(parsed.fiveWhys) ? parsed.fiveWhys : [])
        .slice(0, 5)
        .map((step, idx) => ({
          level: Number(step.level) || idx + 1,
          question: String(step.question || `Why ${idx + 1}?`),
          answer: String(step.answer || ''),
          origin: 'AI Illustrative Path' as const,
          evidenceNote: String(step.evidenceNote || 'Requires physical evidence validation.'),
          validatedByManager: false,
        })),
      relatedComplaintIds: (Array.isArray(parsed.relatedComplaintIds)
        ? parsed.relatedComplaintIds
        : []
      ).filter((id) => validHistoryIds.has(id)),
      confidenceLevel: (allowedLevels as readonly string[]).includes(parsed.confidenceLevel)
        ? parsed.confidenceLevel
        : 'Medium',
      confidenceExplanation: String(parsed.confidenceExplanation || ''),
      insufficientEvidenceNotice: String(parsed.insufficientEvidenceNotice || ''),
      disclaimer:
        String(parsed.disclaimer || '') ||
        'AI-generated 6M hypotheses and 5 Whys paths are investigative leads only and must be physically verified by Quality Management.',
      generatedAt: new Date().toISOString(),
    };
  }, 0);
}

// 3. CAPA recommendation generation (Stage 7: Containment + Corrective + Preventive)
export interface CapaContextInput {
  complaint: ComplaintInputPayload;
  rootCauseHypotheses: Array<{ title: string; description: string; managerStatus?: string }>;
  historicalComplaints?: HistoricalComplaintSummary[];
  verifiedRootCause?: string;
  verifiedEvidence?: string;
  rootCauseVerified?: boolean;
  predictiveRiskFactors?: {
    productRiskScore?: number;
    productRiskLevel?: string;
    processRiskScore?: number | null;
    processRiskLevel?: string;
    mainRiskFactors?: string[];
  };
}

export async function generateCapaWithAI(
  complaintOrContext: ComplaintInputPayload | CapaContextInput,
  legacyHypotheses?: Array<{ title: string; description: string; managerStatus?: string }>
) {
  const ai = getGeminiClient();

  const ctx: CapaContextInput =
    'complaint' in complaintOrContext
      ? complaintOrContext
      : {
          complaint: complaintOrContext,
          rootCauseHypotheses: legacyHypotheses ?? [],
        };

  const isVerified = Boolean(
    ctx.rootCauseVerified ||
      (ctx.verifiedRootCause && ctx.verifiedRootCause.trim().length > 0) ||
      ctx.rootCauseHypotheses.some((h) => h.managerStatus === 'Verified')
  );

  const relevantHistory = (ctx.historicalComplaints ?? [])
    .filter((h) => h.id !== ctx.complaint.id)
    .slice(0, 5);

  const itemSchema = {
    type: Type.OBJECT,
    properties: {
      actionSubtype: { type: Type.STRING },
      title: { type: Type.STRING },
      description: { type: Type.STRING },
      requiredResources: { type: Type.STRING },
      responsibleDepartment: { type: Type.STRING },
      suggestedOwnerRole: { type: Type.STRING },
      suggestedVerificationMethod: { type: Type.STRING },
      expectedImprovement: { type: Type.STRING },
      supportingEvidence: { type: Type.STRING },
      targetDays: { type: Type.INTEGER },
    },
    required: [
      'actionSubtype',
      'title',
      'description',
      'requiredResources',
      'responsibleDepartment',
      'suggestedOwnerRole',
      'suggestedVerificationMethod',
      'expectedImprovement',
      'supportingEvidence',
      'targetDays',
    ],
  };

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: RCA_MODEL_NAME,
      contents: [
        'TARGET COMPLAINT & MACHINE DETAILS:',
        JSON.stringify(ctx.complaint, null, 2),
        '',
        `ROOT CAUSE VERIFICATION STATUS: ${isVerified ? 'VERIFIED' : 'UNVERIFIED / PROVISIONAL'}`,
        ctx.verifiedRootCause ? `VERIFIED ROOT CAUSE: ${ctx.verifiedRootCause}` : '',
        ctx.verifiedEvidence ? `VERIFIED EVIDENCE: ${ctx.verifiedEvidence}` : '',
        '',
        'ROOT CAUSE HYPOTHESES:',
        JSON.stringify(ctx.rootCauseHypotheses, null, 2),
        '',
        'RELEVANT HISTORICAL COMPLAINTS:',
        JSON.stringify(relevantHistory, null, 2),
        '',
        'PREDICTIVE QUALITY RISK CONTEXT:',
        JSON.stringify(ctx.predictiveRiskFactors ?? {}, null, 2),
      ]
        .filter(Boolean)
        .join('\n'),
      config: {
        systemInstruction: [
          'You are a Principal Manufacturing Quality Systems Manager designing an ISO 9001 / IATF 16949 CAPA plan across three sections: containmentActions (2 items), correctiveActions (2-3 items), and preventiveActions (2-3 items).',
          'CRITICAL GOVERNANCE RULES:',
          '1. NEVER invent complaint IDs, batch numbers, machine measurements, or evidence not supplied in the JSON input.',
          '2. If ROOT CAUSE VERIFICATION STATUS is UNVERIFIED / PROVISIONAL, you MUST frame correctiveActions strictly as provisional recommendations contingent on physical root-cause confirmation and never present any AI hypothesis as a confirmed root cause.',
          '3. In supportingEvidence for every action, cite ONLY complaint IDs, test values, parameters, or historical facts explicitly present in the input JSON (or state "Based on reported complaint record; physical confirmation required").',
          '4. Keep every text field concise (1-2 crisp engineering sentences).',
        ].join(' '),
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            containmentActions: { type: Type.ARRAY, items: itemSchema },
            correctiveActions: { type: Type.ARRAY, items: itemSchema },
            preventiveActions: { type: Type.ARRAY, items: itemSchema },
            implementationNotes: { type: Type.STRING },
          },
          required: [
            'containmentActions',
            'correctiveActions',
            'preventiveActions',
            'implementationNotes',
          ],
        },
      },
    });

    interface RawItem {
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

    const parsed = parseJsonResponse<{
      containmentActions: RawItem[];
      correctiveActions: RawItem[];
      preventiveActions: RawItem[];
      implementationNotes: string;
    }>(response.text, 'CAPA recommendation generation');

    const mapItems = (
      arr: RawItem[] | undefined,
      actionType: 'Containment' | 'Corrective' | 'Preventive'
    ) =>
      (Array.isArray(arr) ? arr : []).map((a) => ({
        actionType,
        actionSubtype: String(a.actionSubtype || ''),
        title: String(a.title || ''),
        description: String(a.description || ''),
        requiredResources: String(a.requiredResources || ''),
        responsibleDepartment: String(a.responsibleDepartment || 'Quality Assurance'),
        suggestedOwnerRole: String(a.suggestedOwnerRole || 'Quality Engineer'),
        suggestedVerificationMethod: String(a.suggestedVerificationMethod || ''),
        expectedImprovement: String(a.expectedImprovement || ''),
        supportingEvidence: String(a.supportingEvidence || ''),
        targetDays: Math.max(1, Number(a.targetDays) || (actionType === 'Containment' ? 3 : 14)),
      }));

    return {
      isProvisional: !isVerified,
      provisionalNotice: isVerified
        ? 'Root cause has been physically verified; recommendations still require Quality Manager approval before execution.'
        : 'PROVISIONAL RECOMMENDATIONS: Root cause is not yet verified. Verify root cause physically and approve recommendations before full corrective rollout.',
      containmentActions: mapItems(parsed.containmentActions, 'Containment'),
      correctiveActions: mapItems(parsed.correctiveActions, 'Corrective'),
      preventiveActions: mapItems(parsed.preventiveActions, 'Preventive'),
      implementationNotes: String(parsed.implementationNotes || ''),
      generatedAt: new Date().toISOString(),
    };
  }, 0);
}

// 4. Complaint trend & pattern analytical insights (Module 11)
export async function explainTrendsWithAI(trendSummaryData: Record<string, unknown>) {
  const ai = getGeminiClient();

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: RCA_MODEL_NAME,
      contents: [
        'AGGREGATED MANUFACTURING COMPLAINT ANALYTICS & PATTERN FINDINGS:',
        JSON.stringify(trendSummaryData, null, 2),
      ].join('\n'),
      config: {
        systemInstruction: [
          'You are a Principal Manufacturing Quality Analytics Director briefing Quality Management on historical and live customer complaint patterns.',
          'CRITICAL GOVERNANCE RULES:',
          '1. Explain findings strictly using the supplied JSON data ONLY. NEVER invent complaint counts, percentages, batch numbers, process measurements, or dates not present in the JSON.',
          '2. NEVER claim statistical significance unless sample size (n) and correlation evidence in the JSON explicitly support it. Distinguish process association from verified root-cause causation.',
          '3. Return concise, executive-ready engineering insights (1-2 short sentences per bullet) across: executiveSummary, majorQualityObservations, frequentlyRecurringDefects, mostAffectedProducts, processRelatedPatterns, possibleReasonsForTrends, areasRequiringInvestigation, suggestedPreventiveMeasures, and dataLimitationsNote.',
          '4. Frame all explanations around observed complaint records and verified vs unverified investigation status.',
        ].join(' '),
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            executiveSummary: { type: Type.STRING },
            majorQualityObservations: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            frequentlyRecurringDefects: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            mostAffectedProducts: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            processRelatedPatterns: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            possibleReasonsForTrends: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            areasRequiringInvestigation: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            suggestedPreventiveMeasures: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            dataLimitationsNote: { type: Type.STRING },
          },
          required: [
            'executiveSummary',
            'majorQualityObservations',
            'frequentlyRecurringDefects',
            'mostAffectedProducts',
            'processRelatedPatterns',
            'possibleReasonsForTrends',
            'areasRequiringInvestigation',
            'suggestedPreventiveMeasures',
            'dataLimitationsNote',
          ],
        },
      },
    });

    const parsed = parseJsonResponse<{
      executiveSummary: string;
      majorQualityObservations: string[];
      frequentlyRecurringDefects: string[];
      mostAffectedProducts: string[];
      processRelatedPatterns: string[];
      possibleReasonsForTrends: string[];
      areasRequiringInvestigation: string[];
      suggestedPreventiveMeasures: string[];
      dataLimitationsNote: string;
    }>(response.text, 'complaint trend analytical insights');

    const majorQualityObservations = Array.isArray(parsed.majorQualityObservations)
      ? parsed.majorQualityObservations
      : [];
    const frequentlyRecurringDefects = Array.isArray(parsed.frequentlyRecurringDefects)
      ? parsed.frequentlyRecurringDefects
      : [];
    const mostAffectedProducts = Array.isArray(parsed.mostAffectedProducts)
      ? parsed.mostAffectedProducts
      : [];
    const processRelatedPatterns = Array.isArray(parsed.processRelatedPatterns)
      ? parsed.processRelatedPatterns
      : [];
    const possibleReasonsForTrends = Array.isArray(parsed.possibleReasonsForTrends)
      ? parsed.possibleReasonsForTrends
      : [];
    const areasRequiringInvestigation = Array.isArray(parsed.areasRequiringInvestigation)
      ? parsed.areasRequiringInvestigation
      : [];
    const suggestedPreventiveMeasures = Array.isArray(parsed.suggestedPreventiveMeasures)
      ? parsed.suggestedPreventiveMeasures
      : [];

    return {
      executiveSummary: String(parsed.executiveSummary || ''),
      majorQualityObservations,
      frequentlyRecurringDefects,
      mostAffectedProducts,
      processRelatedPatterns,
      possibleReasonsForTrends,
      areasRequiringInvestigation,
      suggestedPreventiveMeasures,
      dataLimitationsNote: String(
        parsed.dataLimitationsNote ||
          'Insights reflect observed complaint records only; association does not establish root-cause causation without physical verification.'
      ),
      keyDrivers: majorQualityObservations,
      chronicIssueHighlights: frequentlyRecurringDefects,
      emergingRisks: areasRequiringInvestigation,
      recommendedFocusAreas: suggestedPreventiveMeasures,
      generatedAt: new Date().toISOString(),
    };
  }, 0);
}

// 5. Predictive quality intelligence explanation (Module 8)
export async function explainPredictionsWithAI(predictivePayload: Record<string, unknown>) {
  const ai = getGeminiClient();

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: RCA_MODEL_NAME,
      contents: [
        'CALCULATED PREDICTIVE QUALITY METRICS, RISK SCORES & DETERMINISTIC FORECASTS:',
        JSON.stringify(predictivePayload, null, 2),
      ].join('\n'),
      config: {
        systemInstruction: [
          'You are a Principal Manufacturing Quality Intelligence Advisor explaining deterministic predictive risk scores and time-series complaint forecasts to Quality Management.',
          'CRITICAL GOVERNANCE RULES:',
          '1. Explain ONLY the calculated product risk scores, process risk scores, batch risk summaries, historical monthly trends, deterministic forecasts, recurring defect patterns, and verified root causes supplied in the JSON.',
          '2. NEVER invent numerical risk scores, complaint counts, probabilities, batch IDs, or forecast numbers that are not present in the input JSON.',
          '3. NEVER treat risk scores (0-100) as calibrated probabilities of failure, and NEVER claim a manufacturing process proves root-cause causation unless verifiedRootCauses in the JSON explicitly supports it.',
          '4. Keep every item concise, actionable, and technical (1-2 sentences max per item).',
          '5. Clearly communicate in governanceLimitationNote that predictive outputs support management prioritization and do not replace physical inspection, metrology, or engineering verification.',
        ].join(' '),
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            executiveSummary: { type: Type.STRING },
            mainFutureQualityConcerns: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            productsRequiringAttention: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            processesRequiringInvestigation: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            possibleFutureComplaintCategories: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            suggestedPreventiveActions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            managementRecommendations: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            governanceLimitationNote: { type: Type.STRING },
          },
          required: [
            'executiveSummary',
            'mainFutureQualityConcerns',
            'productsRequiringAttention',
            'processesRequiringInvestigation',
            'possibleFutureComplaintCategories',
            'suggestedPreventiveActions',
            'managementRecommendations',
            'governanceLimitationNote',
          ],
        },
      },
    });

    const parsed = parseJsonResponse<{
      executiveSummary: string;
      mainFutureQualityConcerns: string[];
      productsRequiringAttention: string[];
      processesRequiringInvestigation: string[];
      possibleFutureComplaintCategories: string[];
      suggestedPreventiveActions: string[];
      managementRecommendations: string[];
      governanceLimitationNote: string;
    }>(response.text, 'predictive quality insights');

    return {
      executiveSummary: String(parsed.executiveSummary || ''),
      mainFutureQualityConcerns: Array.isArray(parsed.mainFutureQualityConcerns)
        ? parsed.mainFutureQualityConcerns
        : [],
      productsRequiringAttention: Array.isArray(parsed.productsRequiringAttention)
        ? parsed.productsRequiringAttention
        : [],
      processesRequiringInvestigation: Array.isArray(parsed.processesRequiringInvestigation)
        ? parsed.processesRequiringInvestigation
        : [],
      possibleFutureComplaintCategories: Array.isArray(parsed.possibleFutureComplaintCategories)
        ? parsed.possibleFutureComplaintCategories
        : [],
      suggestedPreventiveActions: Array.isArray(parsed.suggestedPreventiveActions)
        ? parsed.suggestedPreventiveActions
        : [],
      managementRecommendations: Array.isArray(parsed.managementRecommendations)
        ? parsed.managementRecommendations
        : [],
      governanceLimitationNote: String(
        parsed.governanceLimitationNote ||
          'Predictive insights explain calculated empirical indicators to support Quality Management decisions and do not replace physical inspection or human engineering verification.'
      ),
      generatedAt: new Date().toISOString(),
    };
  }, 0);
}

// 6. Effectiveness Monitoring & Executive Quality Insights (Stage 8)
export async function generateEffectivenessInsightsWithAI(effectivenessPayload: Record<string, unknown>) {
  const ai = getGeminiClient();

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: RCA_MODEL_NAME,
      contents: [
        'ACTUAL QUALITY EFFECTIVENESS, BEFORE/AFTER, SCORECARD & RECURRING COMPLAINT TELEMETRY:',
        JSON.stringify(effectivenessPayload, null, 2),
      ].join('\n'),
      config: {
        systemInstruction: [
          'You are a Principal Manufacturing Quality Director preparing a grounded Effectiveness Monitoring & Continuous Improvement briefing for Quality Management.',
          'CRITICAL GOVERNANCE RULES:',
          '1. Ground every observation strictly in the JSON payload provided. NEVER invent complaint counts, reduction percentages, production volumes, defect rates, product names, or verification dates.',
          '2. CLEARLY distinguish measured quality outcomes (verified CAPA counts, recorded before/after reductions, verified root causes) from AI-suggested opportunities and recommended next steps.',
          '3. If before-and-after production volumes are missing (provisionalCountsOnly=true) or comparable post-CAPA counts are absent, explicitly state these data gaps in dataSufficiencyNote and NEVER claim normalized defect-rate improvements without denominators.',
          '4. Never assert that two complaints share the same root cause unless verifiedRootCauseMatch is true or both records carry verified root causes.',
          '5. Keep each item crisp, technical, and executive-ready (1-2 sentences max per bullet).',
        ].join(' '),
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            executiveSummary: { type: Type.STRING },
            majorImprovements: { type: Type.ARRAY, items: { type: Type.STRING } },
            areasWithRecurringProblems: { type: Type.ARRAY, items: { type: Type.STRING } },
            productsRequiringAttention: { type: Type.ARRAY, items: { type: Type.STRING } },
            processesWithRepeatedDefects: { type: Type.ARRAY, items: { type: Type.STRING } },
            capaEffectivenessObservations: { type: Type.ARRAY, items: { type: Type.STRING } },
            qualityImprovementOpportunities: { type: Type.ARRAY, items: { type: Type.STRING } },
            recommendedNextSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
            dataSufficiencyNote: { type: Type.STRING },
          },
          required: [
            'executiveSummary',
            'majorImprovements',
            'areasWithRecurringProblems',
            'productsRequiringAttention',
            'processesWithRepeatedDefects',
            'capaEffectivenessObservations',
            'qualityImprovementOpportunities',
            'recommendedNextSteps',
            'dataSufficiencyNote',
          ],
        },
      },
    });

    const parsed = parseJsonResponse<{
      executiveSummary: string;
      majorImprovements: string[];
      areasWithRecurringProblems: string[];
      productsRequiringAttention: string[];
      processesWithRepeatedDefects: string[];
      capaEffectivenessObservations: string[];
      qualityImprovementOpportunities: string[];
      recommendedNextSteps: string[];
      dataSufficiencyNote: string;
    }>(response.text, 'effectiveness quality insights');

    return {
      executiveSummary: String(parsed.executiveSummary || ''),
      majorImprovements: Array.isArray(parsed.majorImprovements) ? parsed.majorImprovements : [],
      areasWithRecurringProblems: Array.isArray(parsed.areasWithRecurringProblems)
        ? parsed.areasWithRecurringProblems
        : [],
      productsRequiringAttention: Array.isArray(parsed.productsRequiringAttention)
        ? parsed.productsRequiringAttention
        : [],
      processesWithRepeatedDefects: Array.isArray(parsed.processesWithRepeatedDefects)
        ? parsed.processesWithRepeatedDefects
        : [],
      capaEffectivenessObservations: Array.isArray(parsed.capaEffectivenessObservations)
        ? parsed.capaEffectivenessObservations
        : [],
      qualityImprovementOpportunities: Array.isArray(parsed.qualityImprovementOpportunities)
        ? parsed.qualityImprovementOpportunities
        : [],
      recommendedNextSteps: Array.isArray(parsed.recommendedNextSteps)
        ? parsed.recommendedNextSteps
        : [],
      dataSufficiencyNote: String(
        parsed.dataSufficiencyNote ||
          'Insights summarize observed QMS records only. AI recommendations require Quality Manager review and physical verification.'
      ),
      generatedAt: new Date().toISOString(),
    };
  }, 0);
}
