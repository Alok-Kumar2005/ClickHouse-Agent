'use client';
// ============================================================
// components/agent/DataCanvas.tsx
// Renders query_results as KPI card (single) or table + chart
// ============================================================
import { motion } from 'framer-motion';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import { BarChart2 } from 'lucide-react';
import { KpiCard } from '@/components/ui/KpiCard';
import { DataTable } from '@/components/ui/DataTable';

interface DataCanvasProps {
  results: Record<string, unknown>[];
}

// ── Helpers ────────────────────────────────────────────────
function isSingleKpi(rows: Record<string, unknown>[]): boolean {
  return rows.length === 1 && Object.keys(rows[0]).length === 1;
}

function isNumeric(val: unknown): boolean {
  return typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)));
}

const CHART_COLORS = ['#22d3ee', '#34d399', '#fbbf24', '#a78bfa', '#fb7185', '#60a5fa'];

// Custom tooltip for Recharts
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{value: unknown; name: string}>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 shadow-xl text-xs">
      <p className="font-semibold text-zinc-300 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-cyan-400">{p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : String(p.value)}</p>
      ))}
    </div>
  );
}

export function DataCanvas({ results }: DataCanvasProps) {
  if (!results || results.length === 0) return null;

  // ── Single KPI ──────────────────────────────────────────
  if (isSingleKpi(results)) {
    const key = Object.keys(results[0])[0];
    const val = results[0][key];
    const numVal = typeof val === 'number' ? val : parseFloat(String(val));
    return (
      <div className="my-2">
        <KpiCard
          label={key.replace(/_/g, ' ')}
          value={isNaN(numVal) ? String(val) : numVal}
        />
      </div>
    );
  }

  // ── Multi-row: find numeric columns for charting ────────
  const columns = Object.keys(results[0]);
  const numericCols = columns.filter((col) =>
    results.every((row) => isNumeric(row[col]))
  );
  const labelCols = columns.filter((col) => !numericCols.includes(col));
  const xKey = labelCols[0] ?? columns[0];
  const yKeys = numericCols.slice(0, 3); // max 3 series

  // Decide chart type: use LineChart for time-series-like data
  const isTimeSeries = results.some((r) => {
    const v = String(r[xKey] ?? '');
    return /\d{4}-\d{2}-\d{2}/.test(v) || /^\d{4}$/.test(v) || v.toLowerCase().includes('month');
  });

  const chartData = results.slice(0, 50).map((row) => ({
    name: String(row[xKey] ?? ''),
    ...Object.fromEntries(yKeys.map((k) => [k, Number(row[k])])),
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-4"
    >
      {/* Chart */}
      {yKeys.length > 0 && chartData.length > 0 && (
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/70 p-4">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 size={14} className="text-cyan-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              {isTimeSeries ? 'Trend Chart' : 'Data Visualization'}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            {isTimeSeries ? (
              <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: '#71717a' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#71717a' }}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                  tickFormatter={(v) => v.toLocaleString()}
                />
                <Tooltip content={<CustomTooltip />} />
                {yKeys.map((k, i) => (
                  <Line
                    key={k}
                    type="monotone"
                    dataKey={k}
                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    name={k.replace(/_/g, ' ')}
                  />
                ))}
              </LineChart>
            ) : (
              <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: '#71717a' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#71717a' }}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                  tickFormatter={(v) => v.toLocaleString()}
                />
                <Tooltip content={<CustomTooltip />} />
                {yKeys.map((k, i) => (
                  <Bar key={k} dataKey={k} radius={[4, 4, 0, 0]} name={k.replace(/_/g, ' ')}>
                    {chartData.map((_, idx) => (
                      <Cell
                        key={idx}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                        fillOpacity={0.85}
                      />
                    ))}
                  </Bar>
                ))}
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <DataTable rows={results} />
    </motion.div>
  );
}
