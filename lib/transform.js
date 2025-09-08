// lib/transform.js
function fmtISO(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function toChartSeries(byId) {
  const out = {};
  for (const [pid, rows] of Object.entries(byId || {})) {
    const sorted = [...rows].sort((a, b) => new Date(a.date) - new Date(b.date));

    out[pid] = sorted.map((r, idx) => ({
      day: idx + 1,                                   
      procurement: (r.proc_qty || 0) * (r.proc_price || 0),
      sales: (r.sales_qty || 0) * (r.sales_price || 0),
      inventory: r.open_inv || 0,
    }));
  }
  return out;
}
