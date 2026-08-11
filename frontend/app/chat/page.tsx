'use client';
// ============================================================
// app/chat/page.tsx — Main War Room Shell
// 2-column layout: Sidebar + Chat workspace
// ============================================================
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { PanelLeftClose, PanelLeftOpen, Database, Wifi, Clock } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { useChat } from '@/hooks/useChat';
import { useThreads } from '@/hooks/useThreads';
import { Sidebar } from '@/components/layout/Sidebar';
import { MessageStream } from '@/components/chat/MessageStream';
import { InputBar } from '@/components/chat/InputBar';
import { StatusBadge, intentVariant } from '@/components/ui/StatusBadge';
import { ThreadSchema } from '@/types';

const MAX_MESSAGES_PER_THREAD = 20;

function generateCleanTitle(prompt: string): string {
  const clean = prompt.trim();
  if (!clean) return 'New Session';
  const words = clean.split(/\s+/);
  let title = words.slice(0, 5).join(' ');
  if (title.length > 30) {
    title = title.substring(0, 27) + '...';
  } else if (words.length > 5) {
    title = title + '...';
  }
  const minorWords = ['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'from', 'by', 'of', 'in'];
  return title
    .split(' ')
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index === 0 || index === words.length - 1 || !minorWords.includes(lower)) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      return lower;
    })
    .join(' ');
}

export default function ChatPage() {
  const router = useRouter();
  const { user, isAuthenticated, isReady, logout } = useAuth();
  const { messages, isStreaming, error, sendMessage, cancelStream, clearMessages } = useChat();
  const { threads, loading, loadThreads, addThread, renameThread, removeThread } = useThreads();

  const [activeThread, setActiveThread] = useState<ThreadSchema | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentTime, setCurrentTime] = useState('');

  // Auth guard
  useEffect(() => {
    if (isReady && !isAuthenticated) {
      router.replace('/auth');
    }
  }, [isReady, isAuthenticated, router]);

  // Live clock in header
  useEffect(() => {
    const update = () =>
      setCurrentTime(
        new Date().toLocaleTimeString('en-US', {
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        })
      );
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, []);

  // Update activeThread reference when the threads list updates to keep titles synced
  useEffect(() => {
    if (activeThread) {
      const current = threads.find((t) => t.thread_id === activeThread.thread_id);
      if (current && current.title !== activeThread.title) {
        setActiveThread(current);
      }
    }
  }, [threads, activeThread]);

  function handleSelectThread(thread: ThreadSchema) {
    setActiveThread(thread);
    clearMessages();
  }

  function handleNewThread(thread: ThreadSchema) {
    setActiveThread(thread);
    clearMessages();
  }

  function handleLogout() {
    logout();
    router.replace('/auth');
  }

  async function handleDeleteThread(threadId: string) {
    try {
      await removeThread(threadId);
      if (activeThread?.thread_id === threadId) {
        const remaining = threads.filter((t) => t.thread_id !== threadId);
        if (remaining.length > 0) {
          handleSelectThread(remaining[0]);
        } else {
          const fresh = await addThread('New Session');
          handleNewThread(fresh);
        }
      }
    } catch (err) {
      console.error('Failed to delete thread:', err);
    }
  }

  async function handleSend(message: string) {
    if (!activeThread) return;

    const isFirstMessage = messages.length === 0;
    const isDefaultTitle =
      activeThread.title.toLowerCase() === 'new session' ||
      activeThread.title.toLowerCase() === 'new chat';

    if (isFirstMessage && isDefaultTitle) {
      const generatedTitle = generateCleanTitle(message);
      try {
        // Optimistic active title update
        setActiveThread((prev) => prev ? { ...prev, title: generatedTitle } : null);
        await renameThread(activeThread.thread_id, generatedTitle);
      } catch (err) {
        console.error('Failed to auto-title thread:', err);
      }
    }

    sendMessage(message, activeThread.thread_id);
  }

  const isLimitReached = messages.length >= MAX_MESSAGES_PER_THREAD;

  // Derive the current intent from the last assistant message
  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant');
  const currentIntent = lastAssistantMsg?.intent;

  if (!isReady) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-cyan-400" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-full bg-zinc-950">
      {/* ── Sidebar ──────────────────────────────── */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            key="sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 256, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden shrink-0"
            style={{ height: '100vh' }}
          >
            <Sidebar
              userId={user.user_id}
              email={user.email}
              activeThreadId={activeThread?.thread_id ?? null}
              onSelectThread={handleSelectThread}
              onNewThread={handleNewThread}
              onLogout={handleLogout}
              threads={threads}
              loading={loading}
              loadThreads={loadThreads}
              addThread={addThread}
              renameThread={renameThread}
              removeThread={handleDeleteThread}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main workspace ──────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header bar */}
        <header className="flex items-center justify-between border-b border-zinc-800/80 bg-zinc-900/60 px-4 py-3 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {/* Sidebar toggle */}
            <button
              onClick={() => setSidebarOpen((v) => !v)}
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

          {/* Right-side system status */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-zinc-600">
              <Wifi size={12} className="text-emerald-400" />
              <span className="text-emerald-400 font-semibold">API Live</span>
            </div>
            <div className="hidden md:flex items-center gap-1.5 text-[11px] text-zinc-600">
              <Database size={12} className="text-zinc-500" />
              <span>ClickHouse</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500">
              <Clock size={11} />
              {currentTime}
            </div>
          </div>
        </header>

        {/* ── Chat area ────────────────────────── */}
        {activeThread ? (
          <>
            <MessageStream messages={messages} isStreaming={isStreaming} />

            {/* Limit Warning Banner */}
            {isLimitReached && (
              <div className="mx-4 mb-2 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-950/50 px-4 py-3 text-sm text-amber-400">
                ⚠️ Context window limit reached for this session. Please start a + New Session to continue querying.
              </div>
            )}

            {/* Error banner */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="mx-4 mb-2 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/50 px-4 py-3 text-sm text-rose-400"
                >
                  ⚠️ {error}
                </motion.div>
              )}
            </AnimatePresence>

            <InputBar
              disabled={!activeThread || isLimitReached}
              isStreaming={isStreaming}
              onSend={handleSend}
              onCancel={cancelStream}
            />
          </>
        ) : (
          /* No thread selected — onboarding prompt */
          <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
            <div className="relative">
              <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-zinc-800 to-zinc-900 border border-zinc-700/60 flex items-center justify-center">
                <Database size={36} className="text-zinc-600" />
              </div>
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-emerald-400 border-2 border-zinc-950 animate-pulse" />
            </div>
            <div>
              <h2 className="text-xl font-black text-zinc-300 mb-2">
                Create your first session
              </h2>
              <p className="text-sm text-zinc-500 max-w-xs">
                Click <strong className="text-cyan-400">+ New Session</strong> in the sidebar to start analyzing box office data with AI.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

