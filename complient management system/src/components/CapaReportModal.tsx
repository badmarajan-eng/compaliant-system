import { Download, Printer, X } from 'lucide-react';
import type { CAPARecord } from '../types/qms';
import {
  exportCapaSummaryCsv,
  exportSingleCapaCsv,
  resolveEffectiveCapaStatus,
} from '../utils/capaUtils';

interface CapaReportModalProps {
  isOpen: boolean;
  mode: 'single' | 'summary';
  capa: CAPARecord | null;
  allCapas: CAPARecord[];
  onChangeMode: (mode: 'single' | 'summary') => void;
  onClose: () => void;
}

export function CapaReportModal({
  isOpen,
  mode,
  capa,
  allCapas,
  onChangeMode,
  onClose,
}: CapaReportModalProps) {
  if (!isOpen) return null;

  const effectiveSingleStatus = capa ? resolveEffectiveCapaStatus(capa) : 'New';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 overflow-y-auto print:static print:bg-white print:p-0"
      role="dialog"
      aria-modal="true"
      aria-labelledby="capa-report-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-lg max-w-5xl w-full shadow-2xl my-6 overflow-hidden print:shadow-none print:border-none">
        {/* Header Bar */}
        <div className="bg-[#0B1426] px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-white print:bg-white print:text-slate-900 print:border-b print:border-slate-300">
          <div>
            <p className="text-[11px] font-mono text-cyan-400 print:text-slate-600">
              Q-INTELLIGENCE (PS-036) · CAPA AUDIT &amp; COMPLIANCE REPORT
            </p>
            <h2 id="capa-report-modal-title" className="text-base font-semibold">
              {mode === 'single' && capa
                ? `Individual CAPA Report — ${capa.id}`
                : `CAPA Register Summary Report (${allCapas.length} Records)`}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {capa && (
              <div className="flex items-center p-0.5 bg-slate-800 rounded text-xs">
                <button
                  type="button"
                  onClick={() => onChangeMode('single')}
                  className={`px-2.5 py-1 rounded ${
                    mode === 'single' ? 'bg-cyan-700 text-white' : 'text-slate-300'
                  }`}
                >
                  Individual Report
                </button>
                <button
                  type="button"
                  onClick={() => onChangeMode('summary')}
                  className={`px-2.5 py-1 rounded ${
                    mode === 'summary' ? 'bg-cyan-700 text-white' : 'text-slate-300'
                  }`}
                >
                  Summary Report
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                if (mode === 'single' && capa) exportSingleCapaCsv(capa);
                else exportCapaSummaryCsv(allCapas);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-cyan-700 hover:bg-cyan-600 rounded"
            >
              <Printer className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Print / Save PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-300 hover:text-white rounded"
              aria-label="Close report modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Report Body */}
        <div className="p-6 max-h-[78vh] overflow-y-auto space-y-6 text-xs print:max-h-none print:overflow-visible">
          {mode === 'single' && capa ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-md p-4">
                <div>
                  <p className="text-slate-500">CAPA ID</p>
                  <p className="font-mono font-semibold text-slate-900 mt-0.5">
                    {capa.id} {capa.isDemoData ? '(DEMO DATA)' : ''}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Related Complaint</p>
                  <p className="font-mono font-semibold text-cyan-800 mt-0.5">{capa.complaintId}</p>
                </div>
                <div>
                  <p className="text-slate-500">Workflow Status</p>
                  <p className="font-semibold text-slate-900 mt-0.5">
                    {effectiveSingleStatus} ({capa.progressPercent}%)
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Priority &amp; Target Date</p>
                  <p className="font-mono text-slate-900 mt-0.5">
                    {capa.priority} · {capa.targetCompletionDate}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Customer</p>
                  <p className="font-medium text-slate-900 mt-0.5">{capa.customerName}</p>
                </div>
                <div>
                  <p className="text-slate-500">Product &amp; Batch</p>
                  <p className="font-medium text-slate-900 mt-0.5">
                    {capa.productId} · {capa.productName} ({capa.batchNumber})
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Process &amp; Machine</p>
                  <p className="text-slate-900 mt-0.5">
                    {capa.manufacturingProcess} · {capa.machineId}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Owner &amp; Department</p>
                  <p className="text-slate-900 mt-0.5">
                    {capa.owner} · {capa.responsibleDepartment}
                  </p>
                </div>
              </div>

              <div className="border border-slate-200 rounded-md p-4 space-y-2">
                <p className="font-semibold text-slate-900">
                  Root Cause ({capa.rootCauseVerificationStatus})
                </p>
                <p className="text-slate-800">{capa.rootCause}</p>
                <p className="text-slate-600">
                  <strong>Supporting Evidence:</strong> {capa.evidence}
                </p>
                <p className="text-slate-600">
                  <strong>CAPA Scope:</strong> {capa.description}
                </p>
              </div>

              {/* 3 Action Sections */}
              {(
                [
                  { label: 'A. Correction / Containment Actions', items: capa.containmentActions },
                  { label: 'B. Corrective Actions', items: capa.correctiveActions },
                  { label: 'C. Preventive Actions', items: capa.preventiveActions },
                ] as const
              ).map((sec) => (
                <div key={sec.label} className="space-y-2">
                  <h3 className="font-semibold text-slate-900 text-sm">
                    {sec.label} ({sec.items.length})
                  </h3>
                  {sec.items.length === 0 ? (
                    <p className="text-slate-500 border border-slate-200 rounded p-3">
                      No actions recorded in this tier.
                    </p>
                  ) : (
                    <table className="w-full text-left border-collapse border border-slate-200">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                          <th className="p-2 font-medium">Title &amp; Description</th>
                          <th className="p-2 font-medium">Owner / Dept</th>
                          <th className="p-2 font-medium">Target / Status</th>
                          <th className="p-2 font-medium">Evidence</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {sec.items.map((t) => (
                          <tr key={t.id}>
                            <td className="p-2">
                              <p className="font-semibold text-slate-900">{t.title}</p>
                              <p className="text-slate-600 mt-0.5">{t.description}</p>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                {t.origin} · Approval: {t.approvalStatus}
                                {t.isProvisional ? ' · Provisional (Unverified RC)' : ''}
                              </p>
                            </td>
                            <td className="p-2 text-slate-700">
                              <p>{t.responsiblePerson}</p>
                              <p className="text-[11px] text-slate-500">{t.responsibleDepartment}</p>
                            </td>
                            <td className="p-2 font-mono tabular-nums text-slate-700">
                              <p>{t.targetDate}</p>
                              <p className="text-[11px]">
                                {t.status} ({t.progressPercent}%)
                              </p>
                            </td>
                            <td className="p-2 text-slate-700">
                              {t.implementationEvidence || t.supportingEvidence || 'Pending'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}

              {/* Effectiveness Decision */}
              <div className="border border-slate-200 rounded-md p-4 space-y-2 bg-slate-50">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900 text-sm">
                    Effectiveness Verification Decision
                  </h3>
                  <span className="font-semibold text-slate-900">
                    {capa.effectiveness.decision}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <p className="text-slate-500">Baseline Complaints</p>
                    <p className="font-mono font-semibold text-slate-900">
                      {capa.effectiveness.complaintsBefore} ({capa.effectiveness.baselinePeriod})
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Post-CAPA Complaints</p>
                    <p className="font-mono font-semibold text-slate-900">
                      {capa.effectiveness.complaintsAfter ?? 'Pending'} ({capa.effectiveness.postPeriod})
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Defect Rate (per 1k)</p>
                    <p className="font-mono text-slate-900">
                      {capa.effectiveness.defectRateBefore !== null &&
                      capa.effectiveness.defectRateAfter !== null
                        ? `${capa.effectiveness.defectRateBefore} → ${capa.effectiveness.defectRateAfter}`
                        : 'Counts Only (Provisional)'}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Reviewer &amp; Date</p>
                    <p className="text-slate-900">
                      {capa.effectiveness.reviewer || 'Pending'}{' '}
                      {capa.effectiveness.verifiedDate ? `· ${capa.effectiveness.verifiedDate}` : ''}
                    </p>
                  </div>
                </div>
                <p className="text-slate-700">
                  <strong>Method &amp; Evidence:</strong> {capa.effectiveness.verificationMethod}
                  {capa.effectiveness.verificationEvidence
                    ? ` — ${capa.effectiveness.verificationEvidence}`
                    : ''}
                </p>
                {capa.effectiveness.comments && (
                  <p className="text-slate-700">
                    <strong>Manager Comments:</strong> {capa.effectiveness.comments}
                  </p>
                )}
              </div>

              {/* Status History */}
              <div className="space-y-2">
                <h3 className="font-semibold text-slate-900 text-sm">
                  Audit &amp; Status History ({capa.history.length})
                </h3>
                <div className="border border-slate-200 rounded-md divide-y divide-slate-100">
                  {capa.history.map((h) => (
                    <div key={h.id} className="p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <div>
                        <span className="font-semibold text-slate-900">{h.action}</span>
                        {h.toStatus && (
                          <span className="text-cyan-800 ml-2">[{h.toStatus}]</span>
                        )}
                        {h.notes && <p className="text-slate-600 mt-0.5">{h.notes}</p>}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 shrink-0">
                        {h.actor} · {new Date(h.timestamp).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse border border-slate-200">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <th className="p-2 font-medium">CAPA ID</th>
                    <th className="p-2 font-medium">Complaint</th>
                    <th className="p-2 font-medium">Product &amp; Batch</th>
                    <th className="p-2 font-medium">Department &amp; Owner</th>
                    <th className="p-2 font-medium">Target Date</th>
                    <th className="p-2 font-medium">Status</th>
                    <th className="p-2 font-medium text-right">Progress</th>
                    <th className="p-2 font-medium">Effectiveness</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {allCapas.map((c) => {
                    const effStatus = resolveEffectiveCapaStatus(c);
                    return (
                      <tr key={c.id}>
                        <td className="p-2 font-mono font-semibold text-cyan-800 whitespace-nowrap">
                          {c.id}
                          {c.isDemoData && (
                            <span className="block text-[10px] text-slate-400">DEMO DATA</span>
                          )}
                        </td>
                        <td className="p-2 font-mono text-slate-700 whitespace-nowrap">
                          {c.complaintId}
                        </td>
                        <td className="p-2">
                          <p className="font-medium text-slate-900">{c.productName}</p>
                          <p className="text-[11px] text-slate-500">
                            {c.batchNumber} · {c.defectCategory}
                          </p>
                        </td>
                        <td className="p-2 text-slate-700">
                          <p>{c.responsibleDepartment}</p>
                          <p className="text-[11px] text-slate-500">{c.owner}</p>
                        </td>
                        <td className="p-2 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          {c.targetCompletionDate}
                        </td>
                        <td className="p-2 font-semibold text-slate-900 whitespace-nowrap">
                          {effStatus}
                        </td>
                        <td className="p-2 text-right font-mono tabular-nums">
                          {c.progressPercent}%
                        </td>
                        <td className="p-2 text-slate-800 whitespace-nowrap">
                          {c.effectiveness.decision}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
