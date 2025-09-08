// app/api/upload/route.js
import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { parseXlsxToFacts } from '../../../lib/excel';

const UPSERT_CONCURRENCY = 20; // 每批并发 upsert 数，别太大

export async function POST(req) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!file) {
      return NextResponse.json({ message: 'No file selected' }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const records = parseXlsxToFacts(bytes); 
    if (!records.length) {
      return NextResponse.json({ message: 'No rows parsed from Excel' }, { status: 400 });
    }

    // 1) 归一化 key（优先 external_id，其次 product_name）
    const keyInfo = new Map(); // key -> { external_id, product_name }
    for (const r of records) {
      const key = r.external_id ? `id:${r.external_id}` : `name:${r.product_name}`;
      if (!keyInfo.has(key)) keyInfo.set(key, { external_id: r.external_id || null, product_name: r.product_name });
    }

    const keyToPid = new Map();

    // 2) 查已有 product（按 external_id / name 分开查）
    const extIds = [...new Set([...keyInfo.values()].map(x => x.external_id).filter(Boolean))];
    if (extIds.length) {
      const existByExt = await prisma.product.findMany({
        where: { external_id: { in: extIds } },
        select: { product_id: true, external_id: true },
      });
      for (const p of existByExt) keyToPid.set(`id:${p.external_id}`, p.product_id);
    }

    const names = [...new Set([...keyInfo.values()].filter(x => !x.external_id).map(x => x.product_name))];
    if (names.length) {
      const existByName = await prisma.product.findMany({
        where: { product_name: { in: names } },
        select: { product_id: true, product_name: true },
      });
      for (const p of existByName) keyToPid.set(`name:${p.product_name}`, p.product_id);
    }

    // 3) 补建缺失的 product（逐个创建，避免长事务）
    for (const [key, { external_id, product_name }] of keyInfo.entries()) {
      if (keyToPid.has(key)) continue;
      const created = await prisma.product.create({ data: { product_name, external_id } });
      keyToPid.set(key, created.product_id);
    }

    // 4) 分批 upsert DailyFact（无事务，小批并发）
    let batch = [];
    const flush = async () => {
      if (!batch.length) return;
      await Promise.all(batch);
      batch = [];
    };

    for (const r of records) {
      const key = r.external_id ? `id:${r.external_id}` : `name:${r.product_name}`;
      const product_id = keyToPid.get(key);
      batch.push(
        prisma.dailyFact.upsert({
          where: { product_id_date: { product_id, date: r.date } },
          create: {
            product_id,
            date: r.date,
            open_inv: r.open_inv ?? 0,
            proc_qty: r.proc_qty ?? 0,
            proc_price: r.proc_price ?? 0,
            sales_qty: r.sales_qty ?? 0,
            sales_price: r.sales_price ?? 0,
          },
          update: {
            open_inv: r.open_inv ?? 0,
            proc_qty: r.proc_qty ?? 0,
            proc_price: r.proc_price ?? 0,
            sales_qty: r.sales_qty ?? 0,
            sales_price: r.sales_price ?? 0,
          },
        })
      );

      if (batch.length >= UPSERT_CONCURRENCY) {
        await flush();
      }
    }
    await flush();

    return NextResponse.json({ ok: true });
  } catch (err) {
    // 保留日志，方便在 Vercel Logs 里定位
    console.error('Upload parse/write error:', err);
    return NextResponse.json({ message: 'Parsing or insertion failed' }, { status: 500 });
  }
}
