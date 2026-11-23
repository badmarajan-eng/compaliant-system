import { GoogleGenAI, Type } from '@google/genai';

const MODEL_NAME = 'gemini-2.5-flash';

export const ALLOWED_CATEGORIES = [
  'Product Quality',
  'Dimensional Defects',
  'Material Defects',
  'Performance Issues',
  'Delivery Issues',
  'Packaging Issues',
  'Other',
] as const;

export const ALLOWED_SEVERITIES = ['Low', 'Medium', 'High', 'Critical'] as const;

export interface FullComplaintAnalysisInput {
  id: string;
  customerName: string;
  productName: string;
  productId: string;
  batchNumber: string;
  manufacturingDate?: string;
  complaintDate?: string;
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
  status?: string;
}

export interface HistoricalComplaintReference {
  id: string;
  productName: string;
  productId?: string;
  batchNumber: string;
  category: string;
  severity: string;
  processName: string;
  complaintDate?: string;
  description: string;
  testResults?: string;
  verifiedRootCause?: string;
}

export interface GeminiPossibleCause {
  cause: string;
  reason: string;
  evidenceAvailable: string;
  additionalVerificationRequired: string;
}

export interface GeminiComplaintClassificationOutput {
  complaintId: string;
  predictedCategory: (typeof ALLOWED_CATEGORIES)[number];
  suggestedSeverity: (typeof ALLOWED_SEVERITIES)[number];
  defectKeywords: string[];
  mainQualityIssue: string;
  analysisSummary: string;
  possibleCauses: GeminiPossibleCause[];
  historicalPattern: string;
  recommendedInvestigationSteps: string[];
  confidence: {
    score: number;
    explanation: string;
  };
}

export class ComplaintAnalysisServiceError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 500, code = 'ANALYSIS_ERROR') {
    super(message);
    this.name = 'ComplaintAnalysisServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new ComplaintAnalysisServiceError(
      'GEMINI_API_KEY is missing or unconfigured on the server. Configure GEMINI_API_KEY in Settings > Secrets before running AI complaint analysis.',
      503,
      'MISSING_API_KEY'
    );
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

function validateComplaintInput(complaint: FullComplaintAnalysisInput | undefined): asserts complaint is FullComplaintAnalysisInput {
  if (!complaint || typeof complaint !== 'object') {
    throw new ComplaintAnalysisServiceError(
      'Complaint payload is missing. Select a valid complaint record before analyzing.',
      400,
      'MISSING_COMPLAINT_INFO'
    );
  }
  const missingFields: string[] = [];
  if (!complaint.id || !String(complaint.id).trim()) missingFields.push('Complaint ID');
  if (!complaint.productName || !String(complaint.productName).trim()) missingFields.push('Product Name');
  if (!complaint.customerName || !String(complaint.customerName).trim()) missingFields.push('Customer Name');
  if (!complaint.batchNumber || !String(complaint.batchNumber).trim()) missingFields.push('Batch Number');
  if (!complaint.processName || !String(complaint.processName).trim()) missingFields.push('Manufacturing Process');

  if (!complaint.description || String(complaint.description).trim().length < 5) {
    throw new ComplaintAnalysisServiceError(
      'Complaint description is empty or too short. Provide a clear defect description before running AI analysis.',
      400,
      'EMPTY_DESCRIPTION'
    );
  }

  if (missingFields.length > 0) {
    throw new ComplaintAnalysisServiceError(
      `Missing required complaint information for analysis: ${missingFields.join(', ')}.`,
      400,
      'MISSING_COMPLAINT_INFO'
    );
  }
}

function mapGeminiApiError(error: unknown): ComplaintAnalysisServiceError {
  if (error instanceof ComplaintAnalysisServiceError) return error;

  const rawMsg = error instanceof Error ? error.message : String(error);
  const status = (error as { status?: number; statusCode?: number })?.status ??
    (error as { status?: number; statusCode?: number })?.statusCode;

  if (
    status === 429 ||
    /RESOURCE_EXHAUSTED|quota|rate limit|429/i.test(rawMsg)
  ) {
    return new ComplaintAnalysisServiceError(
      'Gemini API quota exceeded or rate limit reached. Wait a moment or review your quota/billing in Google AI Studio, then click Retry.',
      429,
      'QUOTA_EXCEEDED'
    );
  }

  if (
    status === 401 ||
    status === 403 ||
    /API_KEY_INVALID|PERMISSION_DENIED|403/i.test(rawMsg)
  ) {
    if (/free tier is not available|set up billing|billing/i.test(rawMsg)) {
      return new ComplaintAnalysisServiceError(
        'Gemini API access requires billing. Enable billing for this Google Cloud project in Google AI Studio, then retry.',
        403,
        'BILLING_REQUIRED'
      );
    }
    return new ComplaintAnalysisServiceError(
      'Gemini API key was rejected (invalid or lacks permission). Check GEMINI_API_KEY in Settings > Secrets.',
      403,
      'INVALID_API_KEY'
    );
  }

  if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|ECONNREFUSED|fetch failed|network/i.test(rawMsg)) {
    return new ComplaintAnalysisServiceError(
      'Network error while connecting to Gemini API. Check server internet connectivity and click Retry.',
      502,
      'NETWORK_ERROR'
    );
  }

  if (status === 404 || /NOT_FOUND/i.test(rawMsg)) {
    return new ComplaintAnalysisServiceError(
      `Requested Gemini model (${MODEL_NAME}) was not found or is unavailable for this API key.`,
      502,
      'MODEL_NOT_FOUND'
    );
  }

  return new ComplaintAnalysisServiceError(
    `Gemini AI request failed: ${rawMsg}`,
    502,
    'UPSTREAM_GEMINI_ERROR'
  );
}

function parseAndValidateGeminiResponse(
  rawText: string | undefined,
  expectedComplaintId: string
): GeminiComplaintClassificationOutput {
  if (!rawText || !rawText.trim()) {
    throw new ComplaintAnalysisServiceError(
      'Gemini returned an empty response. Please retry the analysis.',
      502,
      'INVALID_GEMINI_RESPONSE'
    );
  }

  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new ComplaintAnalysisServiceError(
      'Gemini returned malformed JSON that could not be parsed. Please retry.',
      502,
      'INVALID_GEMINI_RESPONSE'
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ComplaintAnalysisServiceError(
      'Gemini response did not match the expected JSON object structure.',
      502,
      'INVALID_GEMINI_RESPONSE'
    );
  }

  const obj = parsed as Record<string, unknown>;

  if (
    typeof obj.predictedCategory !== 'string' ||
    !(ALLOWED_CATEGORIES as readonly string[]).includes(obj.predictedCategory)
  ) {
    throw new ComplaintAnalysisServiceError(
      `Gemini returned an invalid predictedCategory ("${String(obj.predictedCategory)}").`,
      502,
      'INVALID_GEMINI_RESPONSE'
    );
  }

  if (
    typeof obj.suggestedSeverity !== 'string' ||
    !(ALLOWED_SEVERITIES as readonly string[]).includes(obj.suggestedSeverity)
  ) {
    throw new ComplaintAnalysisServiceError(
      `Gemini returned an invalid suggestedSeverity ("${String(obj.suggestedSeverity)}").`,
      502,
      'INVALID_GEMINI_RESPONSE'
    );
  }

  if (
    !Array.isArray(obj.defectKeywords) ||
    obj.defectKeywords.length === 0 ||
    obj.defectKeywords.some((k) => typeof k !== 'string' || !k.trim())
  ) {
    throw new ComplaintAnalysisServiceError(
      'Gemini response is missing valid defectKeywords.',
      502,
      'INVALID_GEMINI_RESPONSE'
    );
  }

  if (typeof obj.mainQualityIssue !== 'string' || !obj.mainQualityIssue.trim()) {
    throw new ComplaintAnalysisServiceError(
      'Gemini response is missing mainQualityIssue.',
      502,
      'INVALID_GEMINI_RESPONSE'
    );
  }

  if (typeof obj.analysisSummary !== 'string' || !obj.analysisSummary.trim()) {
    throw new ComplaintAnalysisServiceError(
      'Gemini response is missing analysisSummary.',
      502,
      'INVALID_GEMINI_RESPONSE'
    );
  }

  if (!Array.isArray(obj.possibleCauses) || obj.possibleCauses.length === 0) {
    throw new ComplaintAnalysisServiceError(
      'Gemini response is missing possibleCauses hypotheses.',
      502,
      'INVALID_GEMINI_RESPONSE'
    );
  }

  const validatedCauses: GeminiPossibleCause[] = obj.possibleCauses.map((item, idx) => {
    if (!item || typeof item !== 'object') {
      throw new ComplaintAnalysisServiceError(
        `Gemini possibleCauses[${idx}] is not a valid object.`,
        502,
        'INVALID_GEMINI_RESPONSE'
      );
    }
    const c = item as Record<string, unknown>;
    if (
      typeof c.cause !== 'string' ||
      !c.cause.trim() ||
      typeof c.reason !== 'string' ||
      !c.reason.trim() ||
      typeof c.evidenceAvailable !== 'string' ||
      !c.evidenceAvailable.trim() ||
      typeof c.additionalVerificationRequired !== 'string' ||
      !c.additionalVerificationRequired.trim()
    ) {
      throw new ComplaintAnalysisServiceError(
        `Gemini possibleCauses[${idx}] is missing required cause/reason/evidenceAvailable/additionalVerificationRequired fields.`,
        502,
        'INVALID_GEMINI_RESPONSE'
      );
    }
    return {
      cause: c.cause.trim(),
      reason: c.reason.trim(),
      evidenceAvailable: c.evidenceAvailable.trim(),
      additionalVerificationRequired: c.additionalVerificationRequired.trim(),
    };
  });

  if (typeof obj.historicalPattern !== 'string' || !obj.historicalPattern.trim()) {
    throw new ComplaintAnalysisServiceError(
      'Gemini response is missing historicalPattern.',
      502,
      'INVALID_GEMINI_RESPONSE'
    );
  }

  if (
    !Array.isArray(obj.recommendedInvestigationSteps) ||
    obj.recommendedInvestigationSteps.length === 0 ||
    obj.recommendedInvestigationSteps.some((s) => typeof s !== 'string' || !s.trim())
  ) {
    throw new ComplaintAnalysisServiceError(
      'Gemini response is missing valid recommendedInvestigationSteps.',
      502,
      'INVALID_GEMINI_RESPONSE'
    );
  }

  if (!obj.confidence || typeof obj.confidence !== 'object') {
    throw new ComplaintAnalysisServiceError(
      'Gemini response is missing confidence object.',
      502,
      'INVALID_GEMINI_RESPONSE'
    );
  }

  const conf = obj.confidence as Record<string, unknown>;
  const numericScore = Number(conf.score);
  if (
    !Number.isFinite(numericScore) ||
    numericScore < 0 ||
    numericScore > 100 ||
    typeof conf.explanation !== 'string' ||
    !conf.explanation.trim()
  ) {
    throw new ComplaintAnalysisServiceError(
      'Gemini response has invalid confidence score (must be 0-100) or missing confidence explanation.',
      502,
      'INVALID_GEMINI_RESPONSE'
    );
  }

  return {
    complaintId:
      typeof obj.complaintId === 'string' && obj.complaintId.trim()
        ? obj.complaintId.trim()
        : expectedComplaintId,
    predictedCategory: obj.predictedCategory as GeminiComplaintClassificationOutput['predictedCategory'],
    suggestedSeverity: obj.suggestedSeverity as GeminiComplaintClassificationOutput['suggestedSeverity'],
    defectKeywords: (obj.defectKeywords as string[]).map((k) => k.trim()).slice(0, 10),
    mainQualityIssue: obj.mainQualityIssue.trim(),
    analysisSummary: obj.analysisSummary.trim(),
    possibleCauses: validatedCauses,
    historicalPattern: obj.historicalPattern.trim(),
    recommendedInvestigationSteps: (obj.recommendedInvestigationSteps as string[])
      .map((s) => s.trim())
      .slice(0, 8),
    confidence: {
      score: Math.round(numericScore),
      explanation: conf.explanation.trim(),
    },
  };
}

/**
 * Reusable server-side service: complaintAnalysisService
 * Performs AI-powered manufacturing complaint classification, defect identification,
 * severity evaluation, historical pattern analysis, and initial unconfirmed root cause hypotheses.
 */
export async function analyzeComplaintWithGemini(
  complaint: FullComplaintAnalysisInput,
  historicalRelatedComplaints: HistoricalComplaintReference[] = []
) {
  validateComplaintInput(complaint);
  const ai = getGeminiClient();

  const historyContext = historicalRelatedComplaints
    .filter((h) => h.id !== complaint.id)
    .slice(0, 14);

  const promptPayload = {
    targetComplaint: {
      complaintId: complaint.id,
      customerName: complaint.customerName,
      productName: complaint.productName,
      productId: complaint.productId,
      batchNumber: complaint.batchNumber,
      reportedCategory: complaint.category,
      reportedSeverity: complaint.severity,
      complaintDescription: complaint.description,
      manufacturingProcess: complaint.processName,
      machineId: complaint.machineId || 'Not specified',
      processParameters: complaint.processParameters || 'Not specified',
      temperature: complaint.temperature || 'Not specified',
      pressure: complaint.pressure || 'Not specified',
      testType: complaint.testType || 'Not specified',
      expectedValue: complaint.expectedValue || 'Not specified',
      actualValue: complaint.actualValue || 'Not specified',
      testResult: complaint.testResults || 'Not specified',
    },
    historicalRelatedComplaints: historyContext,
  };

  let lastError: ComplaintAnalysisServiceError | null = null;
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: [
          'Analyze the following manufacturing customer complaint record and cross-reference the provided historical complaints.',
          '',
          JSON.stringify(promptPayload, null, 2),
        ].join('\n'),
        config: {
          systemInstruction: [
            'You are a Principal Manufacturing Quality Engineer performing automated complaint classification and diagnostic triage for an industrial QMS (ISO 9001 / IATF 16949).',
            `A. Classify predictedCategory strictly as one of: ${ALLOWED_CATEGORIES.join(', ')}.`,
            'B. Identify 3 to 7 concise defectKeywords, state the mainQualityIssue clearly, and write an analysisSummary in clear, accessible engineering language explaining the issue AND explicitly explaining why suggestedSeverity was chosen.',
            `C. Determine suggestedSeverity strictly as one of: ${ALLOWED_SEVERITIES.join(', ')} based on safety risk, functional failure, specification deviation, and customer impact.`,
            'D. In historicalPattern, identify recurring defect indicators, relationships between product, batch, machine, and process, and cite specific matching historical complaint IDs from historicalRelatedComplaints (if any match; otherwise state clearly that no strong historical match was found in the provided records).',
            'E. Generate 2 to 4 possibleCauses as INITIAL HYPOTHESES ONLY. NEVER claim any cause is confirmed or proven. Each hypothesis must specify cause, reason (why relevant to the parameters/test results), evidenceAvailable (from the record), and additionalVerificationRequired (physical inspection, metrology, or process checks needed to verify).',
            'Provide 3 to 5 concrete recommendedInvestigationSteps and a calibrated confidence object (score 0-100 and explanation referencing data completeness and historical alignment).',
            'Set complaintId strictly to the target complaintId.',
          ].join(' '),
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              complaintId: { type: Type.STRING },
              predictedCategory: { type: Type.STRING },
              suggestedSeverity: { type: Type.STRING },
              defectKeywords: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              mainQualityIssue: { type: Type.STRING },
              analysisSummary: { type: Type.STRING },
              possibleCauses: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    cause: { type: Type.STRING },
                    reason: { type: Type.STRING },
                    evidenceAvailable: { type: Type.STRING },
                    additionalVerificationRequired: { type: Type.STRING },
                  },
                  required: [
                    'cause',
                    'reason',
                    'evidenceAvailable',
                    'additionalVerificationRequired',
                  ],
                },
              },
              historicalPattern: { type: Type.STRING },
              recommendedInvestigationSteps: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              confidence: {
                type: Type.OBJECT,
                properties: {
                  score: { type: Type.NUMBER },
                  explanation: { type: Type.STRING },
                },
                required: ['score', 'explanation'],
              },
            },
            required: [
              'complaintId',
              'predictedCategory',
              'suggestedSeverity',
              'defectKeywords',
              'mainQualityIssue',
              'analysisSummary',
              'possibleCauses',
              'historicalPattern',
              'recommendedInvestigationSteps',
              'confidence',
            ],
          },
        },
      });

      const validated = parseAndValidateGeminiResponse(response.text, complaint.id);

      return {
        ...validated,
        analyzedAt: new Date().toISOString(),
        modelName: MODEL_NAME,
      };
    } catch (err) {
      const mapped = mapGeminiApiError(err);
      lastError = mapped;
      const retryable =
        mapped.code === 'NETWORK_ERROR' ||
        mapped.code === 'INVALID_GEMINI_RESPONSE' ||
        mapped.code === 'UPSTREAM_GEMINI_ERROR';
      if (!retryable || attempt === maxAttempts) {
        throw mapped;
      }
      await new Promise((resolve) => setTimeout(resolve, 650 * attempt));
    }
  }

  throw lastError ?? new ComplaintAnalysisServiceError('AI analysis failed.', 500);
}

export const complaintAnalysisService = {
  analyzeComplaintWithGemini,
  MODEL_NAME,
};
