// app/api/upload/route.js
export const runtime = 'nodejs';        // 强制 Node 运行时（不是 Edge）
export const dynamic = 'force-dynamic'; // 避免被静态化
export const maxDuration = 60;          // Vercel 无服务器函数最长执行秒数

import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { parseXlsxToFacts } from '../../../lib/excel';

export async function POST(req) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!file) {
      return NextResponse.json({ message: 'No file selected' }, { status: 400 });
    }

    // 可选：限制 10MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ message: 'File too large' }, { status: 413 });
    }

    // 用 Buffer 读取（云端最稳）
    const buffer = Buffer.from(await file.arrayBuffer());
    const records = parseXlsxToFacts(buffer); 
    // records: [{ product_name, external_id?, date, open_inv, proc_qty, proc_price, sales_qty, sales_price }]

    // 建产品键：优先 external_id，没有就用名称
    const keys = new Map();
    for (const r of records) {
      const key = r.external_id ? `id:${r.external_id}` : `name:${r.product_name}`;
      if (!keys.has(key)) keys.set(key, { external_id: r.external_id || null, product_name: r.product_name });
    }

    const keyToPid = new Map();

    await prisma.$transaction(async (tx) => {
      // 先确保/创建产品
      for (const [key, { external_id, product_name }] of keys.entries()) {
        let p;
        if (external_id) {
          p = await tx.product.findFirst({ where: { external_id } });
          if (!p) {
            p = await tx.product.create({ data: { product_name, external_id } });
          } else if (product_name && p.product_name !== product_name) {
            p = await tx.product.update({
              where: { product_id: p.product_id },
              data: { product_name },
            });
          }
        } else {
          p = await tx.product.findFirst({ where: { product_name } });
          if (!p) p = await tx.product.create({ data: { product_name } });
        }
        keyToPid.set(key, p.product_id);
      }

      // 写入/更新日度事实
      for (const r of records) {
        const key = r.external_id ? `id:${r.external_id}` : `name:${r.product_name}`;
        const product_id = keyToPid.get(key);
        await tx.dailyFact.upsert({
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
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Upload parse/write error:', err);
    // 把具体错误信息返回，便于你在云端看到原因
    return NextResponse.json({ message: err?.message || '解析或入库失败' }, { status: 500 });
  }
}
