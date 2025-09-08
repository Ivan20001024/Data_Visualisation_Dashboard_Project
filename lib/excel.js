// lib/excel.js
import * as XLSX from 'xlsx';

function toNum(v) {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function toDate(v) {
  if (v instanceof Date) return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    return new Date(Date.UTC(d.y, d.m - 1, d.d));
  }
  const t = new Date(v);
  if (isNaN(t.getTime())) throw new Error(`Unable to parse date: ${v}`);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
}
const BASE_ANCHOR = new Date(Date.UTC(2000, 0, 1));
function addDays(d, n) { return new Date(d.getTime() + n * 86400000); }

// —— 规范化表头：去空白/标点，做同义替换（含中文） —— //
function normalizeHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/[()\[\]{}（）：:，,.-]/g, '') // 去括号/标点
    .replace(/\s+|_/g, '')                  // 去空白和下划线
    // 英文同义
    .replace(/quantity/g, 'qty')
    .replace(/unitprice|priceperunit|unitcost|cost/g, 'price')
    .replace(/purchase|procure|buy/g, 'procurement')
    .replace(/sell/g, 'sales')
    .replace(/openinginv|openinginventory/g, 'openinginventory')
    // 中文同义
    .replace(/产品名称|商品名称|品名|产品名/g, 'productname')
    .replace(/开始日期|起始日期/g, 'startdate')
    .replace(/期初库存|开仓库存|期初存货/g, 'openinginventory')
    .replace(/采购|进货/g, 'procurement')
    .replace(/销售/g, 'sales')
    .replace(/数量|数/g, 'qty')
    .replace(/单价|价格|价/g, 'price')
    .replace(/天/g, 'day'); // 第1天 -> day1
}

// 从原始表头中提取“第几天”的数字，兼容 Day 1 / Day1 / (Day 1) / D1 / 第1天
function extractDayIndex(raw) {
  const s = normalizeHeader(raw);
  // …dayNNN…
  let m = s.match(/(?:^|[^a-z])day(\d{1,3})(?:[^a-z]|$)/);
  if (m) return parseInt(m[1], 10);
  // …dNNN…
  m = s.match(/(?:^|[^a-z])d(\d{1,3})(?:[^a-z]|$)/);
  if (m) return parseInt(m[1], 10);
  // 尾部数字（兼容 “procurementqty1” / “salesprice2” 这类没有 day/d 的写法）
  m = s.match(/(\d{1,3})$/);
  if (m && (s.includes('qty') || s.includes('price'))) return parseInt(m[1], 10);
  // 中文“第1天/第1日”
  m = String(raw).match(/第\s*(\d{1,3})\s*(天|日)/);
  if (m) return parseInt(m[1], 10);
  return null;
}

function hasWordRaw(raw, ...words) {
  const s = normalizeHeader(raw);
  return words.every(w => s.includes(normalizeHeader(w)));
}

// —— 扫描“宽表”的 Day 列，返回 [ [day, {pqKey, ppKey, sqKey, spKey}], ... ] —— //
function scanWideHeaders(headers) {
  const map = new Map();
  for (const h of headers) {
    const d = extractDayIndex(h);
    if (d == null) continue;
    const n = normalizeHeader(h);
    if (!map.has(d)) map.set(d, {});
    const bucket = map.get(d);

    if (n.includes('procurement') && n.includes('qty')) bucket.pqKey = h;
    if (n.includes('procurement') && n.includes('price')) bucket.ppKey = h;
    if (n.includes('sales') && n.includes('qty')) bucket.sqKey = h;
    if (n.includes('sales') && n.includes('price')) bucket.spKey = h;
  }
  // 只保留至少有一列的 day
  return [...map.entries()]
    .filter(([,v]) => v.pqKey || v.ppKey || v.sqKey || v.spKey)
    .sort((a,b) => a[0] - b[0]);
}

export function parseXlsxToFacts(uint8arr) {
  const wb = XLSX.read(uint8arr, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows0 = XLSX.utils.sheet_to_json(ws, { defval: null });
  if (!rows0.length) return [];

  // 原始表头（保留原样 + 一份规范化）
  const headers = Object.keys(rows0[0] || {});
  const normHeaders = headers.map(normalizeHeader);

  // —— 判定是否“窄表”（是否包含 Date 列） —— //
  const hasDate = headers.some(h => /date|日期/i.test(h));
  if (hasDate) {
    // 找关键列（宽松匹配）
    const hId = headers.find((h, i) => /^(id|product id|external id)$/i.test(h) || /^(id|productid|externalid)$/.test(normHeaders[i])) || null;
    const hName = headers.find((h, i) => /product\s*name/i.test(h) || normHeaders[i] === 'productname');
    const hDate = headers.find((h, i) => /^date$/i.test(h) || normHeaders[i] === 'date');
    const hOpenInv = headers.find((h, i) => /opening\s*inventory/i.test(h) || normHeaders[i] === 'openinginventory');
    const hPQ = headers.find((h, i) => (hasWordRaw(h, 'procurement', 'qty')));
    const hPP = headers.find((h, i) => (hasWordRaw(h, 'procurement', 'price')));
    const hSQ = headers.find((h, i) => (hasWordRaw(h, 'sales', 'qty')));
    const hSP = headers.find((h, i) => (hasWordRaw(h, 'sales', 'price')));

    const missing = [];
    if (!hName) missing.push('Product Name');
    if (!hDate) missing.push('Date');
    if (!hOpenInv) missing.push('Opening Inventory');
    if (!hPQ) missing.push('Procurement Qty');
    if (!hPP) missing.push('Procurement Price');
    if (!hSQ) missing.push('Sales Qty');
    if (!hSP) missing.push('Sales Price');
    if (missing.length) {
      throw new Error(`Missing headers: ${missing.join(', ')}`);
    }

    // 转为窄表记录
    const out = [];
    for (const r of rows0) {
      const name = String(r[hName] ?? '').trim();
      if (!name) continue;
      out.push({
        product_name: name,
        external_id: hId ? (String(r[hId] ?? '').trim() || null) : null,
        date: toDate(r[hDate]),
        open_inv: toNum(r[hOpenInv]),
        proc_qty: toNum(r[hPQ]),
        proc_price: toNum(r[hPP]),
        sales_qty: toNum(r[hSQ]),
        sales_price: toNum(r[hSP]),
      });
    }
    return out;
  }

  // —— 宽表路径 —— //
  // 关键头
  const hId = headers.find((h, i) => /^(id|product id|external id)$/i.test(h) || /^(id|productid|externalid)$/.test(normHeaders[i])) || null;
  const hName = headers.find((h, i) => /product\s*name/i.test(h) || normHeaders[i] === 'productname');
  if (!hName) throw new Error('Missing column: Product Name');

  const hStartDate = headers.find((h, i) => /^start\s*date$/i.test(h) || normHeaders[i] === 'startdate') || null;
  const hOpenInv1 =
    headers.find((h, i) =>
      /opening\s*inventory(\s*on\s*day\s*1)?/i.test(h) || normHeaders[i] === 'openinginventory'
    ) || null;

  // 扫描 Day 列（更宽松）
  const dayPairs = scanWideHeaders(headers);
  if (dayPairs.length === 0) {
    // 调试信息（只打到日志，不泄露到前端）
    console.error('Wide sheet header scan failed. Headers =', headers);
    throw new Error('未识别到 Day 列（例如 “Procurement Qty Day 1 / Day1 / D1 / 第1天”）');
  }

  // 生成记录
  const out = [];
  for (const r of rows0) {
    const name = String(r[hName] ?? '').trim();
    if (!name) continue;

    const external_id = hId ? (String(r[hId] ?? '').trim() || null) : null;
    let anchor = BASE_ANCHOR;
    if (hStartDate && r[hStartDate]) {
      try { anchor = toDate(r[hStartDate]); } catch {}
    }
    let inv = hOpenInv1 ? toNum(r[hOpenInv1]) : 0;

    for (const [d, keys] of dayPairs) {
      const pq = toNum(keys.pqKey ? r[keys.pqKey] : 0);
      const pp = toNum(keys.ppKey ? r[keys.ppKey] : 0);
      const sq = toNum(keys.sqKey ? r[keys.sqKey] : 0);
      const sp = toNum(keys.spKey ? r[keys.spKey] : 0);

      out.push({
        product_name: name,
        external_id,
        date: addDays(anchor, d - 1),
        open_inv: inv,
        proc_qty: pq,
        proc_price: pp,
        sales_qty: sq,
        sales_price: sp,
      });

      inv = inv + pq - sq; // 翌日开仓库存
    }
  }

  return out;
}
