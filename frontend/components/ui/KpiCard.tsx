'use client';
// ============================================================
// components/ui/KpiCard.tsx — Single aggregate KPI display
// ============================================================
import { TrendingUp, TrendingDown } from 'lucide-react';
import { motion } from 'framer-motion';

interface KpiCardProps {
  label: string;
  value: string | number;
  trend?: 'up' | 'down' | null;
  unit?: string;
}

export function KpiCard({ label, value, trend, unit }: KpiCardProps) {
  const formatted =
    typeof value === 'number'
      ? value.toLocaleString('en-US', { maximumFractionDigits: 2 })
      : value;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-2xl border border-zinc-700/60 bg-zinc-900 p-6"
    >
      {/* Glow accent */}
      <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-cyan-500/10 blur-3xl" />

      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{label}</p>
      <div className="mt-3 flex items-end gap-2">
        <span className="text-5xl font-black tracking-tight text-white">
          {unit && <span className="mr-1 text-2xl text-zinc-400">{unit}</span>}
          {formatted}
        </span>
        {trend === 'up' && (
          <span className="mb-1 flex items-center gap-1 text-emerald-400 text-sm font-semibold">
            <TrendingUp size={16} /> Up
          </span>
        )}
        {trend === 'down' && (
          <span className="mb-1 flex items-center gap-1 text-rose-400 text-sm font-semibold">
            <TrendingDown size={16} /> Down
          </span>
        )}
      </div>
    </motion.div>
  );
}
