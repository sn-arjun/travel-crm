'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface TrendPoint {
  snapshot_date: string;
  leads_count: number;
  contacts_count: number;
  invoices_count: number;
  users_count: number;
}

interface UsageTrendChartProps {
  data: TrendPoint[];
}

export function UsageTrendChart({ data }: UsageTrendChartProps) {
  const formatted = data.map((d) => ({
    ...d,
    date: new Date(d.snapshot_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={formatted}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="date" className="text-xs" />
        <YAxis className="text-xs" />
        <Tooltip
          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
          labelStyle={{ color: 'hsl(var(--foreground))' }}
        />
        <Legend />
        <Line type="monotone" dataKey="leads_count" name="Leads" stroke="#3b82f6" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="contacts_count" name="Contacts" stroke="#10b981" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="invoices_count" name="Invoices" stroke="#f59e0b" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="users_count" name="Users" stroke="#8b5cf6" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
