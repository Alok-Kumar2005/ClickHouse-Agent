'use client';
// ============================================================
// components/ui/StatusBadge.tsx — Intent / status pill
// ============================================================
interface StatusBadgeProps {
  label: string;
  variant?: 'cyan' | 'emerald' | 'amber' | 'rose' | 'zinc';
}

const variantClasses: Record<string, string> = {
  cyan:    'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  emerald: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  amber:   'bg-amber-500/15 text-amber-400 border-amber-500/30',
  rose:    'bg-rose-500/15 text-rose-400 border-rose-500/30',
  zinc:    'bg-zinc-700/50 text-zinc-400 border-zinc-600/50',
};

export function StatusBadge({ label, variant = 'zinc' }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${variantClasses[variant]}`}
    >
      {label}
    </span>
  );
}

export function intentVariant(intent?: string | null): StatusBadgeProps['variant'] {
  switch (intent) {
    case 'analytics_query': return 'cyan';
    case 'anomaly_action':  return 'amber';
    case 'general_chat':    return 'zinc';
    default:                return 'zinc';
  }
}
