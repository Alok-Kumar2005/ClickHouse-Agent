'use client';
// ============================================================
// components/agent/ReasoningSteps.tsx
// Collapsible step timeline with animated entrance
// ============================================================
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Search, Database, Zap, Bot, CheckCircle2 } from 'lucide-react';

interface ReasoningStepsProps {
  steps: string[];
  isStreaming?: boolean;
}

function getStepIcon(step: string) {
  if (step.toLowerCase().includes('supervisor') || step.toLowerCase().includes('classif') || step.includes('🔍'))
    return <Search size={13} className="text-cyan-400 shrink-0" />;
  if (step.toLowerCase().includes('sql') || step.toLowerCase().includes('generated') || step.includes('📊'))
    return <Database size={13} className="text-violet-400 shrink-0" />;
  if (step.toLowerCase().includes('clickhouse') || step.toLowerCase().includes('row') || step.includes('⚡'))
    return <Zap size={13} className="text-amber-400 shrink-0" />;
  if (step.toLowerCase().includes('action') || step.includes('💡'))
    return <Bot size={13} className="text-emerald-400 shrink-0" />;
  return <CheckCircle2 size={13} className="text-zinc-500 shrink-0" />;
}

function getStepLabel(step: string): string {
  if (step.includes('🔍') || step.toLowerCase().includes('supervisor')) return 'Supervisor Classification';
  if (step.includes('📊') || step.toLowerCase().includes('generated sql')) return 'SQL Compilation';
  if (step.includes('⚡') || step.toLowerCase().includes('clickhouse')) return 'Query Execution';
  if (step.includes('💡') || step.toLowerCase().includes('action')) return 'Action Engine';
  return 'Processing Step';
}

export function ReasoningSteps({ steps, isStreaming }: ReasoningStepsProps) {
  const [open, setOpen] = useState(true);

  if (!steps.length && !isStreaming) return null;

  return (
    <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/40 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-zinc-700/20"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            Reasoning Trail
          </span>
          <span className="rounded-full border border-zinc-600 bg-zinc-700 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">
            {steps.length} steps
          </span>
          {isStreaming && (
            <span className="flex items-center gap-1 text-[10px] text-cyan-400 animate-pulse">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
              Live
            </span>
          )}
        </div>
        <ChevronDown
          size={14}
          className={`shrink-0 text-zinc-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="relative px-4 pb-4 space-y-0">
              {/* Vertical line */}
              <div className="absolute left-[27px] top-0 bottom-4 w-px bg-zinc-700/60" />

              {steps.map((step, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: i * 0.05 }}
                  className="relative flex items-start gap-3 py-2"
                >
                  {/* Icon node on vertical line */}
                  <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-zinc-600/80 bg-zinc-800">
                    {getStepIcon(step)}
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-0.5">
                      {getStepLabel(step)}
                    </p>
                    <p className="text-xs text-zinc-300 leading-relaxed break-words">{step}</p>
                  </div>
                </motion.div>
              ))}

              {/* Live pulse step when streaming */}
              {isStreaming && (
                <motion.div
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                  className="relative flex items-start gap-3 py-2"
                >
                  <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-cyan-500/40 bg-cyan-950/50">
                    <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                  </div>
                  <div className="flex-1 pt-1">
                    <p className="text-xs text-cyan-400/70">Agent processing...</p>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
