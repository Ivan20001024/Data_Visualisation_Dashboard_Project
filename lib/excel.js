import * as XLSX from 'xlsx';

function toNum(v) { if (v == null || v === '') return 0; const n = Number(v); return Number.isFinite(n) ? n : 0; }
function toDate(v) {
  if (v instanceof Date) return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
  if (typeof v === 'number') { const d = XLSX.SSF.parse_date_code(v); return new Date(Date.UTC(d.y, d.m - 1, d.d)); }
  const t = new Date(v); if (isNaN(t.getTime())) throw new Error(`Unable to parse date: ${v}`);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
}
const BASE_ANCHOR = new Date(Date.UTC(2000, 0, 1));
function addDays(d, n) { return new Date(d.getTime() + n * 86400000); }
function normalizeHeader(h) { return String(h || '').replace(/\s+/g, ' ').replace(/\u3000/g, ' ').trim(); }
function getDayFromHeader(h, key) {
  const re = new RegExp(`${key}.*?(?:\\(|\\s|^)Day\\s*(\\d+)\\)?`, 'i');
  const m = normalizeHeader(h).match(re);
  return m ? Number(m[1]) : null;
}
function hasWord(h, word) { return new RegExp(`\\b${word}\\b`, 'i').test(normalizeHeader(h)); }

export function parseXlsxToFacts(uint8arr) {
  const wb = XLSX.read(uint8arr, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows0 = XLSX.utils.sheet_to_json(ws, { defval: null });
  if (!rows0.length) return [];

  const rows = rows0.map(r => {
    const o = {};
    for (const k of Object.keys(r)) o[normalizeHeader(k)] = r[k];
    return o;
  });
  const headers = Object.keys(rows[0]);
  const headerSet = new Set(headers);

  const idHeader = headers.find(h => /^(product\s*id|id)$/i.test(h)) || null;

  const narrowNeed = [
    'Product Name', 'Date',
    'Opening Inventory', 'Procurement Qty', 'Procurement Price',
    'Sales Qty', 'Sales Price'
  ];
  const hasNarrow = headerSet.has('Date') && headerSet.has('Product Name') && headerSet.has('Opening Inventory');

  if (hasNarrow) {
    const missing = narrowNeed.filter(k => !headerSet.has(k));
    if (missing.length) throw new Error(`Missing headers: ${missing.join(', ')}. If using a "wide table", please use Day 1..N columns.`);

    const out = [];
    for (const r of rows) {
      const product_name = String(r['Product Name'] ?? '').trim();
      if (!product_name) continue;

      out.push({
        product_name,
        external_id: idHeader ? String(r[idHeader] ?? '').trim() || null : null,
        date: toDate(r['Date']),
        open_inv: toNum(r['Opening Inventory']),
        proc_qty: toNum(r['Procurement Qty']),
        proc_price: toNum(r['Procurement Price']),
        sales_qty: toNum(r['Sales Qty']),
        sales_price: toNum(r['Sales Price']),
      });
    }
    return out;
  }

  const pqCols = new Map(), ppCols = new Map(), sqCols = new Map(), spCols = new Map();
  let invDay1Header = null;
  const startDateHeader = headers.find(h => /^start\s*date$/i.test(h)) || null;
  let maxDay = 0;

  for (const h of headers) {
    const H = normalizeHeader(h);
    if (hasWord(H, 'Opening') && hasWord(H, 'Inventory')) {
      const d = getDayFromHeader(H, 'Opening\\s*Inventory');
      if (d === 1 || (!d && !invDay1Header)) invDay1Header = h;
    }
    if (/(^| )Proc(urement)? (Qty|Quantity)/i.test(H)) {
      const d = getDayFromHeader(H, 'Proc(?:urement)?\\s*(?:Qty|Quantity)'); if (d) { pqCols.set(d, h); maxDay = Math.max(maxDay, d); }
    }
    if (/Proc(urement)? Price/i.test(H)) {
      const d = getDayFromHeader(H, 'Proc(?:urement)?\\s*Price'); if (d) { ppCols.set(d, h); maxDay = Math.max(maxDay, d); }
    }
    if (/Sales (Qty|Quantity)/i.test(H)) {
      const d = getDayFromHeader(H, 'Sales\\s*(?:Qty|Quantity)'); if (d) { sqCols.set(d, h); maxDay = Math.max(maxDay, d); }
    }
    if (/Sales Price/i.test(H)) {
      const d = getDayFromHeader(H, 'Sales\\s*Price'); if (d) { spCols.set(d, h); maxDay = Math.max(maxDay, d); }
    }
  }

  if (!headers.some(h => /Product Name/i.test(h))) throw new Error('Missing column: Product Name');
  if (!invDay1Header) throw new Error('Missing column: Opening Inventory (Day 1). Example: Opening Inventory on Day 1');
  if (maxDay === 0) throw new Error('No Day columns recognized (e.g., "Procurement Qty Day 1" / "Sales Price Day 2").');

  const productNameHeader = headers.find(h => /Product Name/i.test(h));
  const out = [];

  for (const r of rows) {
    const product_name = String(r[productNameHeader] ?? '').trim();
    if (!product_name) continue;

    let inv = toNum(r[invDay1Header]);
    let anchor = BASE_ANCHOR;
    if (startDateHeader && r[startDateHeader]) { try { anchor = toDate(r[startDateHeader]); } catch {} }

    const external_id = idHeader ? String(r[idHeader] ?? '').trim() || null : null;

    for (let d = 1; d <= maxDay; d++) {
      const pqty = toNum(r[pqCols.get(d)]);
      const pprc = toNum(r[ppCols.get(d)]);
      const sqty = toNum(r[sqCols.get(d)]);
      const sprc = toNum(r[spCols.get(d)]);
      const date = addDays(anchor, d - 1);

      out.push({
        product_name,
        external_id,
        date,
        open_inv: inv,
        proc_qty: pqty,
        proc_price: pprc,
        sales_qty: sqty,
        sales_price: sprc,
      });

      inv = inv + pqty - sqty;
    }
  }

  return out;
}
