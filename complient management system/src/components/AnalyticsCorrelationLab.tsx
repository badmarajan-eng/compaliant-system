import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { AlertTriangle, Info } from 'lucide-react';
import {
  ANALYZED_PARAMETERS,
  type CorrelationAnalysisResult,
  type NumericParamKey,
} from '../utils/patternAnalytics';

interface AnalyticsCorrelationLabProps {
  correlation: CorrelationAnalysisResult;
}

export function AnalyticsCorrelationLab({ correlation }: AnalyticsCorrelationLabProps) {
  const populatedParams = useMemo(
    () =>
      correlation.parameterCoverage.filter((p) => p.observedCount >= 2 && p.key !== 'severityScore'),
    [correlation.parameterCoverage]
  );

  const [xParam, setXParam] = useState<NumericParamKey>('temperature');
  const [yParam, setYParam] = useState<NumericParamKey>('severityScore');
  const [selectedBandParam, setSelectedBandParam] = useState<NumericParamKey>('temperature');
  const [matrixScope, setMatrixScope] = useState<'severity' | 'allPairs'>('severity');

  const activeXMeta =
    ANALYZED_PARAMETERS.find((p) => p.key === xParam) ?? ANALYZED_PARAMETERS[0];
  const activeYMeta =
    ANALYZED_PARAMETERS.find((p) => p.key === yParam) ?? ANALYZED_PARAMETERS[7];

  const scatterPoints = useMemo(() => {
    return correlation.telemetryRows
      .filter((row) => row.values[xParam] !== null && row.values[yParam] !== null)
      .map((row) => ({
        x: row.values[xParam] as number,
        y: row.values[yParam] as number,
        complaintId: row.complaint.id,
        productName: row.complaint.productName,
        severity: row.complaint.severity,
        category: row.complaint.category,
      }));
  }, [correlation.telemetryRows, xParam, yParam]);

  const activePairStat = useMemo(() => {
    const found =
      correlation.pairwiseMatrix.find(
        (p) =>
          (p.paramX === xParam && p.paramY === yParam) ||
          (p.paramX === yParam && p.paramY === xParam)
      ) ??
      correlation.severityCorrelations.find(
        (p) =>
          (p.paramX === xParam && p.paramY === yParam) ||
          (p.paramX === yParam && p.paramY === xParam)
      );
    return found ?? null;
  }, [correlation.pairwiseMatrix, correlation.severityCorrelations, xParam, yParam]);

  const activeBandCoverage = useMemo(() => {
    return (
      correlation.parameterCoverage.find((p) => p.key === selectedBandParam) ??
      populatedParams[0] ??
      correlation.parameterCoverage[0]
    );
  }, [correlation.parameterCoverage, populatedParams, selectedBandParam]);

  const displayedCorrelations =
    matrixScope === 'severity'
      ? correlation.severityCorrelations
      : correlation.pairwiseMatrix;

  return (
    <div className="space-y-6">
      {/* Methodological Guardrail Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="text-xs text-amber-950 space-y-1">
          <p className="font-semibold">
            Statistical Governance: Correlation Does Not Prove Causation
          </p>
          <p className="leading-relaxed text-amber-900">{correlation.globalMethodNote}</p>
        </div>
      </div>

      {/* Parameter Observation Coverage Grid */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Manufacturing Parameter Observation Coverage
            </h2>
            <p className="text-xs text-slate-500">
              Counts strictly reflect recorded values in complaint telemetry and test logs (missing measurements are never interpolated)
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-600">
            Cohort: {correlation.totalRecords} record(s)
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {correlation.parameterCoverage
            .filter((p) => p.key !== 'severityScore')
            .map((p) => {
              const insufficient = p.observedCount < 3;
              return (
                <div
                  key={p.key}
                  className="border border-slate-200 rounded-md p-3.5 bg-slate-50/70 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900">{p.label}</span>
                      <span className="text-[11px] font-mono text-slate-500">{p.unit}</span>
                    </div>
                    <div className="mt-2 flex items-baseline justify-between text-xs font-mono tabular-nums">
                      <span className="text-slate-900 font-semibold">
                        n = {p.observedCount}
                      </span>
                      <span className="text-slate-500">{p.missingCount} missing</span>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-200 text-[11px] font-mono tabular-nums">
                    {insufficient ? (
                      <span className="text-amber-700 font-medium">
                        Insufficient observations (&lt; 3)
                      </span>
                    ) : (
                      <span className="text-slate-600">
                        Range: {p.min} – {p.max} (avg {p.mean})
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

          {/* Production Shift Coverage Card */}
          <div className="border border-slate-200 rounded-md p-3.5 bg-slate-50/70 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900">Production Shift</span>
                <span className="text-[11px] font-mono text-slate-500">Categorical</span>
              </div>
              <div className="mt-2 flex items-baseline justify-between text-xs font-mono tabular-nums">
                <span className="text-slate-900 font-semibold">
                  n = {correlation.totalRecords - correlation.shiftMissingCount}
                </span>
                <span className="text-slate-500">{correlation.shiftMissingCount} missing</span>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-200 text-[11px] font-mono tabular-nums">
              {correlation.shiftBreakdown.length === 0 ? (
                <span className="text-amber-700 font-medium">
                  No shift labels recorded in current filter
                </span>
              ) : (
                <span className="text-slate-600">
                  {correlation.shiftBreakdown.map((s) => `${s.shift}: ${s.complaints}`).join(' · ')}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Scatter Plot + Parameter Range Frequency Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scatter Plot */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Parameter Relationship Scatter Plot
              </h2>
              <p className="text-xs text-slate-500">
                Inspect paired measurements across recorded complaints (1=Low, 2=Medium, 3=High, 4=Critical)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs text-slate-600 space-y-1">
              <span className="block font-medium text-slate-700">X-Axis Parameter</span>
              <select
                value={xParam}
                onChange={(e) => setXParam(e.target.value as NumericParamKey)}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-800"
              >
                {ANALYZED_PARAMETERS.filter((p) => p.key !== 'severityScore').map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label} ({p.unit})
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs text-slate-600 space-y-1">
              <span className="block font-medium text-slate-700">Y-Axis Parameter / Outcome</span>
              <select
                value={yParam}
                onChange={(e) => setYParam(e.target.value as NumericParamKey)}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-800"
              >
                {ANALYZED_PARAMETERS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label} ({p.unit})
                  </option>
                ))}
              </select>
            </label>
          </div>

          {scatterPoints.length < 3 ? (
            <div className="h-64 border border-dashed border-slate-300 rounded-md flex flex-col items-center justify-center p-6 text-center bg-slate-50">
              <Info className="w-5 h-5 text-slate-400 mb-2" aria-hidden="true" />
              <p className="text-xs font-semibold text-slate-800">
                Insufficient Paired Observations (n = {scatterPoints.length})
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                Fewer than 3 complaints record both {activeXMeta.label} and {activeYMeta.label}. Register additional process measurements or select another parameter pair.
              </p>
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 16, bottom: 16, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name={activeXMeta.label}
                    tick={{ fontSize: 11, fill: '#475569' }}
                    unit={` ${activeXMeta.unit}`}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name={activeYMeta.label}
                    tick={{ fontSize: 11, fill: '#475569' }}
                    domain={yParam === 'severityScore' ? [1, 4] : ['auto', 'auto']}
                  />
                  <ZAxis range={[60, 60]} />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const pt = payload[0].payload as (typeof scatterPoints)[number];
                      return (
                        <div className="bg-white border border-slate-200 rounded-md p-2.5 shadow-md text-xs space-y-0.5">
                          <p className="font-mono font-bold text-slate-900">{pt.complaintId}</p>
                          <p className="text-slate-700">{pt.productName}</p>
                          <p className="font-mono tabular-nums text-cyan-800">
                            {activeXMeta.label}: {pt.x} {activeXMeta.unit}
                          </p>
                          <p className="font-mono tabular-nums text-slate-800">
                            {activeYMeta.label}: {pt.y} ({pt.severity})
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Scatter name="Recorded Complaints" data={scatterPoints} fill="#0891b2" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}

          {activePairStat && (
            <div className="pt-3 border-t border-slate-100 text-xs flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono tabular-nums text-slate-800">
                Pearson r:{' '}
                <strong>{activePairStat.pearsonR ?? 'N/A'}</strong>
                {' · '}Spearman ρ:{' '}
                <strong>{activePairStat.spearmanRho ?? 'N/A'}</strong>
                {' · '}n = {activePairStat.sampleSize}
              </span>
              <span className="text-slate-600">{activePairStat.strengthLabel}</span>
            </div>
          )}
        </div>

        {/* Complaint Frequency by Parameter Range */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Complaint Frequency by Parameter Range
              </h2>
              <p className="text-xs text-slate-500">
                Observed distribution across Low / Mid / High measured parameter bands
              </p>
            </div>

            <select
              aria-label="Select parameter for range frequency"
              value={selectedBandParam}
              onChange={(e) => setSelectedBandParam(e.target.value as NumericParamKey)}
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-800"
            >
              {ANALYZED_PARAMETERS.filter((p) => p.key !== 'severityScore').map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {!activeBandCoverage || activeBandCoverage.rangeBuckets.length === 0 ? (
            <div className="h-64 border border-dashed border-slate-300 rounded-md flex flex-col items-center justify-center p-6 text-center bg-slate-50">
              <Info className="w-5 h-5 text-slate-400 mb-2" aria-hidden="true" />
              <p className="text-xs font-semibold text-slate-800">
                Insufficient Range Observations for {activeBandCoverage?.label ?? selectedBandParam}
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                Requires at least 3 distinct numeric observations with non-zero spread to compute Low/Mid/High range bands.
              </p>
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={activeBandCoverage.rangeBuckets}
                  margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="bandLabel" tick={{ fontSize: 10, fill: '#475569' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '6px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="complaints" name="Total Complaints" fill="#0f172a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="criticalOrHigh" name="High / Critical" fill="#0891b2" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {correlation.shiftBreakdown.length > 0 && (
            <div className="pt-3 border-t border-slate-100 text-xs">
              <p className="font-semibold text-slate-800 mb-1.5">Recorded Shift Distribution</p>
              <div className="grid grid-cols-3 gap-2">
                {correlation.shiftBreakdown.map((s) => (
                  <div
                    key={s.shift}
                    className="border border-slate-200 rounded px-2.5 py-1.5 bg-slate-50 font-mono tabular-nums"
                  >
                    <p className="text-slate-700 font-medium">{s.shift}</p>
                    <p className="text-slate-900 font-bold">
                      {s.complaints} ({s.sharePercent}%)
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Correlation Matrix & Limitation Table */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Statistical Correlation Matrix &amp; Methodological Limitations
            </h2>
            <p className="text-xs text-slate-500">
              Pearson r and Spearman ρ computed strictly on complete paired observations
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
            <button
              type="button"
              onClick={() => setMatrixScope('severity')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                matrixScope === 'severity'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Parameters vs Severity
            </button>
            <button
              type="button"
              onClick={() => setMatrixScope('allPairs')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                matrixScope === 'allPairs'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Full Pairwise Matrix ({correlation.pairwiseMatrix.length})
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3 font-medium">Parameter Pair</th>
                <th className="py-2 pr-3 font-medium text-right">Paired n</th>
                <th className="py-2 pr-3 font-medium text-right">Missing</th>
                <th className="py-2 pr-3 font-medium text-right">Pearson r</th>
                <th className="py-2 pr-3 font-medium text-right">Spearman ρ</th>
                <th className="py-2 pr-3 font-medium">Observed Association</th>
                <th className="py-2 font-medium">Limitation &amp; Interpretation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedCorrelations.map((row) => (
                <tr key={`${row.paramX}-${row.paramY}`} className="hover:bg-slate-50/70">
                  <td className="py-2.5 pr-3 font-medium text-slate-900 whitespace-nowrap">
                    {row.labelX} × {row.labelY}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-slate-900">
                    {row.sampleSize}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-slate-500">
                    {row.missingCount}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                    {row.pearsonR !== null ? row.pearsonR.toFixed(3) : '—'}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono tabular-nums font-semibold text-cyan-800">
                    {row.spearmanRho !== null ? row.spearmanRho.toFixed(3) : '—'}
                  </td>
                  <td className="py-2.5 pr-3 whitespace-nowrap">
                    <span
                      className={
                        row.status === 'Insufficient Observations'
                          ? 'text-amber-700 font-medium'
                          : row.status === 'Zero Variance'
                            ? 'text-slate-500'
                            : 'text-slate-800 font-medium'
                      }
                    >
                      {row.strengthLabel}
                    </span>
                  </td>
                  <td className="py-2.5 text-slate-600 max-w-md">{row.limitationNote}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
