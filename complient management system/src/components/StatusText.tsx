import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  GitBranch,
  Info,
  ShieldAlert,
} from 'lucide-react';
import type {
  ComplaintStatus,
  EffectivenessStatus,
  RiskTier,
  SeverityLevel,
} from '../types/qms';

export function SeverityText({ severity }: { severity: SeverityLevel }) {
  const config: Record<SeverityLevel, { color: string; Icon: typeof AlertCircle }> = {
    Critical: { color: 'text-red-700 font-semibold', Icon: ShieldAlert },
    High: { color: 'text-amber-700 font-semibold', Icon: AlertTriangle },
    Medium: { color: 'text-cyan-800 font-medium', Icon: AlertCircle },
    Low: { color: 'text-slate-600 font-medium', Icon: Info },
  };
  const { color, Icon } = config[severity] ?? config.Medium;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs whitespace-nowrap ${color}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{severity}</span>
    </span>
  );
}

export function StatusText({ status }: { status: ComplaintStatus | string }) {
  const config: Record<string, { color: string; Icon: typeof Clock }> = {
    New: { color: 'text-red-700 font-medium', Icon: AlertCircle },
    Open: { color: 'text-red-700 font-medium', Icon: AlertCircle },
    'Under Investigation': { color: 'text-amber-700 font-medium', Icon: Clock },
    'Root Cause Identified': { color: 'text-indigo-700 font-medium', Icon: GitBranch },
    'Corrective Action In Progress': { color: 'text-cyan-800 font-medium', Icon: Clock },
    'CAPA In Progress': { color: 'text-cyan-800 font-medium', Icon: Clock },
    'Verification Pending': { color: 'text-amber-800 font-medium', Icon: Clock },
    Closed: { color: 'text-emerald-700 font-medium', Icon: CheckCircle2 },
  };
  const { color, Icon } = config[status] ?? {
    color: 'text-slate-700 font-medium',
    Icon: Clock,
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs whitespace-nowrap ${color}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{status}</span>
    </span>
  );
}

export function RiskTierText({ tier, score }: { tier: RiskTier; score?: number }) {
  const color =
    tier === 'HIGH'
      ? 'text-red-700 font-semibold'
      : tier === 'MEDIUM'
        ? 'text-amber-700 font-semibold'
        : 'text-emerald-700 font-medium';
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs tabular-nums whitespace-nowrap ${color}`}>
      {score !== undefined && <span className="font-mono">{score}/100</span>}
      {score !== undefined && <span aria-hidden="true">·</span>}
      <span>{tier} RISK</span>
    </span>
  );
}

export function EffectivenessText({ status }: { status: EffectivenessStatus }) {
  const color =
    status === 'Verified Effective'
      ? 'text-emerald-700 font-semibold'
      : status === 'Partially Effective'
        ? 'text-amber-700 font-semibold'
        : status === 'Ineffective'
          ? 'text-red-700 font-semibold'
          : 'text-slate-600 font-medium';

  return <span className={`text-xs whitespace-nowrap ${color}`}>{status}</span>;
}
