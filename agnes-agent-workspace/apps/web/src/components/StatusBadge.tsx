import type { AgentStepStatus } from '../types/agent';
import { STEP_STATUS_ZH } from '../utils/status';

const STATUS_STYLE: Record<AgentStepStatus, string> = {
  pending: 'bg-slate-800/80 text-slate-400 ring-slate-600/40',
  running: 'bg-amber-500/15 text-amber-200 ring-amber-500/30',
  success: 'bg-emerald-500/12 text-emerald-300 ring-emerald-500/25',
  error: 'bg-red-500/12 text-red-300 ring-red-500/25',
};

interface StatusBadgeProps {
  status: AgentStepStatus;
  pulse?: boolean;
  className?: string;
}

export default function StatusBadge({ status, pulse, className = '' }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
        STATUS_STYLE[status]
      } ${pulse ? 'animate-pulse' : ''} ${className}`}
    >
      {STEP_STATUS_ZH[status]}
    </span>
  );
}
