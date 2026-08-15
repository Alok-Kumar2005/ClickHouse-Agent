'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  Loader2,
  CheckCircle,
  AlertTriangle,
  FileText,
  X,
  Download,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { uploadDataset, fetchDatasetTemplate } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

interface DatasetUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshDatasetStatus: () => Promise<void>;
}

export function DatasetUploadModal({
  isOpen,
  onClose,
  onRefreshDatasetStatus,
}: DatasetUploadModalProps) {
  const { showToast } = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSuccess, setUploadSuccess] = useState<{
    rows: number;
    columns: string[];
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showFormatGuidance, setShowFormatGuidance] = useState(false);
  const [templateInfo, setTemplateInfo] = useState<{
    required_columns: string[];
    sample_row: Record<string, any>;
    guidance: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch template info on mount
  useEffect(() => {
    async function loadTemplate() {
      try {
        const data = await fetchDatasetTemplate();
        setTemplateInfo(data);
      } catch (err) {
        console.error('Failed to load dataset template info:', err);
        // Fallback info
        setTemplateInfo({
          required_columns: ["movie_title", "ticket_price", "theater_id"],
          sample_row: { "movie_title": "Dune 2", "ticket_price": 18.5, "theater_id": "TH-102" },
          guidance: "Files must be UTF-8 encoded CSV. Headers are auto-sanitized."
        });
      }
    }
    if (isOpen) {
      loadTemplate();
    }
  }, [isOpen]);

  // Handle Drag & Drop events
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await validateAndProcessUpload(file);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      await validateAndProcessUpload(file);
    }
  }

  // Pre-validate CSV headers before uploading
  function validateCSVHeaders(file: File): Promise<{ isValid: boolean; errorMsg?: string }> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        if (!text || text.trim() === '') {
          resolve({ isValid: false, errorMsg: 'The uploaded file is empty.' });
          return;
        }

        const firstLine = text.split('\n')[0];
        const headers = firstLine
          .split(',')
          .map((h) => h.trim().toLowerCase().replace(/^["']|["']$/g, '').replace(/[^a-z0-9_]/g, '_'));

        const required = templateInfo?.required_columns || ["movie_title", "ticket_price", "theater_id"];
        const missing = required.filter((col) => !headers.includes(col));

        if (missing.length > 0) {
          resolve({
            isValid: false,
            errorMsg: `Missing critical column headers: ${missing.join(', ')}. Please ensure your CSV contains these columns.`,
          });
        } else {
          resolve({ isValid: true });
        }
      };
      reader.onerror = () => {
        resolve({ isValid: false, errorMsg: 'Failed to read file contents for header validation.' });
      };
      // Read first 2048 bytes of the file to grab headers without loading entire huge files
      const blobSlice = file.slice(0, 2048);
      reader.readAsText(blobSlice);
    });
  }

  async function validateAndProcessUpload(file: File) {
    if (!file.name.endsWith('.csv') && !file.name.endsWith('.txt')) {
      setUploadError('Invalid file type. Only CSV and TXT files are accepted.');
      return;
    }

    setUploading(true);
    setUploadProgress(10);
    setUploadError(null);
    setUploadSuccess(null);

    // Validate headers
    const validation = await validateCSVHeaders(file);
    if (!validation.isValid) {
      setUploading(false);
      setUploadError(validation.errorMsg || 'CSV validation failed.');
      return;
    }

    // Simulated progress bar ticker
    setUploadProgress(30);
    const timer = setInterval(() => {
      setUploadProgress((p) => (p < 85 ? p + 8 : p));
    }, 150);

    try {
      const response = await uploadDataset(file);
      clearInterval(timer);
      setUploadProgress(100);

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

  function handleDownloadTemplate() {
    const required = templateInfo?.required_columns || ["movie_title", "ticket_price", "theater_id"];
    const sample = templateInfo?.sample_row || { "movie_title": "Dune 2", "ticket_price": 18.5, "theater_id": "TH-102" };
    
    // Generate CSV contents
    const headers = required.join(',');
    const rowValues = required.map(col => {
      const val = sample[col];
      if (typeof val === 'string' && val.includes(',')) {
        return `"${val}"`;
      }
      return val ?? '';
    }).join(',');

    const csvContent = `${headers}\n${rowValues}\n"Avatar 3",22.00,"th_nyc_01"\n"Oppenheimer",15.00,"th_la_02"\n`;
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "ticket_sales_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Template downloaded successfully!", "success");
  }

  function resetUploadState() {
    setUploadSuccess(null);
    setUploadError(null);
    setUploading(false);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
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
            onClick={() => {
              if (!uploading) onClose();
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
              onClick={onClose}
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
            <div className="p-6 space-y-4">
              
              {/* Guidance Accordion */}
              <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowFormatGuidance(!showFormatGuidance)}
                  className="flex w-full items-center justify-between px-4 py-3 text-xs font-bold text-zinc-300 hover:bg-zinc-800/35 transition"
                >
                  <span className="flex items-center gap-2">
                    <FileText size={14} className="text-cyan-400" />
                    View Required Format
                  </span>
                  {showFormatGuidance ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                <AnimatePresence>
                  {showFormatGuidance && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      exit={{ height: 0 }}
                      className="overflow-hidden border-t border-zinc-800/60"
                    >
                      <div className="p-4 space-y-3 text-[11px] text-zinc-400">
                        <div>
                          <p className="font-semibold text-zinc-300 mb-1">Supported Columns:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {(templateInfo?.required_columns || ["movie_title", "ticket_price", "theater_id"]).map((col) => (
                              <span
                                key={col}
                                className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-cyan-400 border border-zinc-700/50"
                              >
                                {col}
                              </span>
                            ))}
                          </div>
                        </div>

                        {templateInfo?.guidance && (
                          <div>
                            <p className="font-semibold text-zinc-300 mb-0.5">Instructions:</p>
                            <p className="leading-relaxed opacity-95">{templateInfo.guidance}</p>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={handleDownloadTemplate}
                          className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/80 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 transition hover:bg-zinc-700/80 hover:text-zinc-100"
                        >
                          <Download size={12} className="text-cyan-400" />
                          Download Sample CSV Template
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

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
                    onClick={() => {
                      resetUploadState();
                      onClose();
                    }}
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
                      Reset / Upload Another
                    </button>
                    <button
                      onClick={() => {
                        resetUploadState();
                        onClose();
                      }}
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
  );
}
