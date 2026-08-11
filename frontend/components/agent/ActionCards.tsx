'use client';
// ============================================================
// components/agent/ActionCards.tsx
// Human-in-the-loop decision cards for recommended_actions
// ============================================================
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle, TrendingUp, Tv, Megaphone,
  CheckCircle2, X, Target, Zap
} from 'lucide-react';
import { ActionItem } from '@/types';
import { useToast } from '@/components/ui/Toast';

interface ActionCardsProps {
  actions: ActionItem[];
}

const ACTION_META: Record<string, { icon: React.ReactNode; color: string }> = {
  DYNAMIC_PRICING: {
    icon: <TrendingUp size={14} />,
    color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
  },
  SCREEN_SHIFT: {
    icon: <Tv size={14} />,
    color: 'text-violet-400 bg-violet-500/10 border-violet-500/30',
  },
  MARKETING_BOOST: {
    icon: <Megaphone size={14} />,
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  },
};

function getActionMeta(type: string) {
  return (
    ACTION_META[type.toUpperCase()] ?? {
      icon: <Zap size={14} />,
      color: 'text-zinc-400 bg-zinc-700/30 border-zinc-600/30',
    }
  );
}

export function ActionCards({ actions }: ActionCardsProps) {
  const { showToast } = useToast();
  const [statuses, setStatuses] = useState<Record<number, 'approved' | 'rejected' | null>>(
    Object.fromEntries(actions.map((_, i) => [i, null]))
  );

  function approve(idx: number) {
    setStatuses((prev) => ({ ...prev, [idx]: 'approved' }));
    showToast('Action approved and dispatched to downstream system.', 'success');
  }

  function reject(idx: number) {
    setStatuses((prev) => ({ ...prev, [idx]: 'rejected' }));
    showToast('Action rejected and flagged for review.', 'warning');
  }

  if (!actions.length) return null;

  return (
    <div className="space-y-3 mt-2">
      <div className="flex items-center gap-2">
        <AlertTriangle size={13} className="text-amber-400" />
        <span className="text-xs font-semibold uppercase tracking-widest text-amber-400">
          Action Recommendations ({actions.length})
        </span>
      </div>

      {actions.map((action, i) => {
        const meta = getActionMeta(action.action_type);
        const status = statuses[i];

        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: i * 0.07 }}
            className={`relative overflow-hidden rounded-xl border bg-zinc-900/80 p-4 transition-all ${
              status === 'approved'
                ? 'border-emerald-500/40'
                : status === 'rejected'
                ? 'border-rose-500/30 opacity-60'
                : 'border-zinc-700/60'
            }`}
          >
            {/* Status ribbon */}
            <AnimatePresence>
              {status && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`absolute top-3 right-3 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                    status === 'approved'
                      ? 'border-emerald-500/40 bg-emerald-950/60 text-emerald-400'
                      : 'border-rose-500/40 bg-rose-950/60 text-rose-400'
                  }`}
                >
                  {status === 'approved' ? (
                    <><CheckCircle2 size={10} /> Approved</>
                  ) : (
                    <><X size={10} /> Rejected</>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Action type badge */}
            <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider mb-3 ${meta.color}`}>
              {meta.icon}
              {action.action_type.replace(/_/g, ' ')}
            </div>

            {/* Target */}
            <div className="flex items-center gap-1.5 mb-2">
              <Target size={12} className="text-zinc-500 shrink-0" />
              <span className="text-xs font-semibold text-zinc-300">{action.target}</span>
            </div>

            {/* Description */}
            <p className="text-xs text-zinc-400 leading-relaxed mb-3">{action.description}</p>

            {/* Impact */}
            <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-950/20 px-3 py-2 mb-4">
              <TrendingUp size={12} className="text-emerald-400 shrink-0" />
              <span className="text-[11px] font-semibold text-emerald-400">
                Est. Impact: {action.estimated_impact}
              </span>
            </div>

            {/* Action buttons */}
            {!status && (
              <div className="flex gap-2">
                <button
                  onClick={() => approve(i)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 px-3 py-2 text-xs font-bold text-white shadow shadow-emerald-500/20 transition hover:from-emerald-500 hover:to-emerald-600"
                >
                  <CheckCircle2 size={13} />
                  Approve Strategy
                </button>
                <button
                  onClick={() => reject(i)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs font-bold text-rose-400 transition hover:border-rose-400/50 hover:bg-rose-950/50"
                >
                  <X size={13} />
                  Reject / Modify
                </button>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
