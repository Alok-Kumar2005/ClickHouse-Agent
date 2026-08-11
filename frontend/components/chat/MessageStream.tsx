'use client';
// ============================================================
// components/chat/MessageStream.tsx
// Scrollable message list with auto-scroll to bottom
// ============================================================
import { useEffect, useRef } from 'react';
import { ChatMessage } from '@/types';
import { MessageBubble } from './MessageBubble';
import { Sparkles } from 'lucide-react';

interface MessageStreamProps {
  messages: ChatMessage[];
  isStreaming: boolean;
}

export function MessageStream({ messages, isStreaming }: MessageStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/20 to-cyan-700/10 border border-cyan-500/20">
          <Sparkles size={28} className="text-cyan-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-zinc-200 mb-1">War Room Ready</h2>
          <p className="text-sm text-zinc-500 max-w-sm">
            Ask BoxOfficePulse AI anything about ticket revenue, theater occupancy, anomaly detection, or operational recommendations.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2 mt-2">
          {['📊 Total ticket revenue?', '🎭 NYC theater occupancy for Dune', '🚨 Low performing shows'].map((hint) => (
            <span
              key={hint}
              className="rounded-full border border-zinc-700/60 bg-zinc-800/60 px-3 py-1.5 text-xs text-zinc-400"
            >
              {hint}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-4 py-4 custom-scrollbar">
      <div className="mx-auto w-full max-w-4xl space-y-1">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </div>
      <div ref={bottomRef} />
    </div>
  );
}
