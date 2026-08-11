import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Plus, MessageSquare, LogOut, User, Database, ChevronRight, Pencil, Trash2
} from 'lucide-react';
import { ThreadSchema } from '@/types';

interface SidebarProps {
  userId: string;
  email: string;
  activeThreadId: string | null;
  onSelectThread: (thread: ThreadSchema) => void;
  onNewThread: (thread: ThreadSchema) => void;
  onLogout: () => void;
  threads: ThreadSchema[];
  loading: boolean;
  loadThreads: () => void;
  addThread: (title?: string) => Promise<ThreadSchema>;
  renameThread: (threadId: string, title: string) => Promise<ThreadSchema>;
  removeThread: (threadId: string) => Promise<void>;
}

export function Sidebar({
  userId,
  email,
  activeThreadId,
  onSelectThread,
  onNewThread,
  onLogout,
  threads,
  loading,
  loadThreads,
  addThread,
  renameThread,
  removeThread,
}: SidebarProps) {
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  async function handleNewSession() {
    try {
      const thread = await addThread('New Session');
      onNewThread(thread);
    } catch {
      // Handled in parent/hook
    }
  }

  async function handleRenameSubmit(threadId: string, originalTitle: string) {
    const val = editTitleValue.trim();
    if (!val) {
      setEditingThreadId(null);
      return;
    }
    if (val !== originalTitle) {
      try {
        await renameThread(threadId, val);
      } catch (err) {
        console.error('Failed to rename thread:', err);
      }
    }
    setEditingThreadId(null);
  }

  function startRename(threadId: string, currentTitle: string) {
    setEditingThreadId(threadId);
    setEditTitleValue(currentTitle);
    setDeleteConfirmId(null);
  }

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r border-zinc-800/80 bg-zinc-900/60 backdrop-blur-sm">
      {/* ── Header ────────────────────────────────── */}
      <div className="border-b border-zinc-800/80 px-4 py-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-700 shadow shadow-cyan-500/30">
            <Sparkles size={16} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-none">BoxOfficePulse</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">AI Command Center</p>
          </div>
        </div>

        {/* System status */}
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-950/30 px-3 py-2">
          <Database size={12} className="text-emerald-400 shrink-0" />
          <span className="text-[11px] font-semibold text-emerald-400 truncate">
            ClickHouse Stream: ONLINE
          </span>
          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
        </div>
      </div>

      {/* ── New Session button ─────────────────────── */}
      <div className="px-3 pt-4 pb-2">
        <button
          onClick={handleNewSession}
          className="group flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2.5 text-sm font-semibold text-cyan-400 transition-all hover:border-cyan-400/50 hover:bg-cyan-500/20 hover:text-cyan-300 hover:shadow-lg hover:shadow-cyan-500/10"
        >
          <Plus size={16} className="transition-transform group-hover:rotate-90 duration-200" />
          New Session
        </button>
      </div>

      {/* ── Thread list ────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 pb-2 custom-scrollbar">
        <p className="mt-2 mb-1 px-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
          Sessions
        </p>

        {loading && (
          <div className="space-y-1.5 mt-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-zinc-800/60" />
            ))}
          </div>
        )}

        <AnimatePresence>
          {threads.map((thread) => {
            const isActive = thread.thread_id === activeThreadId;
            const isEditing = editingThreadId === thread.thread_id;
            const isDeleting = deleteConfirmId === thread.thread_id;

            return (
              <motion.div
                key={thread.thread_id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className={`group my-0.5 flex w-full items-center rounded-lg px-3 py-2.5 text-left transition-all ${
                  isActive
                    ? 'bg-cyan-500/10 text-cyan-300'
                    : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                }`}
                onClick={() => {
                  if (!isEditing && !isDeleting) {
                    onSelectThread(thread);
                  }
                }}
                style={{ cursor: isEditing || isDeleting ? 'default' : 'pointer' }}
              >
                <MessageSquare size={14} className="shrink-0 opacity-70 mr-2.5" />

                {isDeleting ? (
                  <div className="flex flex-1 items-center justify-between text-xs" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Delete?</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          removeThread(thread.thread_id);
                          setDeleteConfirmId(null);
                        }}
                        className="text-rose-400 hover:text-rose-300 font-bold text-xs"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="text-zinc-400 hover:text-zinc-200 text-xs"
                      >
                        No
                      </button>
                    </div>
                  </div>
                ) : isEditing ? (
                  <input
                    type="text"
                    value={editTitleValue}
                    onChange={(e) => setEditTitleValue(e.target.value)}
                    onBlur={() => handleRenameSubmit(thread.thread_id, thread.title)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameSubmit(thread.thread_id, thread.title);
                      if (e.key === 'Escape') setEditingThreadId(null);
                    }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-100 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 min-w-0"
                  />
                ) : (
                  <>
                    <span className="flex-1 truncate text-xs font-medium">{thread.title}</span>

                    {/* Hover actions */}
                    <div
                      className="hidden group-hover:flex items-center gap-1.5 shrink-0 ml-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => startRename(thread.thread_id, thread.title)}
                        title="Rename session"
                        className="p-1 text-zinc-500 hover:text-zinc-200 rounded hover:bg-zinc-700/60 transition"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(thread.thread_id)}
                        title="Delete session"
                        className="p-1 text-zinc-500 hover:text-rose-400 rounded hover:bg-zinc-700/60 transition"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>

                    {isActive && !isEditing && !isDeleting && (
                      <ChevronRight size={12} className="shrink-0 text-cyan-400 ml-1.5" />
                    )}
                  </>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {!loading && threads.length === 0 && (
          <p className="mt-4 text-center text-[11px] text-zinc-600">
            No sessions yet. Start one above.
          </p>
        )}
      </div>

      {/* ── User footer ────────────────────────────── */}
      <div className="border-t border-zinc-800/80 px-3 py-4">
        <div className="flex items-center gap-2.5 rounded-xl bg-zinc-800/60 px-3 py-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-700 shrink-0">
            <User size={13} className="text-zinc-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-xs font-semibold text-zinc-200">{email}</p>
            <p className="truncate text-[10px] text-zinc-600">{userId}</p>
          </div>
          <button
            onClick={onLogout}
            title="Sign out"
            className="rounded-md p-1 text-zinc-500 transition hover:bg-zinc-700 hover:text-rose-400"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

