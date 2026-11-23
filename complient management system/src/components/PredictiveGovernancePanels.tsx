import { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { RiskTierText } from './StatusText';
import type {
  PredictiveAlert,
  PredictiveAlertStatus,
  PreventiveActionPlan,
  PreventivePlanStatus,
  ProcessRiskAssessment,
  ProductRiskAssessment,
  RiskScoringWeights,
} from '../types/qms';
import { normalizeWeights } from '../utils/predictiveEngine';

interface PredictiveGovernancePanelsProps {
  mode: 'scoring' | 'alerts' | 'preventive';
  weights: RiskScoringWeights;
  onChangeWeights: (next: RiskScoringWeights) => void;
  onResetWeights: () => void;
  productRisks: ProductRiskAssessment[];
  processRisks: ProcessRiskAssessment[];
  alerts: PredictiveAlert[];
  onUpdateAlert: (
    alertId: string,
    patch: Partial<Pick<PredictiveAlert, 'status' | 'assignedTo' | 'investigationNotes'>>
  ) => void;
  preventivePlans: PreventiveActionPlan[];
  onUpdatePreventivePlan: (
    planId: string,
    patch: Partial<
      Pick<
        PreventiveActionPlan,
        'status' | 'responsiblePerson' | 'targetDate' | 'verificationResults'
      >
    >
  ) => void;
}

const WEIGHT_FIELDS: Array<{ key: keyof RiskScoringWeights; label: string; description: string }> = [
  {
    key: 'historicalFrequency',
    label: 'Historical Complaint Frequency',
    description: 'Volume relative to the highest-complaint entity in cohort',
  },
  {
    key: 'complaintSeverity',
    label: 'Complaint Severity',
    description: 'Weighted severity distribution across Low/Medium/High/Critical',
  },
  {
    key: 'recentTrend',
    label: 'Recent Complaint Trend (90d)',
    description: 'Velocity shift between recent 90 days and prior 90 days',
  },
  {
    key: 'recurrenceRate',
    label: 'Recurrence Rate',
    description: 'Repeat complaint category ratio and recurring cluster count',
  },
  {
    key: 'unresolvedCritical',
    label: 'Unresolved Critical Backlog',
    description: 'Open Critical and non-closed complaint backlog exposure',
  },
  {
    key: 'capaEffectiveness',
    label: 'CAPA Effectiveness',
    description: 'Evaluated CAPA outcome (missing CAPAs use conservative baseline, not 0)',
  },
];

export function PredictiveGovernancePanels({
  mode,
  weights,
  onChangeWeights,
  onResetWeights,
  productRisks,
  processRisks,
  alerts,
  onUpdateAlert,
  preventivePlans,
  onUpdatePreventivePlan,
}: PredictiveGovernancePanelsProps) {
  const [inspectScope, setInspectScope] = useState<'Product' | 'Process'>('Product');
  const [inspectName, setInspectName] = useState<string>('');
  const [alertFilter, setAlertFilter] = useState<'ALL' | PredictiveAlertStatus>('ALL');
  const [planFilter, setPlanFilter] = useState<'ALL' | 'HIGH_ONLY' | PreventivePlanStatus>('ALL');

  const normWeights = useMemo(() => normalizeWeights(weights), [weights]);
  const rawSum =
    weights.historicalFrequency +
    weights.complaintSeverity +
    weights.recentTrend +
    weights.recurrenceRate +
    weights.unresolvedCritical +
    weights.capaEffectiveness;

  const inspectableItems = useMemo(() => {
    if (inspectScope === 'Product') {
      return productRisks.map((p) => ({
        name: p.productName,
        score: p.riskScore,
        level: p.riskLevel,
        completeness: p.dataCompletenessPercent,
        missingNotes: p.missingDataNotes,
        factors: p.factorBreakdown,
      }));
    }
    return processRisks
      .filter((pr) => pr.riskScore !== null)
      .map((pr) => ({
        name: pr.processName,
        score: pr.riskScore as number,
        level: pr.riskLevel,
        completeness: pr.dataCompletenessPercent,
        missingNotes: pr.missingDataNotes,
        factors: pr.factorBreakdown,
      }));
  }, [inspectScope, productRisks, processRisks]);

  const activeInspect =
    inspectableItems.find((i) => i.name === inspectName) ?? inspectableItems[0] ?? null;

  const filteredAlerts = useMemo(() => {
    if (alertFilter === 'ALL') return alerts;
    return alerts.filter((a) => a.status === alertFilter);
  }, [alerts, alertFilter]);

  const filteredPlans = useMemo(() => {
    if (planFilter === 'ALL') return preventivePlans;
    if (planFilter === 'HIGH_ONLY') return preventivePlans.filter((p) => p.riskLevel === 'HIGH');
    return preventivePlans.filter((p) => p.status === planFilter);
  }, [preventivePlans, planFilter]);

  if (mode === 'scoring') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Configurable Weights Panel */}
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Configurable Risk Scoring Weights
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Adjust factor weights to prioritize quality risk dimensions. Raw sum ({rawSum}%) auto-normalizes to 100 pts.
              </p>
            </div>
            <button
              type="button"
              onClick={onResetWeights}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Reset Defaults</span>
            </button>
          </div>

          <div className="space-y-4">
            {WEIGHT_FIELDS.map(({ key, label, description }) => (
              <div key={key} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <label htmlFor={`weight-${key}`} className="font-medium text-slate-800">
                    {label}
                  </label>
                  <div className="flex items-center gap-2 font-mono tabular-nums">
                    <span className="text-slate-500">Raw: {weights[key]}%</span>
                    <span className="text-cyan-800 font-semibold">
                      Effective: {normWeights[key]}%
                    </span>
                  </div>
                </div>
                <input
                  id={`weight-${key}`}
                  type="range"
                  min={0}
                  max={50}
                  step={5}
                  value={weights[key]}
                  onChange={(e) =>
                    onChangeWeights({
                      ...weights,
                      [key]: Number(e.target.value),
                    })
                  }
                  className="w-full accent-cyan-700 cursor-pointer"
                />
                <p className="text-[11px] text-slate-500">{description}</p>
              </div>
            ))}
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-xs text-slate-600 space-y-1">
            <p className="font-semibold text-slate-800">Transparent Missing-Data Governance</p>
            <p>
              Risk scores (LOW 0–39, MEDIUM 40–69, HIGH 70–100) are empirical prioritization indices—never calibrated probabilities of future failure. Missing CAPA verification or single-period histories receive conservative non-zero baselines and are flagged explicitly.
            </p>
          </div>
        </section>

        {/* Factor Contribution Breakdown Inspector */}
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Factor Contribution Breakdown
              </h2>
              <p className="text-xs text-slate-500">
                Inspect exact weighted score math for any product or process
              </p>
            </div>
            <div className="inline-flex p-1 bg-slate-100 rounded-md self-start">
              {(['Product', 'Process'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setInspectScope(s);
                    setInspectName('');
                  }}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    inspectScope === s
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <select
            value={activeInspect?.name ?? ''}
            onChange={(e) => setInspectName(e.target.value)}
            aria-label="Select entity for factor breakdown"
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white text-slate-900"
          >
            {inspectableItems.map((it) => (
              <option key={it.name} value={it.name}>
                {it.name} — {it.score}/100 ({it.level})
              </option>
            ))}
          </select>

          {activeInspect && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs bg-slate-50 border border-slate-200 rounded-md px-3 py-2.5">
                <span className="font-medium text-slate-700">
                  Data Completeness: <strong className="font-mono tabular-nums">{activeInspect.completeness}%</strong>
                </span>
                <RiskTierText
                  tier={activeInspect.level === 'INSUFFICIENT DATA' ? 'LOW' : activeInspect.level}
                  score={activeInspect.score}
                />
              </div>

              <div className="space-y-3">
                {activeInspect.factors.map((f) => (
                  <div key={f.key} className="text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-900">
                        {f.label} ({f.weightPercent}% max)
                      </span>
                      <span className="font-mono tabular-nums font-semibold text-slate-900">
                        {f.contributionPoints} / {f.weightPercent} pts
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
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
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 mt-0.5">
                      <span>{f.rawSummary}</span>
                      <span
                        className={
                          f.dataStatus === 'Data Missing (Neutral Baseline)'
                            ? 'text-amber-700 font-medium'
                            : ''
                        }
                      >
                        {f.dataStatus}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {activeInspect.missingNotes.length > 0 && (
                <div className="pt-3 border-t border-slate-200 space-y-1">
                  <p className="text-xs font-semibold text-amber-800">Missing Data Disclosures</p>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-slate-600">
                    {activeInspect.missingNotes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    );
  }

  if (mode === 'alerts') {
    return (
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Predictive Quality Alert Center ({filteredAlerts.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Deduplicated alerts triggered by high-risk products, process trends, multi-batch defect clusters, chronic patterns, open criticals, and ineffective CAPAs
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md self-start">
            {(['ALL', 'New', 'Acknowledged', 'Under Investigation', 'Resolved'] as const).map(
              (st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setAlertFilter(st)}
                  className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap transition-colors ${
                    alertFilter === st
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st}
                </button>
              )
            )}
          </div>
        </div>

        {filteredAlerts.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">
            No predictive alerts match the selected workflow status.
          </p>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredAlerts.map((alert) => (
              <div key={alert.id} className="py-4 space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono font-semibold text-slate-900">{alert.id}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-medium text-cyan-800">{alert.alertType}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">Detected {alert.detectionDate}</span>
                      <span aria-hidden="true">·</span>
                      <RiskTierText tier={alert.riskLevel} />
                    </div>
                    <p className="text-sm font-semibold text-slate-900">{alert.targetEntity}</p>
                    <p className="text-xs text-slate-700">{alert.reason}</p>
                    <p className="text-xs text-slate-600">
                      <strong className="text-slate-800">Recommended Action:</strong> {alert.recommendedAction}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <select
                      value={alert.status}
                      aria-label={`Alert status for ${alert.id}`}
                      onChange={(e) =>
                        onUpdateAlert(alert.id, {
                          status: e.target.value as PredictiveAlertStatus,
                        })
                      }
                      className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-900"
                    >
                      <option value="New">New</option>
                      <option value="Acknowledged">Acknowledged</option>
                      <option value="Under Investigation">Under Investigation</option>
                      <option value="Resolved">Resolved</option>
                    </select>
                    {alert.status === 'New' && (
                      <button
                        type="button"
                        onClick={() => onUpdateAlert(alert.id, { status: 'Acknowledged' })}
                        className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
                      >
                        Acknowledge
                      </button>
                    )}
                    {alert.status !== 'Resolved' && (
                      <button
                        type="button"
                        onClick={() => onUpdateAlert(alert.id, { status: 'Resolved' })}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-cyan-700 hover:bg-cyan-800 rounded-md"
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-1">
                  <div className="md:col-span-4">
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Assigned Owner
                    </label>
                    <input
                      type="text"
                      value={alert.assignedTo}
                      onChange={(e) => onUpdateAlert(alert.id, { assignedTo: e.target.value })}
                      placeholder="Assign owner"
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
                    />
                  </div>
                  <div className="md:col-span-8">
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Manager Investigation Notes
                    </label>
                    <input
                      type="text"
                      value={alert.investigationNotes}
                      onChange={(e) =>
                        onUpdateAlert(alert.id, { investigationNotes: e.target.value })
                      }
                      placeholder="Record containment checks, inspection results, or escalation notes..."
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  }

  // mode === 'preventive'
  return (
    <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Preventive Action Recommendations & Tracking ({filteredPlans.length})
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Targeted preventive actions for HIGH and MEDIUM risk products and manufacturing processes — accept, assign ownership, set target dates, and verify closure
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md self-start">
          {(
            [
              { id: 'ALL', label: 'All' },
              { id: 'HIGH_ONLY', label: 'High Risk Only' },
              { id: 'Recommended', label: 'Pending Review' },
              { id: 'Accepted', label: 'Accepted' },
              { id: 'In Progress', label: 'In Progress' },
              { id: 'Verified Effective', label: 'Verified' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setPlanFilter(f.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap transition-colors ${
                planFilter === f.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filteredPlans.length === 0 ? (
        <p className="text-xs text-slate-500 py-6 text-center">
          No preventive action recommendations match this filter.
        </p>
      ) : (
        <div className="divide-y divide-slate-200">
          {filteredPlans.map((plan) => (
            <div key={plan.id} className="py-4 space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono text-slate-700">{plan.targetKind}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-slate-900">{plan.targetEntity}</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-cyan-800 font-medium">{plan.actionCategory}</span>
                    <span aria-hidden="true">·</span>
                    <RiskTierText tier={plan.riskLevel} />
                  </div>
                  <p className="text-sm font-medium text-slate-900">{plan.title}</p>
                  <p className="text-xs text-slate-500">{plan.rationale}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {plan.status === 'Recommended' && (
                    <>
                      <button
                        type="button"
                        onClick={() => onUpdatePreventivePlan(plan.id, { status: 'Accepted' })}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-cyan-700 hover:bg-cyan-800 rounded-md"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdatePreventivePlan(plan.id, { status: 'Rejected' })}
                        className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  <select
                    value={plan.status}
                    aria-label={`Plan status for ${plan.id}`}
                    onChange={(e) =>
                      onUpdatePreventivePlan(plan.id, {
                        status: e.target.value as PreventivePlanStatus,
                      })
                    }
                    className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-900"
                  >
                    <option value="Recommended">Recommended</option>
                    <option value="Accepted">Accepted</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Implemented">Implemented</option>
                    <option value="Verified Effective">Verified Effective</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-3">
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Responsible Person
                  </label>
                  <input
                    type="text"
                    value={plan.responsiblePerson}
                    onChange={(e) =>
                      onUpdatePreventivePlan(plan.id, { responsiblePerson: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Target Date
                  </label>
                  <input
                    type="date"
                    value={plan.targetDate}
                    onChange={(e) =>
                      onUpdatePreventivePlan(plan.id, { targetDate: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md font-mono"
                  />
                </div>
                <div className="md:col-span-6">
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Verification Results
                  </label>
                  <input
                    type="text"
                    value={plan.verificationResults}
                    onChange={(e) =>
                      onUpdatePreventivePlan(plan.id, { verificationResults: e.target.value })
                    }
                    placeholder="Record calibration check, AQL audit, or gauge R&R verification outcome..."
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
