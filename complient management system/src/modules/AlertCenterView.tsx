import { useMemo, useState } from 'react';
import { ArrowRight, Bell, CheckCircle2, ShieldAlert } from 'lucide-react';
import { RiskTierText } from '../components/StatusText';
import type {
  ModuleId,
  PredictiveAlert,
  PredictiveAlertStatus,
  PredictiveAlertType,
} from '../types/qms';

interface AlertCenterViewProps {
  alerts: PredictiveAlert[];
  onUpdateAlert: (
    alertId: string,
    patch: Partial<Pick<PredictiveAlert, 'status' | 'assignedTo' | 'investigationNotes'>>
  ) => void;
  onNavigate: (module: ModuleId, complaintId?: string) => void;
}

export function AlertCenterView({
  alerts,
  onUpdateAlert,
  onNavigate,
}: AlertCenterViewProps) {
  const [statusFilter, setStatusFilter] = useState<'ALL' | PredictiveAlertStatus>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | PredictiveAlertType>('ALL');

  const kpis = useMemo(() => {
    const total = alerts.length;
    const newCount = alerts.filter((a) => a.status === 'New').length;
    const activeCount = alerts.filter(
      (a) => a.status === 'Acknowledged' || a.status === 'Under Investigation'
    ).length;
    const resolvedCount = alerts.filter((a) => a.status === 'Resolved').length;
    const highRiskCount = alerts.filter(
      (a) => a.riskLevel === 'HIGH' && a.status !== 'Resolved'
    ).length;
    const capaMonitoringAlerts = alerts.filter(
      (a) =>
        (a.alertType === 'Post-CAPA Recurrence' ||
          a.alertType === 'Verification Period Completed' ||
          a.alertType === 'Ineffective CAPA' ||
          a.alertType === 'Overdue Critical CAPA') &&
        a.status !== 'Resolved'
    ).length;
    return {
      total,
      newCount,
      activeCount,
      resolvedCount,
      highRiskCount,
      capaMonitoringAlerts,
    };
  }, [alerts]);

  const availableTypes = useMemo(
    () => Array.from(new Set(alerts.map((a) => a.alertType))).sort(),
    [alerts]
  );

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
      if (typeFilter !== 'ALL' && a.alertType !== typeFilter) return false;
      return true;
    });
  }, [alerts, statusFilter, typeFilter]);

  const getTargetModule = (alert: PredictiveAlert): ModuleId => {
    if (
      alert.alertType === 'Post-CAPA Recurrence' ||
      alert.alertType === 'Verification Period Completed'
    ) {
      return 'effectiveness';
    }
    if (alert.alertType === 'Ineffective CAPA' || alert.alertType === 'Overdue Critical CAPA') {
      return 'capa';
    }
    if (alert.alertType === 'Unresolved Critical Complaint') {
      return 'complaints';
    }
    return 'risk-prediction';
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-[#0B1426] text-slate-100 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <Bell className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-xs leading-relaxed">
            <p className="font-semibold text-white">
              Enterprise Quality Alert &amp; Notification Center
            </p>
            <p className="text-slate-300 mt-0.5">
              Unified, deduplicated monitoring across Predictive Risk Intelligence, CAPA Management, and Effectiveness Monitoring — covering post-CAPA recurrences, overdue critical CAPAs, verification due periods, and high-risk products/processes.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('effectiveness')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-cyan-700 hover:bg-cyan-600 rounded-md whitespace-nowrap self-start sm:self-center"
        >
          <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Effectiveness Monitoring</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Total Tracked Alerts</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {kpis.total}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">New Unreviewed</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-red-700 mt-1">
            {kpis.newCount}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Under Investigation</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-amber-700 mt-1">
            {kpis.activeCount}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Resolved</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
            {kpis.resolvedCount}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Active High-Risk</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-red-700 mt-1">
            {kpis.highRiskCount}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">CAPA &amp; Recurrence Alerts</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-cyan-800 mt-1">
            {kpis.capaMonitoringAlerts}
          </p>
        </div>
      </div>

      {/* Filters & Alert List */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-slate-200">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md self-start">
            {(['ALL', 'New', 'Acknowledged', 'Under Investigation', 'Resolved'] as const).map(
              (st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap transition-colors ${
                    statusFilter === st
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st}
                </button>
              )
            )}
          </div>

          <div className="flex items-center gap-2 text-xs">
            <label htmlFor="alert-type-filter" className="text-slate-500 font-medium">
              Alert Category:
            </label>
            <select
              id="alert-type-filter"
              value={typeFilter}
              onChange={(e) =>
                setTypeFilter(e.target.value as 'ALL' | PredictiveAlertType)
              }
              className="px-2.5 py-1.5 border border-slate-300 rounded-md bg-white text-slate-900"
            >
              <option value="ALL">All Alert Types ({alerts.length})</option>
              {availableTypes.map((tp) => (
                <option key={tp} value={tp}>
                  {tp}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto" aria-hidden="true" />
            <p className="text-sm font-medium text-slate-800">No Alerts Match Current Filters</p>
            <p className="text-xs text-slate-500">
              Adjust workflow status or alert category filters to inspect resolved or active items.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filtered.map((alert) => {
              const targetModule = getTargetModule(alert);
              return (
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
                        <strong className="text-slate-800">Recommended Action:</strong>{' '}
                        {alert.recommendedAction}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onNavigate(targetModule)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-cyan-800 bg-cyan-50 border border-cyan-200 rounded-md hover:bg-cyan-100 whitespace-nowrap"
                      >
                        <span>Open Module</span>
                        <ArrowRight className="w-3 h-3" aria-hidden="true" />
                      </button>

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
                        placeholder="Record verification check, CAPA escalation, or containment notes..."
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
