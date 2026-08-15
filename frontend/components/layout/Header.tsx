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
  CheckCircle,
  AlertTriangle,
  FileText,
  X,
  LogOut
} from 'lucide-react';
import { ThreadSchema } from '@/types';
import { triggerSimulator, uploadDataset } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { StatusBadge, intentVariant } from '@/components/ui/StatusBadge';

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
}: HeaderProps) {
  const { showToast } = useToast();
  const [injecting, setInjecting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Upload modal states
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSuccess, setUploadSuccess] = useState<{
    rows: number;
    columns: string[];
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Trigger Live Stream injection
  async function handleInjectStream() {
    setInjecting(true);
    try {
      const res = await triggerSimulator(10);
      showToast(res.message || 'Injected 10 new live ticket sales into ClickHouse Cloud!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to inject live stream telemetry.', 'error');
    } finally {
      setInjecting(false);
    }
  }

  // Handle Drag & Drop events
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  // Drag leave handler
  function handleDragLeave() {
    setIsDragging(false);
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processUpload(file);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      await processUpload(file);
    }
  }

  async function processUpload(file: File) {
    if (!file.name.endsWith('.csv') && !file.name.endsWith('.txt')) {
      setUploadError('Invalid file type. Only CSV and TXT files are accepted.');
      return;
    }

    setUploading(true);
    setUploadProgress(15);
    setUploadError(null);
    setUploadSuccess(null);

    // Simulated progress bar ticker
    const timer = setInterval(() => {
      setUploadProgress((p) => (p < 85 ? p + 10 : p));
    }, 150);

    try {
      const response = await uploadDataset(file);
      clearInterval(timer);
      setUploadProgress(100);
      
      // Delay transition to success state to let user see completion animation
      setTimeout(() => {
        setUploadSuccess({
          rows: response.rows_inserted,
          columns: response.columns,
        });
        setUploading(false);
        onRefreshDatasetStatus();
        showToast(`Successfully uploaded custom dataset: ${response.rows_inserted} rows loaded.`, 'success');
      }, 500);
    } catch (err: any) {
      clearInterval(timer);
      setUploading(false);
      setUploadError(err.message || 'Failed to process dataset. Ensure ClickHouse connection is online.');
    }
  }

  function resetUploadState() {
    setUploadSuccess(null);
    setUploadError(null);
    setUploading(false);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
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

          {/* Inject Live Stream button */}
          <button
            onClick={handleInjectStream}
            disabled={injecting}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/80 px-2.5 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-zinc-700/80 hover:text-zinc-100 disabled:opacity-50"
          >
            {injecting ? (
              <Loader2 size={13} className="animate-spin text-cyan-400" />
            ) : (
              <Play size={13} className="text-cyan-400 fill-cyan-400/20" />
            )}
            Inject Live Stream
          </button>

          {/* Upload Custom Dataset button */}
          <button
            onClick={() => {
              resetUploadState();
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

      {/* ── Drag & Drop CSV Uploader Modal ──────────────────────── */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!uploading) setIsModalOpen(false);
              }}
              className="absolute inset-0 bg-zinc-950/70 backdrop-blur-sm"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="relative w-full max-w-md overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl"
            >
              {/* Close Button */}
              <button
                onClick={() => setIsModalOpen(false)}
                disabled={uploading}
                className="absolute right-3.5 top-3.5 rounded-lg p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-30"
              >
                <X size={16} />
              </button>

              {/* Modal Header */}
              <div className="border-b border-zinc-800 px-6 py-4">
                <h3 className="text-sm font-bold text-zinc-200">Upload Custom CSV Dataset</h3>
                <p className="text-xs text-zinc-500 mt-1">
                  Ingest files dynamically into the <code className="text-cyan-400 font-mono">custom_user_sales</code> ClickHouse table.
                </p>
              </div>

              {/* Modal Body / Upload Zone */}
              <div className="p-6">
                {!uploading && !uploadSuccess && (
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-8 px-4 text-center cursor-pointer transition ${
                      isDragging
                        ? 'border-cyan-500 bg-cyan-950/20 text-zinc-200'
                        : 'border-zinc-700 bg-zinc-800/40 text-zinc-400 hover:border-zinc-600 hover:bg-zinc-800/60'
                    }`}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      accept=".csv,.txt"
                      className="hidden"
                    />
                    <div className="mb-3 rounded-full bg-zinc-800 p-3 text-cyan-400 shadow shadow-zinc-950/50">
                      <Upload size={20} />
                    </div>
                    <p className="text-xs font-bold text-zinc-300">
                      Drag & drop your CSV or TXT file here
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      or click to browse from your device
                    </p>
                  </div>
                )}

                {/* Uploading State with progress indicator */}
                {uploading && (
                  <div className="flex flex-col items-center py-6">
                    <Loader2 className="animate-spin text-cyan-400 mb-4" size={32} />
                    <p className="text-xs font-semibold text-zinc-300">Processing custom dataset...</p>
                    <p className="text-[10px] text-zinc-500 mt-1">Normalizing schema & executing inserts</p>
                    
                    {/* Progress Bar container */}
                    <div className="mt-4 w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-cyan-500 to-blue-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${uploadProgress}%` }}
                        transition={{ duration: 0.1 }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-zinc-400 mt-2">{uploadProgress}%</span>
                  </div>
                )}

                {/* Success State */}
                {uploadSuccess && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-950/25 p-4 text-emerald-400">
                      <CheckCircle size={20} className="shrink-0" />
                      <div>
                        <p className="text-xs font-bold">Upload Complete!</p>
                        <p className="text-[11px] opacity-90 mt-0.5">
                          Successfully loaded <span className="font-bold font-mono">{uploadSuccess.rows}</span> records.
                        </p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-300 mb-2.5">
                        <FileText size={13} className="text-cyan-400" />
                        <span>Active Columns ({uploadSuccess.columns.length})</span>
                      </div>
                      <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto custom-scrollbar">
                        {uploadSuccess.columns.map((col) => (
                          <span
                            key={col}
                            className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-400 border border-zinc-700/50"
                          >
                            {col}
                          </span>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => setIsModalOpen(false)}
                      className="w-full rounded-lg bg-zinc-800 py-2.5 text-xs font-bold text-zinc-200 transition hover:bg-zinc-700"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {/* Error State */}
                {uploadError && (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-950/25 p-4 text-rose-400">
                      <AlertTriangle size={20} className="shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold">Ingestion Failed</p>
                        <p className="text-[11px] opacity-90 mt-1 leading-relaxed">
                          {uploadError}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={resetUploadState}
                        className="flex-1 rounded-lg bg-cyan-600 py-2 text-xs font-bold text-white transition hover:bg-cyan-500"
                      >
                        Try Again
                      </button>
                      <button
                        onClick={() => setIsModalOpen(false)}
                        className="flex-1 rounded-lg bg-zinc-800 py-2 text-xs font-bold text-zinc-300 transition hover:bg-zinc-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
