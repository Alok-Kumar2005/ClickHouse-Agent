'use client';
// ============================================================
// hooks/useThreads.ts — Thread CRUD with API
// ============================================================
import { useState, useCallback } from 'react';
import { ThreadSchema } from '@/types';
import { fetchThreads, createThread, updateThread, deleteThread } from '@/lib/api';

export function useThreads() {
  const [threads, setThreads] = useState<ThreadSchema[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadThreads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchThreads();
      setThreads(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load threads');
    } finally {
      setLoading(false);
    }
  }, []);

  const addThread = useCallback(async (title: string = 'New Session') => {
    const thread = await createThread(title);
    setThreads((prev) => [thread, ...prev]);
    return thread;
  }, []);

  const renameThread = useCallback(async (thread_id: string, newTitle: string) => {
    try {
      const updated = await updateThread(thread_id, newTitle);
      setThreads((prev) =>
        prev.map((t) => (t.thread_id === thread_id ? updated : t))
      );
      return updated;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to rename thread');
      throw e;
    }
  }, []);

  const removeThread = useCallback(async (thread_id: string) => {
    try {
      await deleteThread(thread_id);
      setThreads((prev) => prev.filter((t) => t.thread_id !== thread_id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete thread');
      throw e;
    }
  }, []);

  return { threads, loading, error, loadThreads, addThread, renameThread, removeThread, setThreads };
}

