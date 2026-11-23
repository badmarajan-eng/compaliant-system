import { ExternalLink, X } from 'lucide-react';
import { RiskTierText, SeverityText, StatusText } from './StatusText';
import type {
  BatchRiskAssessment,
  ModuleId,
  ProcessRiskAssessment,
  ProductRiskAssessment,
} from '../types/qms';

export type PredictiveDetailSelection =
  | { kind: 'Product'; data: ProductRiskAssessment }
  | { kind: 'Process'; data: ProcessRiskAssessment }
  | { kind: 'Batch'; data: BatchRiskAssessment };

interface PredictiveEntityDetailModalProps {
  selection: PredictiveDetailSelection | null;
  onClose: () => void;
  onNavigate?: (module: ModuleId, complaintId?: string) => void;
}

export function PredictiveEntityDetailModal({
  selection,
  onClose,
  onNavigate,
}: PredictiveEntityDetailModalProps) {
  if (!selection) return null;

  const title =
    selection.kind === 'Product'
      ? `${selection.data.productId} · ${selection.data.productName}`
      : selection.kind === 'Process'
        ? selection.data.processName
        : `${selection.data.batchNumber} · ${selection.data.productName}`;

  const complaints = selection.data.complaints;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50" role="dialog" aria-modal="true">
      <div className="w-full max-w-2xl bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col">
        <div className="px-6 py-4 bg-[#0B1426] text-white flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-cyan-400 font-medium">
              {selection.kind} Predictive Risk Analysis
            </p>
            <h2 className="text-base font-bold text-white truncate mt-0.5">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close risk analysis drawer"
            className="p-1.5 text-slate-300 hover:text-white rounded-md"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
          {/* Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-lg p-4">
            <div>
              <span className="text-slate-500 block">Risk Score</span>
              {selection.data.riskScore !== null &&
              selection.data.riskLevel !== 'INSUFFICIENT DATA' ? (
                <div className="mt-1">
                  <RiskTierText tier={selection.data.riskLevel} score={selection.data.riskScore} />
                </div>
              ) : (
                <span className="font-semibold text-amber-800 block mt-1">Insufficient Data</span>
              )}
            </div>
            <div>
              <span className="text-slate-500 block">Linked Complaints</span>
              <span className="font-mono tabular-nums font-bold text-slate-900 text-sm mt-0.5 block">
                {complaints.length}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Critical Count</span>
              <span className="font-mono tabular-nums font-bold text-red-700 text-sm mt-0.5 block">
                {complaints.filter((c) => c.severity === 'Critical').length}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">
                {selection.kind === 'Batch' ? 'Batch Classification' : 'Data Completeness'}
              </span>
              <span className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5 block">
                {selection.kind === 'Batch'
                  ? selection.data.assessmentStatus
                  : `${selection.data.dataCompletenessPercent}%`}
              </span>
            </div>
          </div>

          <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
            Empirical prioritization index (0–100), not a probability forecast.{' '}
            {selection.kind === 'Process'
              ? 'Process association alone does not establish root-cause causation without physical inspection.'
              : selection.kind === 'Batch'
                ? 'Estimated batch risk indicates preventive inspection priority rather than confirmed lot rejection unless defect history is verified.'
                : 'Supports engineering triage and preventive inspection planning.'}
          </p>

          {/* Factor Breakdown for Product / Process */}
          {(selection.kind === 'Product' || selection.kind === 'Process') &&
            selection.data.factorBreakdown.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  Weighted Risk Factor Breakdown
                </h3>
                <div className="space-y-2.5">
                  {selection.data.factorBreakdown.map((f) => (
                    <div key={f.key} className="border border-slate-200 rounded-md p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">
                          {f.label} ({f.weightPercent}% max)
                        </span>
                        <span className="font-mono tabular-nums font-bold text-cyan-800">
                          {f.contributionPoints} pts
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                        <div
                          className="h-full bg-cyan-700 rounded-full"
                          style={{
                            width: `${Math.min(
                              100,
                              f.weightPercent > 0 ? (f.contributionPoints / f.weightPercent) * 100 : 0
                            )}%`,
                          }}
                        />
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1">
                        {f.rawSummary} · <span className="text-slate-500">{f.dataStatus}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

          {/* Batch Telemetry & Risk Factors */}
          {selection.kind === 'Batch' && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">Batch Telemetry & Assessment Basis</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border border-slate-200 rounded-md p-3">
                <div>
                  <p className="font-semibold text-slate-800">Recorded Telemetry</p>
                  <p className="text-slate-600 mt-1">
                    {selection.data.telemetryAvailable.length > 0
                      ? selection.data.telemetryAvailable.join(' · ')
                      : 'None recorded'}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-slate-800">Missing Fields</p>
                  <p className="text-amber-800 mt-1">
                    {selection.data.missingFields.length > 0
                      ? selection.data.missingFields.join(' · ')
                      : 'All core batch fields recorded'}
                  </p>
                </div>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-slate-700">
                {selection.data.riskFactors.map((rf, i) => (
                  <li key={i}>{rf}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Verified Root Causes vs Unverified AI Leads */}
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <h3 className="text-sm font-semibold text-slate-900">
              Verified Root Causes vs AI Hypotheses
            </h3>
            {selection.data.verifiedRootCauses.length > 0 ? (
              <ul className="list-disc pl-4 space-y-1 text-emerald-900">
                {selection.data.verifiedRootCauses.map((rc, i) => (
                  <li key={i}>{rc}</li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-500">
                No manager-verified root causes recorded yet
                {selection.kind !== 'Batch' && selection.data.aiHypothesesCount > 0
                  ? ` (${selection.data.aiHypothesesCount} unverified AI hypothesis lead(s) pending validation).`
                  : '.'}
              </p>
            )}
          </div>

          {/* Missing Data Disclosures */}
          {selection.kind !== 'Batch' && selection.data.missingDataNotes.length > 0 && (
            <div className="space-y-1.5 border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-amber-900">
                Missing Data & Limitations
              </h3>
              <ul className="list-disc pl-4 space-y-1 text-amber-800">
                {selection.data.missingDataNotes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Preventive Actions / Inspection Recommendation */}
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <h3 className="text-sm font-semibold text-slate-900">
              Recommended Preventive Actions
            </h3>
            {selection.kind === 'Product' ? (
              <ul className="list-disc pl-4 space-y-1 text-slate-700">
                {selection.data.recommendedPreventiveActions.map((act, i) => (
                  <li key={i}>{act}</li>
                ))}
              </ul>
            ) : selection.kind === 'Process' ? (
              <ul className="list-disc pl-4 space-y-1 text-slate-700">
                {selection.data.suggestedPreventiveMeasures.map((act, i) => (
                  <li key={i}>{act}</li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-700">{selection.data.recommendedInspection}</p>
            )}
          </div>

          {/* Linked Complaint History */}
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <h3 className="text-sm font-semibold text-slate-900">
              Linked Historical & Active Complaints ({complaints.length})
            </h3>
            {complaints.length === 0 ? (
              <p className="text-slate-500">No complaints recorded for this entity.</p>
            ) : (
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-md">
                {complaints.map((c) => (
                  <div key={c.id} className="p-3 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-slate-900">{c.id}</span>
                        <span className="text-slate-400">·</span>
                        <span className="font-mono tabular-nums text-slate-500">
                          {c.complaintDate}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="font-mono text-slate-600">{c.batchNumber}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <SeverityText severity={c.severity} />
                        <StatusText status={c.status} />
                      </div>
                    </div>
                    <p className="text-slate-700">{c.description}</p>
                    {onNavigate && (
                      <div className="flex items-center gap-4 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onNavigate('complaints', c.id);
                          }}
                          className="inline-flex items-center gap-1 text-cyan-700 hover:text-cyan-900 font-medium"
                        >
                          <span>Open Complaint</span>
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onNavigate('root-cause', c.id);
                          }}
                          className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900 font-medium"
                        >
                          <span>Open Root Cause</span>
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
