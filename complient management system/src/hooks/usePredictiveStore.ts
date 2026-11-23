import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  CAPARecord,
  ComplaintRecord,
  PredictiveAlert,
  PredictiveAlertStatus,
  PredictionHistoryEntry,
  PreventiveActionPlan,
  RiskScoringWeights,
} from '../types/qms';
import {
  computeBatchRiskAssessments,
  computeProcessRiskAssessments,
  computeProductRiskAssessments,
  createSeedPredictionHistory,
  DEFAULT_RISK_WEIGHTS,
  detectPredictiveAlertCandidates,
  evaluatePredictionHistory,
  generatePreventiveActionCandidates,
} from '../utils/predictiveEngine';

const WEIGHTS_KEY = 'q_intelligence_risk_weights_v1';
const ALERTS_KEY = 'q_intelligence_predictive_alerts_v1';
const PLANS_KEY = 'q_intelligence_preventive_plans_v1';
const HISTORY_KEY = 'q_intelligence_prediction_history_v1';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function usePredictiveStore(
  complaints: ComplaintRecord[],
  capaRecords?: CAPARecord[]
) {
  const [weights, setWeights] = useState<RiskScoringWeights>(() =>
    readJson<RiskScoringWeights>(WEIGHTS_KEY, DEFAULT_RISK_WEIGHTS)
  );
  const [storedAlerts, setStoredAlerts] = useState<PredictiveAlert[]>(() =>
    readJson<PredictiveAlert[]>(ALERTS_KEY, [])
  );
  const [storedPlans, setStoredPlans] = useState<PreventiveActionPlan[]>(() =>
    readJson<PreventiveActionPlan[]>(PLANS_KEY, [])
  );
  const [rawHistory, setRawHistory] = useState<PredictionHistoryEntry[]>(() =>
    readJson<PredictionHistoryEntry[]>(HISTORY_KEY, [])
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(WEIGHTS_KEY, JSON.stringify(weights));
    } catch {
      // ignore storage quota errors
    }
  }, [weights]);

  const productRisks = useMemo(
    () => computeProductRiskAssessments(complaints, weights, capaRecords),
    [complaints, weights, capaRecords]
  );

  const processRisks = useMemo(
    () => computeProcessRiskAssessments(complaints, weights, capaRecords),
    [complaints, weights, capaRecords]
  );

  const batchRisks = useMemo(
    () => computeBatchRiskAssessments(complaints, productRisks),
    [complaints, productRisks]
  );

  // Sync alerts cleanly while deduplicating by conditionKey and preserving manager state
  const alerts = useMemo(() => {
    const candidates = detectPredictiveAlertCandidates(
      complaints,
      productRisks,
      processRisks,
      batchRisks,
      capaRecords
    );
    const byCondition = new Map(storedAlerts.map((a) => [a.conditionKey, a]));
    const merged: PredictiveAlert[] = [];
    const seenKeys = new Set<string>();
    const seenIds = new Set<string>();

    for (const cand of candidates) {
      if (seenKeys.has(cand.conditionKey)) continue;
      seenKeys.add(cand.conditionKey);
      const existing = byCondition.get(cand.conditionKey);
      const useExistingId =
        existing &&
        !existing.id.startsWith('ALT-BATCH-') &&
        !seenIds.has(existing.id);
      const resolvedId = useExistingId
        ? existing.id
        : !seenIds.has(cand.id)
          ? cand.id
          : `${cand.id}-${merged.length + 1}`;
      seenIds.add(resolvedId);

      if (existing) {
        merged.push({
          ...cand,
          id: resolvedId,
          status: existing.status,
          assignedTo: existing.assignedTo,
          investigationNotes: existing.investigationNotes,
          detectionDate: existing.detectionDate,
          updatedAt: existing.updatedAt,
        });
      } else {
        merged.push({ ...cand, id: resolvedId });
      }
    }

    // Preserve any resolved historical alerts not currently triggered
    for (const prev of storedAlerts) {
      if (
        !seenKeys.has(prev.conditionKey) &&
        prev.status === 'Resolved' &&
        !seenIds.has(prev.id)
      ) {
        seenKeys.add(prev.conditionKey);
        seenIds.add(prev.id);
        merged.push(prev);
      }
    }

    const statusOrder: Record<PredictiveAlertStatus, number> = {
      New: 0,
      'Under Investigation': 1,
      Acknowledged: 2,
      Resolved: 3,
    };
    return merged.sort(
      (a, b) =>
        statusOrder[a.status] - statusOrder[b.status] ||
        (a.riskLevel === 'HIGH' ? 0 : 1) - (b.riskLevel === 'HIGH' ? 0 : 1)
    );
  }, [complaints, productRisks, processRisks, batchRisks, capaRecords, storedAlerts]);

  useEffect(() => {
    try {
      window.localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
    } catch {
      // ignore
    }
  }, [alerts]);

  // Sync preventive plans while preserving manager workflow edits
  const preventivePlans = useMemo(() => {
    const candidates = generatePreventiveActionCandidates(productRisks, processRisks);
    const byKey = new Map(storedPlans.map((p) => [p.planKey, p]));
    const seen = new Set<string>();
    const seenPlanIds = new Set<string>();
    const merged: PreventiveActionPlan[] = [];

    for (const cand of candidates) {
      if (seen.has(cand.planKey)) continue;
      seen.add(cand.planKey);
      const existing = byKey.get(cand.planKey);
      const resolvedPlanId =
        existing && !seenPlanIds.has(existing.id)
          ? existing.id
          : !seenPlanIds.has(cand.id)
            ? cand.id
            : `${cand.id}-${merged.length + 1}`;
      seenPlanIds.add(resolvedPlanId);

      if (existing) {
        merged.push({
          ...cand,
          id: resolvedPlanId,
          status: existing.status,
          responsiblePerson: existing.responsiblePerson,
          targetDate: existing.targetDate,
          verificationResults: existing.verificationResults,
          updatedAt: existing.updatedAt,
        });
      } else {
        merged.push({ ...cand, id: resolvedPlanId });
      }
    }
    return merged;
  }, [productRisks, processRisks, storedPlans]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PLANS_KEY, JSON.stringify(preventivePlans));
    } catch {
      // ignore
    }
  }, [preventivePlans]);

  // Prediction history initialized from real historical months if empty, and evaluated live
  const predictionHistory = useMemo(() => {
    const base =
      rawHistory.length > 0
        ? rawHistory
        : createSeedPredictionHistory(complaints, productRisks);
    return evaluatePredictionHistory(base, complaints);
  }, [rawHistory, complaints, productRisks]);

  useEffect(() => {
    if (rawHistory.length === 0 && predictionHistory.length > 0) {
      setRawHistory(predictionHistory);
    }
  }, [rawHistory.length, predictionHistory]);

  useEffect(() => {
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(predictionHistory));
    } catch {
      // ignore
    }
  }, [predictionHistory]);

  const updateAlert = useCallback(
    (
      alertId: string,
      patch: Partial<Pick<PredictiveAlert, 'status' | 'assignedTo' | 'investigationNotes'>>
    ) => {
      const target = alerts.find((a) => a.id === alertId);
      if (!target) return;
      const updated: PredictiveAlert = {
        ...target,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      setStoredAlerts((prev) => {
        const rest = prev.filter((a) => a.conditionKey !== updated.conditionKey);
        return [updated, ...rest];
      });
    },
    [alerts]
  );

  const updatePreventivePlan = useCallback(
    (
      planId: string,
      patch: Partial<
        Pick<
          PreventiveActionPlan,
          'status' | 'responsiblePerson' | 'targetDate' | 'verificationResults'
        >
      >
    ) => {
      const target = preventivePlans.find((p) => p.id === planId);
      if (!target) return;
      const updated: PreventiveActionPlan = {
        ...target,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      setStoredPlans((prev) => {
        const rest = prev.filter((p) => p.planKey !== updated.planKey);
        return [updated, ...rest];
      });
    },
    [preventivePlans]
  );

  const addPredictionSnapshot = useCallback(
    (entry: Omit<PredictionHistoryEntry, 'id' | 'actualComplaintCount' | 'evaluationStatus'>) => {
      const next: PredictionHistoryEntry = {
        ...entry,
        id: `PHIST-${Date.now()}`,
        actualComplaintCount: null,
        evaluationStatus: 'Pending Elapsed Data',
      };
      setRawHistory((prev) => [next, ...(prev.length > 0 ? prev : predictionHistory)]);
    },
    [predictionHistory]
  );

  const resetWeights = useCallback(() => {
    setWeights({ ...DEFAULT_RISK_WEIGHTS });
  }, []);

  return {
    weights,
    setWeights,
    resetWeights,
    productRisks,
    processRisks,
    batchRisks,
    alerts,
    updateAlert,
    preventivePlans,
    updatePreventivePlan,
    predictionHistory,
    addPredictionSnapshot,
  };
}
