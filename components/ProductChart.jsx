'use client';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';

export default function ProductChart({ title, data }) {
  return (
    <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{title}</div>
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" tickFormatter={(v) => `Day ${v}`} tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip labelFormatter={(v) => `Day ${v}`} />
            <Legend />
            <Line type="monotone" dataKey="procurement" name="Procurement Amount" stroke="#1f77b4" dot={false} />
            <Line type="monotone" dataKey="sales" name="Sales Amount" stroke="#ff7f0e" dot={false} />
            <Line type="monotone" dataKey="inventory" name="Inventory" stroke="#2ca02c" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
