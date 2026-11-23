import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeComplaintWithGemini,
  ComplaintAnalysisServiceError,
  type FullComplaintAnalysisInput,
  type HistoricalComplaintReference,
} from './server/complaintAnalysisService.ts';
import {
  analyzeRootCauseWithAI,
  explainPredictionsWithAI,
  explainTrendsWithAI,
  generateCapaWithAI,
  generateEffectivenessInsightsWithAI,
  type ComplaintInputPayload,
  type HistoricalComplaintSummary,
} from './server/geminiService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '2mb' }));

function sendErrorResponse(res: Response, error: unknown, fallbackMessage: string) {
  const errObj = error as Error & { statusCode?: number; status?: number; code?: string };
  const rawMessage = errObj?.message || fallbackMessage;
  const isBillingRequired =
    errObj?.status === 403 ||
    errObj?.statusCode === 403 ||
    /PERMISSION_DENIED|free tier is not available|set up billing/i.test(rawMessage);
  const isRateLimit =
    errObj?.statusCode === 429 ||
    errObj?.status === 429 ||
    rawMessage.includes('429') ||
    rawMessage.includes('RESOURCE_EXHAUSTED') ||
    /quota exceeded/i.test(rawMessage);

  const statusCode = isRateLimit
    ? 429
    : isBillingRequired
      ? 403
    : errObj?.statusCode ||
      errObj?.status ||
      (rawMessage.includes('GEMINI_API_KEY') ? 503 : 500);

  const message = isRateLimit
    ? 'Gemini AI rate limit or daily quota reached. Please wait briefly and retry.'
    : isBillingRequired
      ? 'Gemini API access requires billing. Enable billing for this Google Cloud project in Google AI Studio, then retry.'
    : rawMessage;

  console.error(`[Q-INTELLIGENCE API Error]`, rawMessage);
  res.status(statusCode).json({
    error: message,
    code: isRateLimit ? 'RATE_LIMITED' : errObj?.code || 'API_ERROR',
    aiUnavailable: true,
  });
}

app.get('/api/health', (_req: Request, res: Response) => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  res.json({
    status: 'ok',
    aiConfigured: Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY'),
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/ai/classify', async (req: Request, res: Response) => {
  try {
    const { complaint, historicalComplaints } = req.body as {
      complaint?: FullComplaintAnalysisInput;
      historicalComplaints?: HistoricalComplaintReference[];
    };
    const result = await analyzeComplaintWithGemini(
      complaint as FullComplaintAnalysisInput,
      Array.isArray(historicalComplaints) ? historicalComplaints : []
    );
    res.json(result);
  } catch (error) {
    if (error instanceof ComplaintAnalysisServiceError) {
      res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
        aiUnavailable: error.statusCode >= 500 || error.statusCode === 429,
      });
      return;
    }
    sendErrorResponse(res, error, 'Failed to classify complaint with Gemini AI.');
  }
});

app.post('/api/ai/root-cause', async (req: Request, res: Response) => {
  try {
    const { complaint, historicalComplaints } = req.body as {
      complaint?: ComplaintInputPayload;
      historicalComplaints?: HistoricalComplaintSummary[];
    };
    if (!complaint || !complaint.description || !complaint.productName) {
      res.status(400).json({ error: 'Valid complaint payload is required for root cause analysis.' });
      return;
    }
    const result = await analyzeRootCauseWithAI(
      complaint,
      Array.isArray(historicalComplaints) ? historicalComplaints : []
    );
    res.json(result);
  } catch (error) {
    sendErrorResponse(res, error, 'Failed to generate root cause hypotheses with Gemini AI.');
  }
});

app.post('/api/ai/capa', async (req: Request, res: Response) => {
  try {
    const {
      complaint,
      rootCauseHypotheses,
      historicalComplaints,
      verifiedRootCause,
      verifiedEvidence,
      rootCauseVerified,
      predictiveRiskFactors,
    } = req.body as {
      complaint?: ComplaintInputPayload;
      rootCauseHypotheses?: Array<{ title: string; description: string; managerStatus?: string }>;
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
    };
    if (!complaint || !complaint.description) {
      res.status(400).json({ error: 'Valid complaint payload is required for CAPA generation.' });
      return;
    }
    const result = await generateCapaWithAI({
      complaint,
      rootCauseHypotheses: Array.isArray(rootCauseHypotheses) ? rootCauseHypotheses : [],
      historicalComplaints: Array.isArray(historicalComplaints) ? historicalComplaints : [],
      verifiedRootCause,
      verifiedEvidence,
      rootCauseVerified,
      predictiveRiskFactors,
    });
    res.json(result);
  } catch (error) {
    sendErrorResponse(res, error, 'Failed to generate CAPA recommendations with Gemini AI.');
  }
});

app.post('/api/ai/explain-trends', async (req: Request, res: Response) => {
  try {
    const { trendSummary } = req.body as { trendSummary?: Record<string, unknown> };
    if (!trendSummary || typeof trendSummary !== 'object') {
      res.status(400).json({ error: 'Aggregated trendSummary payload is required.' });
      return;
    }
    const result = await explainTrendsWithAI(trendSummary);
    res.json(result);
  } catch (error) {
    sendErrorResponse(res, error, 'Failed to explain complaint trends with Gemini AI.');
  }
});

app.post('/api/ai/explain-predictions', async (req: Request, res: Response) => {
  try {
    const { predictiveSummary } = req.body as { predictiveSummary?: Record<string, unknown> };
    if (!predictiveSummary || typeof predictiveSummary !== 'object') {
      res.status(400).json({ error: 'Calculated predictiveSummary payload is required.' });
      return;
    }
    const result = await explainPredictionsWithAI(predictiveSummary);
    res.json(result);
  } catch (error) {
    sendErrorResponse(res, error, 'Failed to explain predictive risk insights with Gemini AI.');
  }
});

app.post('/api/ai/effectiveness-insights', async (req: Request, res: Response) => {
  try {
    const { effectivenessSummary } = req.body as { effectivenessSummary?: Record<string, unknown> };
    if (!effectivenessSummary || typeof effectivenessSummary !== 'object') {
      res.status(400).json({ error: 'Aggregated effectivenessSummary payload is required.' });
      return;
    }
    const result = await generateEffectivenessInsightsWithAI(effectivenessSummary);
    res.json(result);
  } catch (error) {
    sendErrorResponse(res, error, 'Failed to generate quality effectiveness insights with Gemini AI.');
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Q-INTELLIGENCE server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
