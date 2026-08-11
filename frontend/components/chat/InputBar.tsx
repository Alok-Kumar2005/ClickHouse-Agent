'use client';
// ============================================================
// components/chat/InputBar.tsx
// Prompt shortcuts + auto-resize textarea + SSE indicator
// ============================================================
import { useState, useRef, useCallback } from 'react';
import { Send, Zap, Ticket, AlertTriangle, Square } from 'lucide-react';

interface InputBarProps {
  disabled?: boolean;
  isStreaming?: boolean;
  onSend: (message: string) => void;
  onCancel?: () => void;
}

const SHORTCUTS = [
  { icon: <Zap size={12} />, label: 'Total revenue', prompt: 'What is total ticket revenue?' },
  { icon: <Ticket size={12} />, label: 'Theater occupancy', prompt: 'Show NYC theater occupancy for Dune' },
  { icon: <AlertTriangle size={12} />, label: 'Low performers', prompt: 'Detect low performing shows and recommend action' },
];

export function InputBar({ disabled, isStreaming, onSend, onCancel }: InputBarProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const msg = value.trim();
    if (!msg || disabled) return;
    onSend(msg);
    setValue('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, disabled, onSend]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInput() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }

  function useShortcut(prompt: string) {
    setValue(prompt);
    textareaRef.current?.focus();
  }

  return (
    <div className="border-t border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md px-4 py-3">
      <div className="mx-auto w-full max-w-4xl space-y-2">
        {/* Prompt shortcuts */}
        <div className="flex flex-wrap gap-1.5">
          {SHORTCUTS.map((s) => (
            <button
              key={s.label}
              onClick={() => useShortcut(s.prompt)}
              disabled={disabled}
              className="flex items-center gap-1.5 rounded-full border border-zinc-700/60 bg-zinc-800/60 px-3 py-1.5 text-[11px] font-medium text-zinc-400 transition hover:border-zinc-600 hover:bg-zinc-700/60 hover:text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="text-cyan-400">{s.icon}</span>
              {s.label}
            </button>
          ))}

          {/* SSE streaming indicator */}
          {isStreaming && (
            <div className="ml-auto flex items-center gap-1.5 text-[11px] text-cyan-400">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
              Agent streaming...
            </div>
          )}
        </div>

        {/* Input row */}
        <div className="flex items-end gap-2 rounded-2xl border border-zinc-700/60 bg-zinc-800/60 px-4 py-3 focus-within:border-cyan-500/40 focus-within:ring-1 focus-within:ring-cyan-500/20 transition">
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder="Ask the War Room AI… (Shift+Enter for newline)"
            className="flex-1 resize-none bg-transparent text-sm text-zinc-200 placeholder-zinc-600 outline-none leading-relaxed disabled:opacity-40"
            style={{ maxHeight: '160px', overflowY: 'auto' }}
          />

          {isStreaming ? (
            <button
              onClick={onCancel}
              title="Cancel stream"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-400 transition hover:bg-rose-500/30"
            >
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!value.trim() || !!disabled}
              title="Send message"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-cyan-500 text-white shadow shadow-cyan-500/30 transition hover:bg-cyan-400 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Send size={14} />
            </button>
          )}
        </div>

        <p className="text-center text-[10px] text-zinc-700">
          BoxOfficePulse AI • Powered by LangGraph + ClickHouse
        </p>
      </div>
    </div>
  );
}
