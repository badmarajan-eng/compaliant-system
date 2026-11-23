import { Printer, X } from 'lucide-react';
import { FishboneDiagram } from './FishboneDiagram';
import type { ComplaintRecord } from '../types/qms';
import type { HistoricalComplaintMatch } from '../utils/rcaUtils';
import { infer6MCategory } from '../utils/rcaUtils';

interface RcaPrintableReportProps {
  complaint: ComplaintRecord;
  historicalMatches: HistoricalComplaintMatch[];
  onClose: () => void;
}

export function RcaPrintableReport({
  complaint,
  historicalMatches,
  onClose,
}: RcaPrintableReportProps) {
  const rca = complaint.rootCauseAnalysis;
  const verifiedHypothesis = rca?.hypotheses.find(
    (h) => h.managerStatus === 'Verified'
  );
  const officialRootCause =
    rca?.manualVerifiedRootCause?.trim() ||
    verifiedHypothesis?.title ||
    'Not yet manager-verified';

  const recommendedActions = [
    ...complaint.capaActions.map((a) => `${a.kind}: ${a.title} (${a.completionStatus})`),
    ...(rca?.hypotheses
      .filter((h) => h.suggestedCorrectiveAction && h.managerStatus !== 'Rejected')
      .map((h) => `Suggested (${infer6MCategory(h)}): ${h.suggestedCorrectiveAction}`) ??
      []),
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 overflow-y-auto p-4 sm:p-8 print:static print:bg-white print:p-0"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-w-5xl mx-auto bg-white border border-slate-200 rounded-lg shadow-2xl print:border-0 print:shadow-none">
        {/* Toolbar (hidden on print) */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 print:hidden">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Root Cause Analysis Report — {complaint.id}
            </h2>
            <p className="text-xs text-slate-500">
              Audit-ready quality investigation report formatted for printing or PDF export.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-cyan-700 rounded-md hover:bg-cyan-800"
            >
              <Printer className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Print / Save PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Close</span>
            </button>
          </div>
        </div>

        {/* Printable Document Body */}
        <div className="p-6 sm:p-8 space-y-6 text-xs text-slate-800">
          {/* Header */}
          <div className="border-b-2 border-[#0B1426] pb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <p className="font-mono text-[11px] font-semibold text-cyan-800">
                Q-INTELLIGENCE (PS-036) · ISO 9001 ROOT CAUSE ANALYSIS REPORT
              </p>
              <h1 className="text-xl font-bold text-slate-900 mt-1">
                {complaint.id} — {complaint.productName}
              </h1>
            </div>
            <div className="text-left sm:text-right font-mono tabular-nums text-[11px] text-slate-600">
              <p>Generated: {new Date().toLocaleDateString()}</p>
              <p>Status: {complaint.status}</p>
            </div>
          </div>

          {/* 1. Complaint Summary */}
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-1">
              1. Complaint &amp; Manufacturing Summary
            </h3>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <div>
                <dt className="text-slate-500">Customer</dt>
                <dd className="font-semibold text-slate-900">{complaint.customerName}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Product / Batch</dt>
                <dd className="font-mono">
                  {complaint.productId} · {complaint.batchNumber}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Process / Machine</dt>
                <dd>
                  {complaint.processName} ({complaint.machineId || 'N/A'})
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Category / Severity</dt>
                <dd className="font-semibold">
                  {complaint.category} · {complaint.severity}
                </dd>
              </div>
            </dl>
            <p className="pt-1 leading-relaxed">
              <strong>Description:</strong> {complaint.description}
            </p>
            <p className="font-mono bg-slate-50 border border-slate-200 rounded p-2">
              <strong>Process Parameters:</strong> {complaint.processParameters} |{' '}
              <strong>Test Results:</strong> {complaint.testResults}
            </p>
          </section>

          {/* 2. Verified Root Cause & Manager Notes */}
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-1">
              2. Verified Root Cause &amp; Manager Investigation Notes
            </h3>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-1.5">
              <p>
                <strong>Official Verified Root Cause:</strong> {officialRootCause}
              </p>
              {rca?.verifiedCategory6M && (
                <p>
                  <strong>6M Category:</strong> {rca.verifiedCategory6M}
                </p>
              )}
              {(rca?.verifiedBy || rca?.verifiedDate) && (
                <p>
                  <strong>Verified By:</strong> {rca.verifiedBy || 'Quality Manager'} ·{' '}
                  <span className="font-mono">{rca.verifiedDate || '—'}</span>
                </p>
              )}
              <p>
                <strong>Supporting Evidence:</strong>{' '}
                {rca?.verifiedEvidence ||
                  verifiedHypothesis?.supportingEvidence ||
                  'Physical verification evidence pending.'}
              </p>
              {rca?.managerInvestigationNotes && (
                <p>
                  <strong>Manager Investigation Notes:</strong>{' '}
                  {rca.managerInvestigationNotes}
                </p>
              )}
            </div>
          </section>

          {/* 3. Fishbone Diagram */}
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-1">
              3. 6M Ishikawa Fishbone Diagram
            </h3>
            <FishboneDiagram
              problemStatement={complaint.description}
              complaintId={complaint.id}
              processName={complaint.processName}
              hypotheses={rca?.hypotheses ?? []}
              readOnly
            />
          </section>

          {/* 4. Possible Root Causes & Supporting Evidence */}
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-1">
              4. Possible Root Causes &amp; Supporting Evidence
            </h3>
            {!rca || rca.hypotheses.length === 0 ? (
              <p className="text-slate-500">No root cause hypotheses recorded yet.</p>
            ) : (
              <table className="w-full border-collapse border border-slate-200 text-left">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="p-2 border border-slate-200">6M</th>
                    <th className="p-2 border border-slate-200">Cause &amp; Origin</th>
                    <th className="p-2 border border-slate-200">Supporting Evidence</th>
                    <th className="p-2 border border-slate-200">Verification Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rca.hypotheses.map((h) => (
                    <tr key={h.id}>
                      <td className="p-2 border border-slate-200 font-semibold">
                        {infer6MCategory(h)}
                      </td>
                      <td className="p-2 border border-slate-200">
                        <p className="font-semibold text-slate-900">{h.title}</p>
                        <p className="text-[11px] text-slate-500">
                          {h.origin || 'AI Hypothesis'}
                        </p>
                      </td>
                      <td className="p-2 border border-slate-200">{h.supportingEvidence}</td>
                      <td className="p-2 border border-slate-200 font-medium">
                        {h.managerStatus}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* 5. 5 Whys Investigation */}
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-1">
              5. 5 Whys Causal Investigation
            </h3>
            {!rca?.fiveWhys || rca.fiveWhys.length === 0 ? (
              <p className="text-slate-500">No 5 Whys investigation recorded yet.</p>
            ) : (
              <table className="w-full border-collapse border border-slate-200 text-left">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="p-2 border border-slate-200 w-16">Level</th>
                    <th className="p-2 border border-slate-200">Question &amp; Answer</th>
                    <th className="p-2 border border-slate-200">Evidence Note</th>
                    <th className="p-2 border border-slate-200 w-28">Validation</th>
                  </tr>
                </thead>
                <tbody>
                  {rca.fiveWhys.map((w) => (
                    <tr key={w.level}>
                      <td className="p-2 border border-slate-200 font-mono">
                        Why {w.level}
                      </td>
                      <td className="p-2 border border-slate-200">
                        <p className="font-semibold">{w.question}</p>
                        <p className="mt-0.5">{w.answer || '—'}</p>
                      </td>
                      <td className="p-2 border border-slate-200">{w.evidenceNote || '—'}</td>
                      <td className="p-2 border border-slate-200">
                        {w.validatedByManager ? 'Validated' : 'Illustrative / Unvalidated'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* 6. Historical Complaint Comparison */}
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-1">
              6. Historical Complaint Comparison
            </h3>
            {historicalMatches.length === 0 ? (
              <p className="text-slate-500">No matching historical complaints found.</p>
            ) : (
              <table className="w-full border-collapse border border-slate-200 text-left">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="p-2 border border-slate-200">Complaint</th>
                    <th className="p-2 border border-slate-200">Relevance</th>
                    <th className="p-2 border border-slate-200">Recorded Root Cause</th>
                    <th className="p-2 border border-slate-200">CAPA &amp; Effectiveness</th>
                  </tr>
                </thead>
                <tbody>
                  {historicalMatches.slice(0, 6).map((m) => (
                    <tr key={m.complaint.id}>
                      <td className="p-2 border border-slate-200 font-mono">
                        {m.complaint.id} · {m.complaint.batchNumber}
                      </td>
                      <td className="p-2 border border-slate-200">
                        {m.matchReasons.join(', ')}
                      </td>
                      <td className="p-2 border border-slate-200">{m.recordedRootCause}</td>
                      <td className="p-2 border border-slate-200">
                        {m.correctiveAction} ({m.effectivenessStatus})
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* 7. Recommended Corrective Actions */}
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-1">
              7. Recommended &amp; Active Corrective Actions
            </h3>
            {recommendedActions.length === 0 ? (
              <p className="text-slate-500">No corrective actions linked yet.</p>
            ) : (
              <ul className="list-disc pl-5 space-y-1">
                {recommendedActions.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
