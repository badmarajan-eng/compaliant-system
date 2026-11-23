import { useCallback, useEffect, useState } from 'react';
import { DEMO_COMPLAINTS } from '../data/demoComplaints';
import type {
  AIClassificationResult,
  CAPAActionItem,
  CAPARecord,
  CAPAStatusHistoryEntry,
  ComplaintHistoryEntry,
  ComplaintRecord,
  ComplaintStatus,
  ManagerVerificationRecord,
  RootCauseAnalysisRecord,
} from '../types/qms';
import { hydrateAIClassificationResult } from '../utils/aiAnalysisUtils';
import {
  computeCapaProgress,
  generateNextCapaId,
  hydrateDemoCapaRecords,
  resolveEffectiveCapaStatus,
  syncCapasToComplaintActions,
} from '../utils/capaUtils';
import { generateNextComplaintId } from '../utils/csvUtils';

const STORAGE_KEY = 'q_intelligence_complaints_v1';
const CAPA_STORAGE_KEY = 'q_intelligence_capa_records_v1';

function normalizeStatus(raw: string): ComplaintStatus {
  if (raw === 'Open') return 'New';
  if (raw === 'CAPA In Progress') return 'Corrective Action In Progress';
  const valid: ComplaintStatus[] = [
    'New',
    'Under Investigation',
    'Root Cause Identified',
    'Corrective Action In Progress',
    'Verification Pending',
    'Closed',
  ];
  return valid.includes(raw as ComplaintStatus) ? (raw as ComplaintStatus) : 'New';
}

function hydrateComplaint(c: ComplaintRecord): ComplaintRecord {
  const status = normalizeStatus(c.status);
  const history: ComplaintHistoryEntry[] =
    Array.isArray(c.history) && c.history.length > 0
      ? c.history
      : [
          {
            id: `HIST-${c.id}-INIT`,
            timestamp: `${c.complaintDate}T09:00:00`,
            action: 'Complaint Registered',
            toStatus: status,
            actor: c.assignedManager || 'R. Deshmukh (Quality Manager)',
            notes: c.isDemoData ? 'Initial historical record (DEMO DATA).' : 'Complaint created.',
          },
        ];

  const hydratedLatest = c.aiClassification
    ? hydrateAIClassificationResult(c.aiClassification, c)
    : undefined;

  const rawHistory = Array.isArray(c.aiAnalysisHistory)
    ? c.aiAnalysisHistory
        .map((item) => hydrateAIClassificationResult(item, c))
        .filter((item): item is AIClassificationResult => Boolean(item))
    : [];

  const aiAnalysisHistory =
    rawHistory.length > 0
      ? rawHistory
      : hydratedLatest
      ? [hydratedLatest]
      : undefined;

  return {
    ...c,
    status,
    assignedManager: c.assignedManager || 'R. Deshmukh',
    priority: c.priority || (c.severity === 'Critical' ? 'Urgent' : c.severity === 'High' ? 'High' : 'Normal'),
    history,
    aiClassification: aiAnalysisHistory?.[0] ?? hydratedLatest,
    aiAnalysisHistory,
  };
}

function loadInitialComplaints(): ComplaintRecord[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const hydrated = DEMO_COMPLAINTS.map(hydrateComplaint);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(hydrated));
      return hydrated;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return (parsed as ComplaintRecord[]).map(hydrateComplaint);
    }
    if (Array.isArray(parsed) && parsed.length === 0) {
      return [];
    }
  } catch {
    // Fall back to demo complaints if storage is corrupted
  }
  const hydrated = DEMO_COMPLAINTS.map(hydrateComplaint);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(hydrated));
  return hydrated;
}

function hydrateCapaRecord(c: CAPARecord): CAPARecord {
  return {
    ...c,
    status: resolveEffectiveCapaStatus(c),
    progressPercent: computeCapaProgress(c),
    attachments: Array.isArray(c.attachments) ? c.attachments : [],
    history: Array.isArray(c.history) ? c.history : [],
    containmentActions: Array.isArray(c.containmentActions) ? c.containmentActions : [],
    correctiveActions: Array.isArray(c.correctiveActions) ? c.correctiveActions : [],
    preventiveActions: Array.isArray(c.preventiveActions) ? c.preventiveActions : [],
  };
}

function loadInitialCapaRecords(initialComplaints: ComplaintRecord[]): CAPARecord[] {
  try {
    const raw = window.localStorage.getItem(CAPA_STORAGE_KEY);
    if (!raw) {
      const hydrated = hydrateDemoCapaRecords(initialComplaints).map(hydrateCapaRecord);
      window.localStorage.setItem(CAPA_STORAGE_KEY, JSON.stringify(hydrated));
      return hydrated;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return (parsed as CAPARecord[]).map(hydrateCapaRecord);
    }
  } catch {
    // Fall back to demo CAPAs if storage is corrupted
  }
  const hydrated = hydrateDemoCapaRecords(initialComplaints).map(hydrateCapaRecord);
  window.localStorage.setItem(CAPA_STORAGE_KEY, JSON.stringify(hydrated));
  return hydrated;
}

export function useQmsStore() {
  const [complaints, setComplaints] = useState<ComplaintRecord[]>(() =>
    loadInitialComplaints()
  );
  const [capaRecords, setCapaRecords] = useState<CAPARecord[]>(() =>
    loadInitialCapaRecords(loadInitialComplaints())
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(complaints));
    } catch (err) {
      console.error('Failed to persist complaints to localStorage:', err);
    }
  }, [complaints]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CAPA_STORAGE_KEY, JSON.stringify(capaRecords));
    } catch (err) {
      console.error('Failed to persist CAPA records to localStorage:', err);
    }
  }, [capaRecords]);

  const addComplaint = useCallback(
    (
      payload: Omit<
        ComplaintRecord,
        'id' | 'isDemoData' | 'capaActions' | 'resolutionDate'
      > & { id?: string; resolutionDate?: string }
    ): ComplaintRecord => {
      const existingSet = new Set(complaints.map((c) => c.id.toUpperCase()));
      let id = payload.id?.trim() || generateNextComplaintId(complaints);
      if (existingSet.has(id.toUpperCase())) {
        id = generateNextComplaintId(complaints);
      }

      const nowIso = new Date().toISOString();
      const created: ComplaintRecord = hydrateComplaint({
        ...payload,
        id,
        resolutionDate:
          payload.status === 'Closed'
            ? payload.resolutionDate || nowIso.slice(0, 10)
            : undefined,
        isDemoData: false,
        history: [
          {
            id: `HIST-${id}-${Date.now()}`,
            timestamp: nowIso,
            action: 'Complaint Registered',
            toStatus: payload.status,
            actor: payload.assignedManager?.trim() || 'R. Deshmukh',
            notes: 'Registered via Q-INTELLIGENCE Complaint Management.',
          },
        ],
        capaActions: [],
      });
      setComplaints((prev) => [created, ...prev]);
      return created;
    },
    [complaints]
  );

  const importComplaints = useCallback((records: ComplaintRecord[]) => {
    setComplaints((prev) => {
      const existingIds = new Set(prev.map((c) => c.id.toUpperCase()));
      const uniqueIncoming = records
        .filter((r) => !existingIds.has(r.id.toUpperCase()))
        .map(hydrateComplaint);
      return [...uniqueIncoming, ...prev];
    });
  }, []);

  const updateComplaint = useCallback(
    (id: string, patch: Partial<ComplaintRecord>, auditNote?: string) => {
      setComplaints((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          const nextStatus = patch.status ?? item.status;
          let resolutionDate =
            patch.resolutionDate !== undefined ? patch.resolutionDate : item.resolutionDate;
          if (nextStatus === 'Closed' && !resolutionDate) {
            resolutionDate = new Date().toISOString().slice(0, 10);
          } else if (nextStatus !== 'Closed' && patch.status !== undefined) {
            resolutionDate = undefined;
          }

          const nowIso = new Date().toISOString();
          const currentHistory = item.history ?? [];
          const nextHistory = [...currentHistory];

          if (patch.status !== undefined && patch.status !== item.status) {
            nextHistory.unshift({
              id: `HIST-${id}-${Date.now()}`,
              timestamp: nowIso,
              action: 'Status Updated',
              fromStatus: item.status,
              toStatus: patch.status,
              actor: patch.assignedManager || item.assignedManager || 'Quality Manager',
              notes: auditNote || `Status changed from ${item.status} to ${patch.status}.`,
            });
          } else if (
            Object.keys(patch).some(
              (k) =>
                k !== 'aiClassification' &&
                k !== 'aiAnalysisHistory' &&
                k !== 'rootCauseAnalysis' &&
                k !== 'capaActions'
            )
          ) {
            nextHistory.unshift({
              id: `HIST-${id}-${Date.now()}`,
              timestamp: nowIso,
              action: 'Complaint Updated',
              actor: patch.assignedManager || item.assignedManager || 'Quality Manager',
              notes: auditNote || 'Complaint record details updated.',
            });
          }

          return {
            ...item,
            ...patch,
            id: item.id, // Enforce Complaint ID immutability & uniqueness
            resolutionDate,
            history: nextHistory,
          };
        })
      );
    },
    []
  );

  const updateComplaintStatus = useCallback(
    (id: string, status: ComplaintStatus, notes?: string) => {
      updateComplaint(id, { status }, notes);
    },
    [updateComplaint]
  );

  const deleteComplaint = useCallback((id: string) => {
    setComplaints((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const saveClassification = useCallback(
    (id: string, classification: AIClassificationResult) => {
      setComplaints((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          const existingAnalyses = c.aiAnalysisHistory ?? (c.aiClassification ? [c.aiClassification] : []);
          const nextAnalyses = [classification, ...existingAnalyses];
          const nextHistory: ComplaintHistoryEntry[] = [
            {
              id: `HIST-${id}-AI-${Date.now()}`,
              timestamp: new Date().toISOString(),
              action: 'AI Classification Completed',
              actor: 'Gemini AI Engine',
              notes: `Predicted ${classification.predictedCategory} (${classification.confidence.score}% confidence, suggested ${classification.suggestedSeverity} severity). Original complaint severity (${c.severity}) preserved.`,
            },
            ...(c.history ?? []),
          ];
          return {
            ...c,
            aiClassification: classification,
            aiAnalysisHistory: nextAnalyses,
            history: nextHistory,
          };
        })
      );
    },
    []
  );

  const saveManagerVerification = useCallback(
    (
      complaintId: string,
      analysisId: string,
      verification: ManagerVerificationRecord,
      applyConfirmedFieldsToRecord = false
    ) => {
      setComplaints((prev) =>
        prev.map((c) => {
          if (c.id !== complaintId) return c;
          const existingAnalyses =
            c.aiAnalysisHistory ?? (c.aiClassification ? [c.aiClassification] : []);
          const updatedAnalyses = existingAnalyses.map((item) =>
            item.analysisId === analysisId
              ? { ...item, managerVerification: verification }
              : item
          );
          const updatedLatest =
            c.aiClassification?.analysisId === analysisId
              ? { ...c.aiClassification, managerVerification: verification }
              : updatedAnalyses[0] ?? c.aiClassification;

          const nextHistory: ComplaintHistoryEntry[] = [
            {
              id: `HIST-${complaintId}-VER-${Date.now()}`,
              timestamp: verification.reviewedAt || new Date().toISOString(),
              action:
                verification.decision === 'Accepted'
                  ? 'AI Analysis Accepted by Manager'
                  : 'AI Analysis Rejected by Manager',
              actor: verification.reviewedBy || c.assignedManager || 'R. Deshmukh',
              notes: [
                `Confirmed category: ${verification.confirmedCategory}, severity: ${verification.confirmedSeverity}.`,
                applyConfirmedFieldsToRecord
                  ? 'Applied confirmed category & severity to complaint record.'
                  : 'Complaint record fields left unchanged.',
                verification.investigationNotes
                  ? `Notes: ${verification.investigationNotes}`
                  : '',
              ]
                .filter(Boolean)
                .join(' '),
            },
            ...(c.history ?? []),
          ];

          return {
            ...c,
            category: applyConfirmedFieldsToRecord
              ? verification.confirmedCategory
              : c.category,
            severity: applyConfirmedFieldsToRecord
              ? verification.confirmedSeverity
              : c.severity,
            aiClassification: updatedLatest,
            aiAnalysisHistory: updatedAnalyses,
            history: nextHistory,
          };
        })
      );
    },
    []
  );

  const saveRootCauseAnalysis = useCallback(
    (id: string, rca: RootCauseAnalysisRecord) => {
      setComplaints((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          const prevVerified =
            Boolean(c.rootCauseAnalysis?.manualVerifiedRootCause?.trim()) ||
            Boolean(
              c.rootCauseAnalysis?.hypotheses.some((h) => h.managerStatus === 'Verified')
            );
          const nowVerified =
            Boolean(rca.manualVerifiedRootCause?.trim()) ||
            rca.hypotheses.some((h) => h.managerStatus === 'Verified');

          let nextStatus = c.status;
          const nextHistory = [...(c.history ?? [])];

          if (nowVerified && (c.status === 'New' || c.status === 'Under Investigation')) {
            nextStatus = 'Root Cause Identified';
          }

          if (nowVerified && !prevVerified) {
            const verifiedTitle =
              rca.manualVerifiedRootCause?.trim() ||
              rca.hypotheses.find((h) => h.managerStatus === 'Verified')?.title ||
              'Root cause verified';
            nextHistory.unshift({
              id: `HIST-${id}-RCA-${Date.now()}`,
              timestamp: new Date().toISOString(),
              action: 'Root Cause Verified',
              fromStatus: c.status !== nextStatus ? c.status : undefined,
              toStatus: nextStatus,
              actor: rca.verifiedBy || c.assignedManager || 'R. Deshmukh',
              notes: `Verified root cause: ${verifiedTitle}${
                rca.verifiedEvidence ? ` · Evidence: ${rca.verifiedEvidence}` : ''
              }`,
            });
          } else if (!c.rootCauseAnalysis && rca.hypotheses.length > 0) {
            if (c.status === 'New') {
              nextStatus = 'Under Investigation';
            }
            nextHistory.unshift({
              id: `HIST-${id}-RCA-GEN-${Date.now()}`,
              timestamp: new Date().toISOString(),
              action: '6M Root Cause Investigation Started',
              fromStatus: c.status !== nextStatus ? c.status : undefined,
              toStatus: nextStatus,
              actor: 'Gemini AI Engine',
              notes: `Generated ${rca.hypotheses.length} 6M root cause hypotheses and 5 Whys investigation path.`,
            });
          }

          return {
            ...c,
            status: nextStatus,
            rootCauseAnalysis: rca,
            history: nextHistory,
          };
        })
      );
    },
    []
  );

  const updateCapaActions = useCallback((id: string, capaActions: CAPAActionItem[]) => {
    setComplaints((prev) =>
      prev.map((c) => (c.id === id ? { ...c, capaActions } : c))
    );
  }, []);

  const syncComplaintCapaActions = useCallback(
    (affectedComplaintIds: string[], nextCapas: CAPARecord[], auditSummary?: { action: string; actor: string; notes: string }) => {
      const idSet = new Set(affectedComplaintIds.filter(Boolean));
      if (idSet.size === 0) return;
      setComplaints((prev) =>
        prev.map((c) => {
          if (!idSet.has(c.id)) return c;
          const syncedActions = syncCapasToComplaintActions(c.id, nextCapas);
          const nextHistory = auditSummary
            ? [
                {
                  id: `HIST-${c.id}-CAPA-${Date.now()}`,
                  timestamp: new Date().toISOString(),
                  action: auditSummary.action,
                  actor: auditSummary.actor,
                  notes: auditSummary.notes,
                },
                ...(c.history ?? []),
              ]
            : c.history;
          return {
            ...c,
            capaActions: syncedActions,
            history: nextHistory,
          };
        })
      );
    },
    []
  );

  const addCapaRecord = useCallback(
    (
      payload: Omit<CAPARecord, 'id' | 'isDemoData' | 'history' | 'progressPercent'> & {
        id?: string;
      }
    ): CAPARecord => {
      const existingIds = new Set(capaRecords.map((r) => r.id.toUpperCase()));
      let id = payload.id?.trim() || generateNextCapaId(capaRecords);
      if (existingIds.has(id.toUpperCase())) {
        id = generateNextCapaId(capaRecords);
      }

      const nowIso = new Date().toISOString();
      const initialHistory: CAPAStatusHistoryEntry[] = [
        {
          id: `CHIST-${id}-${Date.now()}`,
          timestamp: nowIso,
          action: 'CAPA Registered',
          toStatus: payload.status,
          actor: payload.owner || 'R. Deshmukh',
          notes: `Linked to ${payload.complaintId} (${payload.productName}, Batch ${payload.batchNumber}).`,
        },
      ];

      const created = hydrateCapaRecord({
        ...payload,
        id,
        progressPercent: 0,
        history: initialHistory,
        isDemoData: false,
      });

      const nextCapas = [created, ...capaRecords];
      setCapaRecords(nextCapas);
      syncComplaintCapaActions([created.complaintId], nextCapas, {
        action: `CAPA ${created.id} Created`,
        actor: created.owner || 'R. Deshmukh',
        notes: `${created.priority} priority CAPA assigned to ${created.responsibleDepartment}.`,
      });
      return created;
    },
    [capaRecords, syncComplaintCapaActions]
  );

  const updateCapaRecord = useCallback(
    (
      capaId: string,
      patch: Partial<CAPARecord>,
      auditMeta?: { action?: string; actor?: string; notes?: string }
    ) => {
      const existing = capaRecords.find((r) => r.id === capaId);
      if (!existing) return;

      const nowIso = new Date().toISOString();
      const mergedDraft: CAPARecord = {
        ...existing,
        ...patch,
        id: existing.id,
      };
      const resolvedStatus = resolveEffectiveCapaStatus(mergedDraft);
      const computedProgress = computeCapaProgress(mergedDraft);

      const statusChanged = resolvedStatus !== existing.status;
      const historyEntry: CAPAStatusHistoryEntry | null =
        auditMeta?.action || statusChanged
          ? {
              id: `CHIST-${capaId}-${Date.now()}`,
              timestamp: nowIso,
              action: auditMeta?.action || 'CAPA Status Updated',
              fromStatus: statusChanged ? existing.status : undefined,
              toStatus: resolvedStatus,
              actor: auditMeta?.actor || mergedDraft.owner || 'R. Deshmukh',
              notes:
                auditMeta?.notes ||
                (statusChanged
                  ? `Status updated from ${existing.status} to ${resolvedStatus}.`
                  : 'CAPA record updated.'),
            }
          : null;

      const nextHistory = historyEntry
        ? [historyEntry, ...(patch.history ?? existing.history)]
        : patch.history ?? existing.history;

      const updated: CAPARecord = {
        ...mergedDraft,
        status: resolvedStatus,
        progressPercent: patch.progressPercent ?? computedProgress,
        history: nextHistory,
      };

      const nextCapas = capaRecords.map((r) => (r.id === capaId ? updated : r));
      setCapaRecords(nextCapas);
      syncComplaintCapaActions(
        [existing.complaintId, updated.complaintId],
        nextCapas,
        statusChanged &&
          (resolvedStatus === 'Effective' ||
            resolvedStatus === 'Ineffective' ||
            resolvedStatus === 'Closed')
          ? {
              action: `CAPA ${capaId} Marked ${resolvedStatus}`,
              actor: auditMeta?.actor || updated.effectiveness.reviewer || 'R. Deshmukh',
              notes: updated.effectiveness.comments || `Effectiveness decision: ${updated.effectiveness.decision}.`,
            }
          : undefined
      );
    },
    [capaRecords, syncComplaintCapaActions]
  );

  const deleteCapaRecord = useCallback(
    (capaId: string) => {
      const target = capaRecords.find((r) => r.id === capaId);
      if (!target) return;
      const nextCapas = capaRecords.filter((r) => r.id !== capaId);
      setCapaRecords(nextCapas);
      syncComplaintCapaActions([target.complaintId], nextCapas, {
        action: `CAPA ${capaId} Deleted`,
        actor: 'R. Deshmukh',
        notes: 'CAPA record removed from active register.',
      });
    },
    [capaRecords, syncComplaintCapaActions]
  );

  const resetDemoData = useCallback(() => {
    const hydrated = DEMO_COMPLAINTS.map(hydrateComplaint);
    const hydratedCapas = hydrateDemoCapaRecords(hydrated).map(hydrateCapaRecord);
    setComplaints(hydrated);
    setCapaRecords(hydratedCapas);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(hydrated));
    window.localStorage.setItem(CAPA_STORAGE_KEY, JSON.stringify(hydratedCapas));
  }, []);

  return {
    complaints,
    capaRecords,
    addComplaint,
    importComplaints,
    updateComplaint,
    updateComplaintStatus,
    deleteComplaint,
    saveClassification,
    saveManagerVerification,
    saveRootCauseAnalysis,
    updateCapaActions,
    addCapaRecord,
    updateCapaRecord,
    deleteCapaRecord,
    resetDemoData,
  };
}
