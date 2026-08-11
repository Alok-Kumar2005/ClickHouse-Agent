'use client';
// ============================================================
// components/chat/MessageBubble.tsx
// Routes user vs assistant messages
// ============================================================
import { motion } from 'framer-motion';
import { User } from 'lucide-react';
import { ChatMessage } from '@/types';
import { AssistantMessage } from './AssistantMessage';

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  if (message.role === 'assistant') {
    return <AssistantMessage message={message} />;
  }

  // ── User message ─────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, x: 12 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      transition={{ duration: 0.25 }}
      className="flex items-start justify-end gap-3 py-2"
    >
      <div className="max-w-[75%] min-w-0">
        <div className="rounded-2xl rounded-tr-sm bg-gradient-to-br from-zinc-700 to-zinc-800 border border-zinc-600/40 px-4 py-3">
          <p className="text-sm text-zinc-100 leading-relaxed whitespace-pre-wrap">{message.content}</p>
        </div>
        <p className="mt-1 text-right text-[10px] text-zinc-600">
          {message.timestamp.toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit'
          })}
        </p>
      </div>
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-700 border border-zinc-600/60">
        <User size={14} className="text-zinc-300" />
      </div>
    </motion.div>
  );
}
