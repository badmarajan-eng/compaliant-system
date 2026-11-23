import { ArrowUpRight, X } from 'lucide-react';
import type { ComplaintRecord, ModuleId } from '../types/qms';

export interface DrilldownContext {
  title: string;
  subtitle: string;
  complaints: ComplaintRecord[];
}

interface AnalyticsDrilldownDrawerProps {
  context: DrilldownContext | null;
  onClose: () => void;
  onNavigate?: (module: ModuleId, complaintId?: string) => void;
}

export function AnalyticsDrilldownDrawer({
  context,
  onClose,
  onNavigate,
}: AnalyticsDrilldownDrawerProps) {
  if (!context) return null;

  const criticalCount = context.complaints.filter((c) => c.severity === 'Critical').length;
  const openCount = context.complaints.filter((c) => c.status !== 'Closed').length;
  const verifiedRootCauses = Array.from(
    new Set(
      context.complaints
        .map((c) => c.rootCauseAnalysis?.manualVerifiedRootCause?.trim())
        .filter((v): v is string => Boolean(v))
    )
  );

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/50"
      role="dialog"
      aria-modal="true"
      aria-label={context.title}
    >
      <div className="bg-white w-full max-w-3xl h-full flex flex-col border-l border-slate-200 shadow-2xl">
        <div className="px-6 py-4 bg-[#0B1426] text-white flex items-start justify-between gap-4 border-b border-slate-800">
          <div className="min-w-0">
            <p className="text-xs text-cyan-300 font-medium">Drill-Down Complaint History</p>
            <h2 className="text-lg font-bold text-white truncate mt-0.5">{context.title}</h2>
            <p className="text-xs text-slate-300 mt-0.5">{context.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-300 hover:text-white rounded-md border border-slate-700"
            aria-label="Close drill-down panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50 divide-x divide-slate-200 text-xs">
          <div className="px-5 py-3">
            <p className="text-slate-500">Matched Complaints</p>
            <p className="text-lg font-bold text-slate-900 font-mono tabular-nums mt-0.5">
              {context.complaints.length}
            </p>
          </div>
          <div className="px-5 py-3">
            <p className="text-slate-500">Open Backlog</p>
            <p className="text-lg font-bold text-cyan-800 font-mono tabular-nums mt-0.5">
              {openCount}
            </p>
          </div>
          <div className="px-5 py-3">
            <p className="text-slate-500">Critical Severity</p>
            <p className="text-lg font-bold text-red-700 font-mono tabular-nums mt-0.5">
              {criticalCount}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {verifiedRootCauses.length > 0 && (
            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
              <h3 className="text-xs font-semibold text-slate-900 mb-2">
                Verified Root Causes Recorded (Separated from AI Suggestions)
              </h3>
              <ul className="list-disc pl-4 space-y-1 text-xs text-slate-700">
                {verifiedRootCauses.map((rc) => (
                  <li key={rc}>{rc}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-3">
            {context.complaints.map((c) => {
              const verifiedRc = c.rootCauseAnalysis?.manualVerifiedRootCause?.trim();
              const unverifiedCount =
                c.rootCauseAnalysis?.hypotheses.filter((h) => h.managerStatus !== 'Verified')
                  .length ?? 0;
              return (
                <div
                  key={c.id}
                  className="border border-slate-200 rounded-lg p-4 bg-white hover:border-cyan-300 transition-colors"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono font-bold text-slate-900">{c.id}</span>
                        <span className="text-slate-400" aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums text-slate-600">
                          {c.complaintDate}
                        </span>
                        <span className="text-slate-400" aria-hidden="true">·</span>
                        <span
                          className={`font-semibold ${
                            c.severity === 'Critical'
                              ? 'text-red-700'
                              : c.severity === 'High'
                                ? 'text-amber-700'
                                : 'text-slate-700'
                          }`}
                        >
                          {c.severity}
                        </span>
                        <span className="text-slate-400" aria-hidden="true">·</span>
                        <span className="text-cyan-800 font-medium">{c.category}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Customer: <span className="text-slate-800 font-medium">{c.customerName}</span>
                        {' · '}Batch:{' '}
                        <span className="font-mono text-slate-800">{c.batchNumber}</span>
                        {' · '}Process: <span className="text-slate-800">{c.processName}</span>
                      </p>
                    </div>

                    {onNavigate && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onNavigate('complaints', c.id);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50"
                        >
                          <span>Complaint</span>
                          <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onNavigate('root-cause', c.id);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-cyan-800 bg-cyan-50 border border-cyan-200 rounded hover:bg-cyan-100"
                        >
                          <span>RCA</span>
                          <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-slate-700 mt-2 leading-relaxed">{c.description}</p>

                  <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                    <span>
                      Status: <strong className="text-slate-900">{c.status}</strong>
                    </span>
                    <span>
                      {verifiedRc ? (
                        <>
                          Verified RCA: <strong className="text-emerald-800">{verifiedRc}</strong>
                        </>
                      ) : unverifiedCount > 0 ? (
                        <span className="text-slate-500">
                          {unverifiedCount} unverified AI hypothesis lead(s)
                        </span>
                      ) : (
                        <span className="text-slate-400">No RCA recorded</span>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
