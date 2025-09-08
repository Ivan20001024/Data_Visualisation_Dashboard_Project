// lib/excel.js
import * as XLSX from 'xlsx';

function toNum(v) {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toDate(v) {
  if (v instanceof Date) {
    return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
  }
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    return new Date(Date.UTC(d.y, d.m - 1, d.d));
  }
  const t = new Date(v);
  if (isNaN(t.getTime())) throw new Error(`无法解析日期: ${v}`);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
}

/**
 * 统一用 Buffer 解析（线上最稳）
 * 需要表头：ID / Product Name / Date / Opening Inventory / Procurement Qty / Procurement Price / Sales Qty / Sales Price
 * 若没有 ID 列，可留空（我们会用 Product Name 作为键）
 */
export function parseXlsxToFacts(bufferOrArrayBuffer) {
  // 既支持 Buffer 也支持 ArrayBuffer
  const data =
    bufferOrArrayBuffer instanceof ArrayBuffer
      ? Buffer.from(bufferOrArrayBuffer)
      : bufferOrArrayBuffer;

  const wb = XLSX.read(data, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

  if (!rows.length) throw new Error('工作表为空');

  const need = [
    'Product Name',
    'Date',
    'Opening Inventory',
    'Procurement Qty',
    'Procurement Price',
    'Sales Qty',
    'Sales Price',
  ];
  const headers = Object.keys(rows[0] || {});
  const missing = need.filter((k) => !headers.includes(k));
  if (missing.length) {
    throw new Error(`缺少表头: ${missing.join(', ')}`);
  }

  const out = [];
  for (const r of rows) {
    const product_name = String(r['Product Name'] ?? '').trim();
    if (!product_name) continue;

    out.push({
      // 若有 ID 列就带上（用于 external_id）
      external_id:
        r['ID'] == null || String(r['ID']).trim() === ''
          ? null
          : String(r['ID']).trim(),
      product_name,
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
