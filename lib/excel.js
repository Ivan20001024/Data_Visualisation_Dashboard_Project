// lib/excel.js
import * as XLSX from 'xlsx';

// 用于“宽表”没提供起始日期时的基准日期（DB 仍需 DateTime）
const BASE_DATE = new Date(Date.UTC(2000, 0, 1));

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
  if (!isNaN(t.getTime())) {
    return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  }
  throw new Error(`无法解析日期: ${v}`);
}

function addDaysUTC(d, n) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function findHeader(headers, regex) {
  return headers.find((h) => regex.test(h));
}

function val(row, key) {
  return key ? row[key] : undefined;
}

/**
 * 解析 Excel 为标准“窄表记录数组”，每条记录：
 * { product_name, external_id?, date, open_inv, proc_qty, proc_price, sales_qty, sales_price }
 * 兼容两种模板：
 * ① 窄表：ID | Product Name | Date | Opening Inventory | Procurement Qty | Procurement Price | Sales Qty | Sales Price
 * ② 宽表：ID | Product Name | Opening Inventory on Day 1 | (Procurement Qty & Price Day 1..N) | (Sales Qty & Price Day 1..N) | [Start Date]
 */
export function parseXlsxToFacts(uint8arr) {
  const wb = XLSX.read(uint8arr, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  if (!rows.length) return [];

  const headers = Object.keys(rows[0] || {}).map((s) => String(s).trim());

  // 判定是否是窄表（是否存在“Date”列）
  const isNarrow = headers.some((h) => /^date$/i.test(h));

  if (isNarrow) {
    // —— 窄表 —— //
    const hId =
      findHeader(headers, /^(id|product id|external id)$/i) || null;
    const hName = findHeader(headers, /^product\s*name$/i);
    const hDate = findHeader(headers, /^date$/i);
    const hOpenInv = findHeader(headers, /^opening\s*inventory$/i);
    const hPQ = findHeader(headers, /^procurement\s*qty$/i);
    const hPP = findHeader(headers, /^procurement\s*price$/i);
    const hSQ = findHeader(headers, /^sales\s*qty$/i);
    const hSP = findHeader(headers, /^sales\s*price$/i);

    const missing = [];
    if (!hName) missing.push('Product Name');
    if (!hDate) missing.push('Date');
    if (!hOpenInv) missing.push('Opening Inventory');
    if (!hPQ) missing.push('Procurement Qty');
    if (!hPP) missing.push('Procurement Price');
    if (!hSQ) missing.push('Sales Qty');
    if (!hSP) missing.push('Sales Price');
    if (missing.length) {
      throw new Error(`缺少表头: ${missing.join(', ')}`);
    }

    const out = [];
    for (const r of rows) {
      const name = String(val(r, hName) ?? '').trim();
      if (!name) continue;
      out.push({
        product_name: name,
        external_id: hId ? String(val(r, hId) ?? '').trim() || null : null,
        date: toDate(val(r, hDate)),
        open_inv: toNum(val(r, hOpenInv)),
        proc_qty: toNum(val(r, hPQ)),
        proc_price: toNum(val(r, hPP)),
        sales_qty: toNum(val(r, hSQ)),
        sales_price: toNum(val(r, hSP)),
      });
    }
    return out;
  }

  // —— 宽表 —— //
  // 头部匹配（尽量宽松）
  const hId =
    findHeader(headers, /^(id|product id|external id)$/i) || null;
  const hName = findHeader(headers, /^product\s*name$/i);
  const hStartDate = findHeader(headers, /^start\s*date$/i) || null;
  const hOpenInv1 =
    findHeader(headers, /^opening\s*inventory(?:\s*on)?\s*day\s*1$/i) ||
    findHeader(headers, /^opening\s*inventory$/i) ||
    null;

  if (!hName) throw new Error('缺少表头: Product Name');
  // Day 序号收集
  const daySet = new Set();
  for (const h of headers) {
    let m =
      h.match(/^(procurement|purchase)\s*qty\s*day\s*(\d+)/i) ||
      h.match(/^sales\s*qty\s*day\s*(\d+)/i) ||
      h.match(/^(procurement|purchase)\s*price\s*day\s*(\d+)/i) ||
      h.match(/^sales\s*price\s*day\s*(\d+)/i);
    if (m) daySet.add(Number(m[2]));
  }
  const days = [...daySet].sort((a, b) => a - b);
  if (days.length === 0) {
    throw new Error('未识别到 Day 列（例如 “Procurement Qty Day 1”）');
  }

  // 为特定 Day 找实际列名的帮助函数
  const headerFor = (kind, d) => {
    switch (kind) {
      case 'pq':
        return (
          findHeader(headers, new RegExp(`^(procurement|purchase)\\s*qty\\s*day\\s*${d}\\b`, 'i')) ||
          null
        );
      case 'pp':
        return (
          findHeader(headers, new RegExp(`^(procurement|purchase)\\s*price\\s*day\\s*${d}\\b`, 'i')) ||
          null
        );
      case 'sq':
        return findHeader(headers, new RegExp(`^sales\\s*qty\\s*day\\s*${d}\\b`, 'i')) || null;
      case 'sp':
        return findHeader(headers, new RegExp(`^sales\\s*price\\s*day\\s*${d}\\b`, 'i')) || null;
      default:
        return null;
    }
  };

  const out = [];
  for (const r of rows) {
    const name = String(val(r, hName) ?? '').trim();
    if (!name) continue;

    const external_id = hId ? String(val(r, hId) ?? '').trim() || null : null;
    const baseDate = hStartDate && val(r, hStartDate) ? toDate(val(r, hStartDate)) : BASE_DATE;

    // Day1 的开仓库存（缺失按 0）
    let inv = hOpenInv1 ? toNum(val(r, hOpenInv1)) : 0;

    for (const d of days) {
      const pq = toNum(val(r, headerFor('pq', d)));
      const pp = toNum(val(r, headerFor('pp', d)));
      const sq = toNum(val(r, headerFor('sq', d)));
      const sp = toNum(val(r, headerFor('sp', d)));

      // 该天的“开仓库存”为 inv
      out.push({
        product_name: name,
        external_id,
        date: addDaysUTC(baseDate, d - 1),
        open_inv: inv,
        proc_qty: pq,
        proc_price: pp,
        sales_qty: sq,
        sales_price: sp,
      });

      // 推导翌日开仓库存：inv_{t+1} = inv_t + proc_qty_t - sales_qty_t
      inv = inv + pq - sq;
    }
  }

  return out;
}
