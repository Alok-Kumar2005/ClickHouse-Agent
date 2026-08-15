'use client';
// ============================================================
// components/data/StreamConfigModal.tsx
// Parameterized live data stream configuration modal
// ============================================================
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Play,
  Zap,
  DollarSign,
  Film,
  Building2,
  ChevronRight,
  Info
} from 'lucide-react';
import type { StreamConfig } from '@/lib/api';

interface StreamConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (config: StreamConfig) => void;
  isStarting: boolean;
}

const PRESET_CONFIGS: Array<{
  label: string;
  description: string;
  icon: React.ReactNode;
  config: StreamConfig;
}> = [
  {
    label: 'Blockbuster Blitz',
    description: 'High-volume stream for all top movies at premium pricing',
    icon: <Zap size={14} className="text-amber-400" />,
    config: { events_per_second: 30, min_price: 18, max_price: 28 },
  },
  {
    label: 'NYC Premium',
    description: 'NYC theater exclusives with premium seating prices',
    icon: <Building2 size={14} className="text-cyan-400" />,
    config: { theaters: ['th_nyc_01'], min_price: 20, max_price: 30, events_per_second: 15 },
  },
  {
    label: 'Arthouse Circuit',
    description: 'Indie & arthouse films, lower price range',
    icon: <Film size={14} className="text-purple-400" />,
    config: {
      movies: ['Everything Everywhere All at Once', 'Oppenheimer', 'Dune: Part Two'],
      min_price: 10,
      max_price: 16,
      events_per_second: 8,
    },
  },
];

export function StreamConfigModal({
  isOpen,
  onClose,
  onStart,
  isStarting,
}: StreamConfigModalProps) {
  const [moviesInput, setMoviesInput] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [eventsPerSec, setEventsPerSec] = useState(10);
  const [theatersInput, setTheatersInput] = useState('');
  const [activePreset, setActivePreset] = useState<number | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  function applyPreset(idx: number) {
    const p = PRESET_CONFIGS[idx].config;
    setActivePreset(idx);
    setMoviesInput(p.movies?.join(', ') ?? '');
    setMinPrice(p.min_price != null ? String(p.min_price) : '');
    setMaxPrice(p.max_price != null ? String(p.max_price) : '');
    setEventsPerSec(p.events_per_second ?? 10);
    setTheatersInput(p.theaters?.join(', ') ?? '');
    setValidationError(null);
  }

  function buildConfig(): StreamConfig | null {
    const min = minPrice ? parseFloat(minPrice) : undefined;
    const max = maxPrice ? parseFloat(maxPrice) : undefined;

    if (min != null && isNaN(min)) {
      setValidationError('Min price must be a valid number.');
      return null;
    }
    if (max != null && isNaN(max)) {
      setValidationError('Max price must be a valid number.');
      return null;
    }
    if (min != null && max != null && min > max) {
      setValidationError('Min price cannot exceed Max price.');
      return null;
    }

    const movies = moviesInput
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
    const theaters = theatersInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const config: StreamConfig = {};
    if (movies.length) config.movies = movies;
    if (min != null) config.min_price = min;
    if (max != null) config.max_price = max;
    if (eventsPerSec !== 10) config.events_per_second = eventsPerSec;
    config.events_per_second = eventsPerSec; // always pass speed
    if (theaters.length) config.theaters = theaters;

    return config;
  }

  function handleStart() {
    setValidationError(null);
    const config = buildConfig();
    if (!config) return;
    onStart(config);
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { if (!isStarting) onClose(); }}
            className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/60"
          >
            {/* Close */}
            <button
              onClick={onClose}
              disabled={isStarting}
              className="absolute right-3.5 top-3.5 z-10 rounded-lg p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-30"
            >
              <X size={16} />
            </button>

            {/* Header */}
            <div className="border-b border-zinc-800 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                </span>
                <h3 className="text-sm font-bold text-zinc-200">Configure Live Data Stream</h3>
              </div>
              <p className="text-[11px] text-zinc-500 mt-1 ml-5.5">
                Specify movies, pricing, theaters and generation speed before starting the feed.
              </p>
            </div>

            <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Presets */}
              <div>
                <p className="text-[11px] font-bold text-zinc-400 mb-2 uppercase tracking-wider">Quick Presets</p>
                <div className="grid grid-cols-3 gap-2">
                  {PRESET_CONFIGS.map((p, i) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => applyPreset(i)}
                      className={`flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition ${
                        activePreset === i
                          ? 'border-emerald-500/50 bg-emerald-950/30 shadow shadow-emerald-950/50'
                          : 'border-zinc-800 bg-zinc-800/40 hover:border-zinc-700 hover:bg-zinc-800/70'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-200">
                        {p.icon}
                        {p.label}
                      </span>
                      <span className="text-[10px] text-zinc-500 leading-snug">{p.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3 text-[10px] text-zinc-600">
                <span className="flex-1 h-px bg-zinc-800" />
                or configure manually
                <span className="flex-1 h-px bg-zinc-800" />
              </div>

              {/* Movie Filter */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-300">
                  <Film size={12} className="text-cyan-400" />
                  Movie Filter
                  <span className="text-zinc-600 font-normal">(optional — comma separated)</span>
                </label>
                <input
                  type="text"
                  value={moviesInput}
                  onChange={(e) => { setMoviesInput(e.target.value); setActivePreset(null); }}
                  placeholder="e.g. Dune 2, Oppenheimer, The Dark Knight"
                  className="w-full rounded-xl border border-zinc-700/80 bg-zinc-800/60 px-3 py-2.5 text-xs text-zinc-200 placeholder-zinc-600 outline-none transition focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                />
              </div>

              {/* Price Range */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-300">
                  <DollarSign size={12} className="text-emerald-400" />
                  Ticket Price Range
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">$</span>
                    <input
                      type="number"
                      value={minPrice}
                      onChange={(e) => { setMinPrice(e.target.value); setActivePreset(null); }}
                      placeholder="10.00"
                      min={0}
                      step={0.5}
                      className="w-full rounded-xl border border-zinc-700/80 bg-zinc-800/60 py-2.5 pl-7 pr-3 text-xs text-zinc-200 placeholder-zinc-600 outline-none transition focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20"
                    />
                  </div>
                  <span className="text-zinc-600 text-xs">to</span>
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">$</span>
                    <input
                      type="number"
                      value={maxPrice}
                      onChange={(e) => { setMaxPrice(e.target.value); setActivePreset(null); }}
                      placeholder="30.00"
                      min={0}
                      step={0.5}
                      className="w-full rounded-xl border border-zinc-700/80 bg-zinc-800/60 py-2.5 pl-7 pr-3 text-xs text-zinc-200 placeholder-zinc-600 outline-none transition focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20"
                    />
                  </div>
                </div>
              </div>

              {/* Generation Speed */}
              <div className="space-y-2">
                <label className="flex items-center justify-between text-[11px] font-bold text-zinc-300">
                  <span className="flex items-center gap-1.5">
                    <Zap size={12} className="text-amber-400" />
                    Generation Speed
                  </span>
                  <span className="font-mono text-amber-400 bg-amber-950/30 border border-amber-500/20 rounded px-2 py-0.5">
                    {eventsPerSec} rec/sec
                  </span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={50}
                  value={eventsPerSec}
                  onChange={(e) => { setEventsPerSec(Number(e.target.value)); setActivePreset(null); }}
                  className="w-full h-1.5 rounded-full accent-amber-400 bg-zinc-700 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-zinc-600">
                  <span>1 rec/sec (slow)</span>
                  <span>50 rec/sec (max)</span>
                </div>
              </div>

              {/* Theater IDs */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-300">
                  <Building2 size={12} className="text-purple-400" />
                  Theater IDs
                  <span className="text-zinc-600 font-normal">(optional — comma separated)</span>
                </label>
                <input
                  type="text"
                  value={theatersInput}
                  onChange={(e) => { setTheatersInput(e.target.value); setActivePreset(null); }}
                  placeholder="e.g. th_nyc_01, th_la_02, TH-102"
                  className="w-full rounded-xl border border-zinc-700/80 bg-zinc-800/60 px-3 py-2.5 text-xs text-zinc-200 placeholder-zinc-600 outline-none transition focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20"
                />
                <p className="flex items-center gap-1 text-[10px] text-zinc-600">
                  <Info size={10} />
                  Known IDs: th_nyc_01, th_la_02, th_chi_03, TH-102, TH-103
                </p>
              </div>

              {/* Validation error */}
              {validationError && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xs text-rose-400 bg-rose-950/30 border border-rose-500/20 rounded-xl px-3 py-2"
                >
                  ⚠️ {validationError}
                </motion.p>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-zinc-800 px-5 py-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isStarting}
                className="rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2 text-xs font-semibold text-zinc-400 transition hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-40"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleStart}
                disabled={isStarting}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow shadow-emerald-900/40 transition hover:bg-emerald-500 hover:shadow-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play size={13} className="fill-white" />
                {isStarting ? 'Starting…' : 'Start Live Stream'}
                {!isStarting && <ChevronRight size={13} />}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
