import { useMemo, useState } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BookmarkPlus, Info } from 'lucide-react';
import { RiskTierText } from './StatusText';
import type {
  ForecastMethodId,
  PredictionHistoryEntry,
  ProductRiskAssessment,
  TimeSeriesForecastResult,
} from '../types/qms';

interface PredictiveForecastPanelProps {
  forecast: TimeSeriesForecastResult;
  method: ForecastMethodId;
  onMethodChange: (method: ForecastMethodId) => void;
  predictionHistory: PredictionHistoryEntry[];
  productRisks: ProductRiskAssessment[];
  onSaveSnapshot: (
    entry: Omit<PredictionHistoryEntry, 'id' | 'actualComplaintCount' | 'evaluationStatus'>
  ) => void;
}

export function PredictiveForecastPanel({
  forecast,
  method,
  onMethodChange,
  predictionHistory,
  productRisks,
  onSaveSnapshot,
}: PredictiveForecastPanelProps) {
  const [snapshotEntity, setSnapshotEntity] = useState<string>('Plant Overall Monthly Volume');
  const [snapshotNotice, setSnapshotNotice] = useState<string | null>(null);

  const chartData = useMemo(() => {
    return forecast.timeline.map((pt) => ({
      ...pt,
      uncertaintyBand:
        pt.lowerBound !== null && pt.upperBound !== null
          ? [pt.lowerBound, pt.upperBound]
          : undefined,
    }));
  }, [forecast]);

  const elapsedComparisons = useMemo(
    () =>
      predictionHistory
        .filter((h) => h.actualComplaintCount !== null && h.predictedComplaintCount !== null)
        .slice(0, 8)
        .reverse(),
    [predictionHistory]
  );

  const handleSaveCurrentSnapshot = () => {
    const nextMonthPoint = forecast.timeline.find((p) => p.isForecast);
    const fallbackPeriod = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 7);
    const period = nextMonthPoint?.month ?? fallbackPeriod;

    const isPlant = snapshotEntity === 'Plant Overall Monthly Volume';
    const matchedProd = productRisks.find((p) => p.productName === snapshotEntity);

    onSaveSnapshot({
      predictionDate: new Date().toISOString().slice(0, 10),
      targetEntity: snapshotEntity,
      entityKind: isPlant ? 'Plant Overall' : 'Product',
      riskScore: matchedProd?.riskScore ?? productRisks[0]?.riskScore ?? 0,
      riskLevel: matchedProd?.riskLevel ?? productRisks[0]?.riskLevel ?? 'MEDIUM',
      forecastPeriod: period,
      predictedComplaintCount: isPlant
        ? Math.round(nextMonthPoint?.predictedCount ?? 0)
        : matchedProd
          ? Math.max(1, Math.round(matchedProd.recent90DayComplaints / 3))
          : null,
      methodNote: forecast.methodLabel,
    });

    setSnapshotNotice(`Saved ${period} forecast snapshot for ${snapshotEntity}.`);
    window.setTimeout(() => setSnapshotNotice(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Module 5: Mathematical Time-Series Forecasting */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Monthly Complaint Volume Forecasting (Deterministic Time-Series)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Calculated mathematically from chronological monthly complaint counts ({forecast.observedStartMonth} to {forecast.observedEndMonth}). Gemini AI is never used to invent numerical forecasts.
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md self-start">
            {(
              [
                { id: 'exponential_smoothing', label: 'Exponential Smoothing' },
                { id: 'moving_average', label: 'Moving Average (3M)' },
                { id: 'linear_trend', label: 'Trend Regression' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onMethodChange(opt.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap transition-colors ${
                  method === opt.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {!forecast.sufficientData ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-xs text-amber-900 space-y-1">
              <p className="font-semibold">Insufficient Historical Observations for Forecasting</p>
              <p>{forecast.insufficientReason}</p>
            </div>
          </div>
        ) : (
          <>
            {/* Horizon Forecast Summary Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {forecast.horizons.map((h) => (
                <div key={h.horizonLabel} className="border border-slate-200 rounded-lg p-4">
                  <p className="text-xs font-medium text-slate-500">{h.horizonLabel}</p>
                  <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                    {h.predictedTotal}
                    <span className="text-xs font-normal text-slate-500 ml-1.5">complaints</span>
                  </p>
                  <p className="text-xs text-slate-600 font-mono tabular-nums mt-1.5">
                    Range: {h.lowerBoundTotal}–{h.upperBoundTotal} · Avg {h.monthlyAverage}/mo
                  </p>
                </div>
              ))}

              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/70">
                <p className="text-xs font-medium text-slate-500">Observed Slope & Backtest</p>
                <p
                  className={`text-lg font-bold mt-1 ${
                    forecast.trendDirection === 'Increasing'
                      ? 'text-red-700'
                      : forecast.trendDirection === 'Decreasing'
                        ? 'text-emerald-700'
                        : 'text-slate-900'
                  }`}
                >
                  {forecast.trendDirection} ({forecast.trendSlopePerMonth >= 0 ? '+' : ''}
                  {forecast.trendSlopePerMonth}/mo)
                </p>
                <p className="text-xs text-slate-600 font-mono tabular-nums mt-1.5">
                  {forecast.backtestMetrics.mae !== null
                    ? `MAE: ${forecast.backtestMetrics.mae} · RMSE: ${forecast.backtestMetrics.rmse}`
                    : `${forecast.historicalMonthsCount} historical months`}
                </p>
              </div>
            </div>

            {/* Historical + Forecast + Uncertainty Chart */}
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip
                    contentStyle={{ fontSize: '12px', borderRadius: '6px' }}
                    formatter={(value: unknown, name: unknown) => {
                      if (Array.isArray(value)) {
                        return [`${value[0]} – ${value[1]}`, String(name)];
                      }
                      return [String(value ?? '—'), String(name)];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Area
                    type="monotone"
                    dataKey="uncertaintyBand"
                    name="Prediction Uncertainty Band"
                    fill="#cffafe"
                    stroke="none"
                    fillOpacity={0.65}
                  />
                  <Line
                    type="monotone"
                    dataKey="actualCount"
                    name="Historical Complaints"
                    stroke="#0f172a"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: '#0f172a' }}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="predictedCount"
                    name="Forecasted Complaints"
                    stroke="#0891b2"
                    strokeWidth={2.5}
                    strokeDasharray="6 4"
                    dot={{ r: 3.5, fill: '#0891b2' }}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <p className="text-[11px] text-slate-500">
              Method: {forecast.methodLabel}. {forecast.backtestMetrics.note} Uncertainty interval widens over longer horizons (proportional to sqrt of horizon months).
            </p>
          </>
        )}
      </section>

      {/* Module 10: Prediction History & Forecast vs Actual Comparison */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Prediction History & Actual Outcomes Comparison
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Compares saved period forecasts against live complaint counts once those periods elapse in the dataset
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={snapshotEntity}
              onChange={(e) => setSnapshotEntity(e.target.value)}
              aria-label="Select entity for prediction snapshot"
              className="px-3 py-2 text-xs border border-slate-300 rounded-md bg-white text-slate-800"
            >
              <option value="Plant Overall Monthly Volume">Plant Overall Monthly Volume</option>
              {productRisks.map((p) => (
                <option key={p.productId} value={p.productName}>
                  {p.productName} ({p.riskScore}/100)
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleSaveCurrentSnapshot}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#0B1426] hover:bg-slate-800 rounded-md whitespace-nowrap transition-colors"
            >
              <BookmarkPlus className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
              <span>Save Forecast Snapshot</span>
            </button>
          </div>
        </div>

        {snapshotNotice && (
          <p className="text-xs font-medium text-cyan-800 bg-cyan-50 border border-cyan-200 rounded-md px-3 py-2">
            {snapshotNotice}
          </p>
        )}

        {elapsedComparisons.length > 0 && (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={elapsedComparisons} margin={{ top: 6, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="forecastPeriod" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '6px' }} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar
                  dataKey="predictedComplaintCount"
                  name="Predicted Complaints"
                  fill="#0891b2"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="actualComplaintCount"
                  name="Actual Recorded Complaints"
                  fill="#0f172a"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3 font-medium">Prediction Date</th>
                <th className="py-2 pr-3 font-medium">Product / Process / Scope</th>
                <th className="py-2 pr-3 font-medium text-right">Risk Score</th>
                <th className="py-2 pr-3 font-medium">Forecast Period</th>
                <th className="py-2 pr-3 font-medium text-right">Predicted</th>
                <th className="py-2 pr-3 font-medium text-right">Actual</th>
                <th className="py-2 font-medium">Prediction Evaluation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {predictionHistory.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                    {row.predictionDate}
                  </td>
                  <td className="py-2.5 pr-3">
                    <p className="font-medium text-slate-900">{row.targetEntity}</p>
                    <p className="text-[11px] text-slate-500">
                      {row.entityKind} · {row.methodNote}
                    </p>
                  </td>
                  <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                    <RiskTierText tier={row.riskLevel} score={row.riskScore} />
                  </td>
                  <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                    {row.forecastPeriod}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono tabular-nums font-semibold text-cyan-800">
                    {row.predictedComplaintCount ?? '—'}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                    {row.actualComplaintCount ?? 'Pending'}
                  </td>
                  <td className="py-2.5">
                    <span
                      className={`text-xs font-medium ${
                        row.evaluationStatus === 'Accurate (Within +/-20%)'
                          ? 'text-emerald-700'
                          : row.evaluationStatus === 'Under-Predicted'
                            ? 'text-red-700'
                            : row.evaluationStatus === 'Over-Predicted'
                              ? 'text-amber-700'
                              : 'text-slate-500'
                      }`}
                    >
                      {row.evaluationStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
