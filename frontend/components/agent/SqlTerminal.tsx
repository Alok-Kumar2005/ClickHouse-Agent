'use client';
// ============================================================
// components/agent/SqlTerminal.tsx
// Dark syntax-highlighted SQL block with copy + timing badge
// ============================================================
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Terminal, Copy, CheckCheck, Clock } from 'lucide-react';

interface SqlTerminalProps {
  sql: string;
  executionMs?: number;
}

export function SqlTerminal({ sql, executionMs }: SqlTerminalProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Lightweight syntax highlighting (keywords + values)
  const highlighted = sql
    .replace(
      /\b(SELECT|FROM|WHERE|GROUP BY|ORDER BY|LIMIT|JOIN|ON|AS|AND|OR|NOT|IN|LIKE|IS|NULL|HAVING|DISTINCT|COUNT|SUM|AVG|MIN|MAX|WITH|UNION|ALL|BY|ASC|DESC|INSERT|UPDATE|DELETE|CREATE|TABLE|ALTER|DROP|TRUNCATE|FORMAT|SETTINGS|PREWHERE|ARRAY JOIN|FINAL)\b/gi,
      '<span class="sql-kw">$1</span>'
    )
    .replace(/'([^']*)'/g, '<span class="sql-str">\'$1\'</span>')
    .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="sql-num">$1</span>')
    .replace(/--([^\n]*)/g, '<span class="sql-comment">--$1</span>');

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="overflow-hidden rounded-xl border border-zinc-700/60"
    >
      {/* Terminal header bar */}
      <div className="flex items-center justify-between border-b border-zinc-700/60 bg-zinc-800/90 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-rose-500/70" />
            <span className="h-3 w-3 rounded-full bg-amber-500/70" />
            <span className="h-3 w-3 rounded-full bg-emerald-500/70" />
          </div>
          <Terminal size={13} className="ml-2 text-zinc-400" />
          <span className="text-xs font-semibold text-zinc-400">ClickHouse SQL</span>
        </div>

        <div className="flex items-center gap-3">
          {executionMs !== undefined && (
            <div className="flex items-center gap-1 rounded-md border border-amber-500/20 bg-amber-950/40 px-2 py-1 text-[10px] font-semibold text-amber-400">
              <Clock size={10} />
              {executionMs}ms
            </div>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold text-zinc-400 transition hover:bg-zinc-700 hover:text-zinc-200"
          >
            {copied ? (
              <>
                <CheckCheck size={12} className="text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy size={12} />
                Copy SQL
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code body */}
      <div className="overflow-x-auto bg-zinc-900/90 p-4">
        <pre className="text-xs leading-6 text-zinc-300 font-mono whitespace-pre-wrap break-words">
          <code
            dangerouslySetInnerHTML={{ __html: highlighted }}
            className="sql-highlight"
          />
        </pre>
      </div>
    </motion.div>
  );
}
