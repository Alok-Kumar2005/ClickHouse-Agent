'use client';
// ============================================================
// components/ui/DataTable.tsx — Tailwind sortable data table
// ============================================================
import { motion } from 'framer-motion';

interface DataTableProps {
  rows: Record<string, unknown>[];
}

export function DataTable({ rows }: DataTableProps) {
  if (!rows.length) return null;

  const columns = Object.keys(rows[0]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="overflow-x-auto rounded-xl border border-zinc-700/60"
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-700/60 bg-zinc-800/80">
            {columns.map((col) => (
              <th
                key={col}
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-zinc-400"
              >
                {col.replace(/_/g, ' ')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-zinc-800/80 bg-zinc-900 transition-colors hover:bg-zinc-800/40"
            >
              {columns.map((col) => (
                <td key={col} className="px-4 py-3 text-zinc-300 font-mono text-xs">
                  {formatCell(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </motion.div>
  );
}

function formatCell(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'number') return val.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return String(val);
}
