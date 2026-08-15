'use client';
// ============================================================
// components/layout/Header.tsx
// Header controls, live stream injector, dataset uploader modal
// ============================================================
import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PanelLeftClose,
  PanelLeftOpen,
  Database,
  Wifi,
  Clock,
  Play,
  Upload,
  Loader2,
  Settings,
  StopCircle,
  X,
  LogOut
} from 'lucide-react';
import { ThreadSchema } from '@/types';
import { startLiveStream, stopLiveStream, type StreamConfig } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { StatusBadge, intentVariant } from '@/components/ui/StatusBadge';
import { DatasetUploadModal } from '@/components/data/DatasetUploadModal';
import { StreamConfigModal } from '@/components/data/StreamConfigModal';

interface HeaderProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  activeThread: ThreadSchema | null;
  currentIntent?: string | null;
  isStreaming: boolean;
  currentTime: string;
  datasetStatus: {
    active: boolean;
    row_count: number;
    columns: string[];
  } | null;
  onRefreshDatasetStatus: () => Promise<void>;
  onLogout: () => void;
  isLiveStreaming: boolean;
  totalLiveEvents: number;
  onRefreshLiveStreamStatus: () => Promise<void>;
}

export function Header({
  sidebarOpen,
  setSidebarOpen,
  activeThread,
  currentIntent,
  isStreaming,
  currentTime,
  datasetStatus,
  onRefreshDatasetStatus,
  onLogout,
  isLiveStreaming,
  totalLiveEvents,
  onRefreshLiveStreamStatus,
}: HeaderProps) {
  const { showToast } = useToast();
  const [togglingStream, setTogglingStream] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isStartingStream, setIsStartingStream] = useState(false);

  // Stop the live stream
  async function handleStopStream() {
    setTogglingStream(true);
    try {
      await stopLiveStream();
      await onRefreshLiveStreamStatus();
      showToast('Live ticket stream disconnected.', 'warning');
    } catch (err: any) {
      showToast(err.message || 'Failed to stop live stream.', 'error');
    } finally {
      setTogglingStream(false);
    }
  }

  // Start the live stream with a configuration payload
  async function handleStartStream(config: StreamConfig) {
    setIsStartingStream(true);
    try {
      await startLiveStream(config);
      await onRefreshLiveStreamStatus();
      setIsConfigModalOpen(false);
      const eps = config.events_per_second ?? 10;
      showToast(`Live stream started at ${eps} events/sec!`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to start live stream.', 'error');
    } finally {
      setIsStartingStream(false);
    }
  }

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 bg-zinc-900/60 px-4 py-3 backdrop-blur-sm shrink-0 w-full">
        <div className="flex items-center gap-3 min-w-0">
          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
            title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          >
            {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
          </button>

          {/* Thread title */}
          <div className="min-w-0">
            {activeThread ? (
              <h1 className="truncate text-sm font-bold text-zinc-200">
                {activeThread.title}
              </h1>
            ) : (
              <h1 className="text-sm font-semibold text-zinc-500">
                Select or create a session →
              </h1>
            )}
            {activeThread && (
              <p className="text-[10px] text-zinc-600 font-mono">{activeThread.thread_id}</p>
            )}
          </div>

          {/* Intent badge */}
          {currentIntent && (
            <StatusBadge
              label={currentIntent.replace(/_/g, ' ')}
              variant={intentVariant(currentIntent)}
            />
          )}

          {/* Streaming badge */}
          {isStreaming && (
            <div className="flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-950/40 px-2.5 py-1 text-[10px] font-semibold text-cyan-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
              Executing
            </div>
          )}
        </div>

        {/* Action Controls & System Status */}
        <div className="flex items-center gap-3 shrink-0 ml-auto sm:ml-0">
          {/* Active Dataset Status pill */}
          {datasetStatus?.active && (
            <div className="flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-950/30 px-3 py-1 text-[11px] font-semibold text-cyan-400">
              <Database size={11} className="text-cyan-400" />
              <span>Dataset active ({datasetStatus.row_count} rows)</span>
            </div>
          )}

          {/* Live Data Stream Controls */}
          <div className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 p-1">
            {isLiveStreaming ? (
              // Stop button when streaming is active
              <button
                onClick={handleStopStream}
                disabled={togglingStream}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition bg-rose-950/60 border border-rose-500/30 text-rose-400 hover:bg-rose-950"
              >
                {togglingStream ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <StopCircle size={12} className="fill-rose-400/20" />
                )}
                Stop Stream
              </button>
            ) : (
              // Config button when idle — opens the modal
              <button
                onClick={() => setIsConfigModalOpen(true)}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700"
              >
                <Play size={12} className="text-emerald-400 fill-emerald-400/20" />
                Live Data Stream
                <Settings size={10} className="text-zinc-500 ml-0.5" />
              </button>
            )}
            {isLiveStreaming && (
              <>
                <span className="relative flex h-2 w-2 mx-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-[10px] font-mono text-emerald-400 font-bold pr-1.5 animate-pulse">
                  {totalLiveEvents} events
                </span>
                {/* Gear to re-configure while active */}
                <button
                  onClick={() => setIsConfigModalOpen(true)}
                  title="Reconfigure stream"
                  className="rounded-md p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition"
                >
                  <Settings size={12} />
                </button>
              </>
            )}
          </div>

          {/* Upload Custom Dataset button */}
          <button
            onClick={() => {
              setIsModalOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-cyan-500 hover:shadow hover:shadow-cyan-500/20"
          >
            <Upload size={13} />
            Upload Dataset
          </button>

          <div className="h-4 w-px bg-zinc-800" />

          {/* API Live badge */}
          <div className="hidden sm:flex items-center gap-1.5 text-[11px]">
            <Wifi size={12} className="text-emerald-400" />
            <span className="text-emerald-400 font-semibold">API Live</span>
          </div>

          {/* Live Clock */}
          <div className="hidden md:flex items-center gap-1.5 text-[11px] font-mono text-zinc-500">
            <Clock size={11} />
            {currentTime}
          </div>

          <div className="h-4 w-px bg-zinc-800" />

          {/* Logout Button */}
          <button
            onClick={onLogout}
            title="Sign out"
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/80 px-2.5 py-1.5 text-xs font-semibold text-zinc-400 hover:text-rose-400 hover:bg-zinc-700/80 transition"
          >
            <LogOut size={13} />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* ── Dataset Upload Modal ──────────────────────── */}
      <DatasetUploadModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onRefreshDatasetStatus={onRefreshDatasetStatus}
      />

      {/* ── Stream Configuration Modal ────────────────── */}
      <StreamConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        onStart={handleStartStream}
        isStarting={isStartingStream}
      />
    </>
  );
}
