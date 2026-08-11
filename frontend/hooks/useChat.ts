'use client';
// ============================================================
// hooks/useChat.ts — Chat with SSE streaming support
// Accumulates SSE payloads into a single ChatMessage
// ============================================================
import { useState, useCallback, useRef } from 'react';
import { ChatMessage, SSEPayload } from '@/types';
import { openChatStream } from '@/lib/sse';

// Fallback to uuid without package if unavailable
function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  const sendMessage = useCallback(
    (text: string, threadId: string) => {
      if (!text.trim() || !threadId) return;

      const userMsg: ChatMessage = {
        id: genId(),
        role: 'user',
        content: text,
        timestamp: new Date(),
        reasoning_steps: [],
      };

      // Placeholder assistant message (streaming)
      const assistantId = genId();
      const assistantPlaceholder: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        reasoning_steps: [],
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantPlaceholder]);
      setIsStreaming(true);
      setError(null);

      const cancel = openChatStream(text, threadId, {
        onEvent: (payload: SSEPayload) => {
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id !== assistantId) return msg;
              return {
                ...msg,
                // Merge incoming reasoning steps (deduplicate)
                reasoning_steps: Array.from(
                  new Set([...msg.reasoning_steps, ...(payload.reasoning_steps ?? [])])
                ),
                intent: payload.intent ?? msg.intent,
                generated_sql: payload.generated_sql ?? msg.generated_sql,
                query_results: payload.query_results ?? msg.query_results,
                recommended_actions: payload.recommended_actions ?? msg.recommended_actions,
                // Update content if message text available
                ...(payload.message ? { content: payload.message } : {}),
              };
            })
          );
        },
        onDone: () => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId ? { ...msg, isStreaming: false } : msg
            )
          );
          setIsStreaming(false);
        },
        onError: (err) => {
          setError(err.message);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId
                ? { ...msg, content: `⚠️ Error: ${err.message}`, isStreaming: false }
                : msg
            )
          );
          setIsStreaming(false);
        },
      });

      cancelRef.current = cancel;
    },
    []
  );

  const cancelStream = useCallback(() => {
    cancelRef.current?.();
    setIsStreaming(false);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, isStreaming, error, sendMessage, cancelStream, clearMessages };
}
