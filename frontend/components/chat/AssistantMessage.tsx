'use client';
// ============================================================
// components/chat/AssistantMessage.tsx
// Full rich agent response renderer
// ============================================================
import { motion } from 'framer-motion';
import { Bot, Sparkles } from 'lucide-react';
import { ChatMessage } from '@/types';
import { ReasoningSteps } from '@/components/agent/ReasoningSteps';
import { SqlTerminal } from '@/components/agent/SqlTerminal';
import { DataCanvas } from '@/components/agent/DataCanvas';
import { ActionCards } from '@/components/agent/ActionCards';
import { StatusBadge, intentVariant } from '@/components/ui/StatusBadge';

interface AssistantMessageProps {
  message: ChatMessage;
}

export function AssistantMessage({ message }: AssistantMessageProps) {
  const hasReasoning  = message.reasoning_steps.length > 0 || message.isStreaming;
  const hasSql        = !!message.generated_sql;
  const hasData       = !!(message.query_results?.length);
  const hasActions    = !!(message.recommended_actions?.length);
  const hasContent    = !!message.content;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="flex items-start gap-3 py-2"
    >
      {/* Avatar */}
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-700 shadow shadow-cyan-500/20">
        <Bot size={15} className="text-white" />
      </div>

      <div className="flex-1 min-w-0 space-y-3">
        {/* Header row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-zinc-300">BoxOfficePulse AI</span>
          {message.intent && (
            <StatusBadge
              label={message.intent.replace(/_/g, ' ')}
              variant={intentVariant(message.intent)}
            />
          )}
          {message.isStreaming && (
            <span className="flex items-center gap-1 text-[10px] text-cyan-400">
              <Sparkles size={10} className="animate-pulse" />
              Streaming...
            </span>
          )}
        </div>

        {/* Reasoning Steps */}
        {hasReasoning && (
          <ReasoningSteps
            steps={message.reasoning_steps}
            isStreaming={message.isStreaming}
          />
        )}

        {/* SQL Terminal */}
        {hasSql && <SqlTerminal sql={message.generated_sql!} />}

        {/* Data Canvas */}
        {hasData && <DataCanvas results={message.query_results!} />}

        {/* Action Cards */}
        {hasActions && <ActionCards actions={message.recommended_actions!} />}

        {/* Main text content */}
        {hasContent && (
          <div className="prose prose-invert prose-sm max-w-none">
            <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
              {message.content}
            </p>
          </div>
        )}

        {/* Streaming skeleton when no content yet */}
        {message.isStreaming && !hasContent && !hasReasoning && (
          <div className="space-y-2">
            <div className="h-3 animate-pulse rounded bg-zinc-700/60 w-3/4" />
            <div className="h-3 animate-pulse rounded bg-zinc-700/40 w-1/2" />
          </div>
        )}

        <p className="text-[10px] text-zinc-600">
          {message.timestamp.toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit', second: '2-digit'
          })}
        </p>
      </div>
    </motion.div>
  );
}
