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
import { Header } from '@/components/layout/Header';
import { fetchDatasetStatus, fetchLiveStreamStatus } from '@/lib/api';

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
  const { 
    messages, 
    isStreaming, 
    error, 
    sendMessage, 
    cancelStream, 
    clearMessages,
    loadHistory,
    isLoadingHistory
  } = useChat();
  const { threads, loading, loadThreads, addThread, renameThread, removeThread } = useThreads();

  const [activeThread, setActiveThread] = useState<ThreadSchema | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentTime, setCurrentTime] = useState('');
  const [datasetStatus, setDatasetStatus] = useState<{
    active: boolean;
    row_count: number;
    columns: string[];
  } | null>(null);

  const loadDatasetStatus = useCallback(async () => {
    try {
      const status = await fetchDatasetStatus();
      setDatasetStatus(status);
    } catch (err) {
      console.error('Failed to fetch dataset status:', err);
    }
  }, []);

  // Fetch dataset status on mount
  useEffect(() => {
    loadDatasetStatus();
  }, [loadDatasetStatus]);

  const [isLiveStreaming, setIsLiveStreaming] = useState(false);
  const [totalLiveEvents, setTotalLiveEvents] = useState(0);

  const loadLiveStreamStatus = useCallback(async () => {
    try {
      const status = await fetchLiveStreamStatus();
      setIsLiveStreaming(status.is_active);
      setTotalLiveEvents(status.total_events_ingested);
    } catch (err) {
      console.error('Failed to fetch live stream status:', err);
    }
  }, []);

  // Poll live stream status every 2 seconds
  useEffect(() => {
    loadLiveStreamStatus();
    const interval = setInterval(loadLiveStreamStatus, 2000);
    return () => clearInterval(interval);
  }, [loadLiveStreamStatus]);

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

  async function handleSelectThread(thread: ThreadSchema) {
    setActiveThread(thread);
    clearMessages();
    await loadHistory(thread.thread_id);
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
        <Header
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          activeThread={activeThread}
          currentIntent={currentIntent}
          isStreaming={isStreaming}
          currentTime={currentTime}
          datasetStatus={datasetStatus}
          onRefreshDatasetStatus={loadDatasetStatus}
          onLogout={handleLogout}
          isLiveStreaming={isLiveStreaming}
          totalLiveEvents={totalLiveEvents}
          onRefreshLiveStreamStatus={loadLiveStreamStatus}
        />

        {/* ── Chat area ────────────────────────── */}
        {activeThread ? (
          <>
            {/* Context Aware Active Dataset Indicator */}
            {datasetStatus?.active && (
              <div className="mx-4 mt-3 flex items-center justify-between rounded-xl border border-cyan-500/20 bg-cyan-950/20 px-4 py-2.5 text-xs text-cyan-400 backdrop-blur-sm shadow shadow-cyan-950/30">
                <div className="flex items-center gap-2">
                  <Database size={13} className="animate-pulse shrink-0" />
                  <span className="font-bold">Dataset Context Active:</span>
                  <span className="font-mono bg-cyan-950/50 px-1.5 py-0.5 rounded border border-cyan-500/10">custom_user_sales</span>
                  <span className="opacity-80">({datasetStatus.row_count} rows, {datasetStatus.columns.length} columns)</span>
                </div>
                <div className="text-[10px] text-zinc-500 font-medium hidden md:block">
                  Ask the agent directly regarding your custom dataset or live box office metrics
                </div>
              </div>
            )}
            {isLoadingHistory ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-cyan-400" />
              </div>
            ) : (
              <MessageStream messages={messages} isStreaming={isStreaming} />
            )}

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

            {/* Live streaming context chip above input bar */}
            {isLiveStreaming && (
              <div className="mx-4 mb-2 flex items-center justify-between rounded-xl border border-rose-500/20 bg-rose-950/20 px-4 py-2.5 text-xs text-rose-400 backdrop-blur-sm shadow shadow-rose-950/30">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                  </span>
                  <span className="font-bold">🔴 Live Feed Ingesting (20 rec/sec)</span>
                  <span className="opacity-80">({totalLiveEvents.toLocaleString()} records total)</span>
                </div>
                <div className="text-[10px] text-zinc-500 font-medium hidden md:block">
                  Real-time ticket sales streaming is active. Ask BoxOfficePulse about live metrics!
                </div>
              </div>
            )}

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

