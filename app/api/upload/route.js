// app/api/upload/route.js
import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { parseXlsxToFacts } from '../../../lib/excel';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/authOptions';

// 确保是 Node 运行时 & 不缓存
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 可选：给函数更长执行窗（Vercel 支持情况下生效）
export const maxDuration = 60;

function nsExternalId(rawId, userId, productName) {
  if (rawId && String(rawId).trim()) return `u${userId}::${String(rawId).trim()}`;
  return `u${userId}__NAME__${String(productName || '').trim()}`;
}

// 简单的分批执行器，控制并发
async function runBatches(items, batchSize, worker) {
  for (let i = 0; i < items.length; i += batchSize) {
    const slice = items.slice(i, i + batchSize);
    await Promise.all(slice.map(worker));
  }
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const userId = Number(session.user.id);

    const form = await req.formData();
    const file = form.get('file');
    if (!file) return NextResponse.json({ message: 'No file selected' }, { status: 400 });

    const bytes = new Uint8Array(await file.arrayBuffer());
    const records = parseXlsxToFacts(bytes); // ← 仍使用你当前可在本地通过的解析器

    // 用户命名空间 external_id
    const nsRecords = records.map((r) => ({
      ...r,
      external_id: nsExternalId(r.external_id, userId, r.product_name),
    }));

    // 先把所有产品建好 / 名称做必要更新
    const uniqNsIds = [...new Set(nsRecords.map((r) => r.external_id))];

    const existing = await prisma.product.findMany({
      where: { external_id: { in: uniqNsIds } },
      select: { product_id: true, external_id: true, product_name: true },
    });

    const idToPid = new Map(existing.map((p) => [p.external_id, p.product_id]));
    const existingName = new Map(existing.map((p) => [p.external_id, p.product_name]));

    // 创建缺失的产品（分批，避免一口气很多请求）
    await runBatches(
      uniqNsIds.filter((nsid) => !idToPid.has(nsid)),
      10,
      async (nsid) => {
        const any = nsRecords.find((r) => r.external_id === nsid);
        const created = await prisma.product.create({
          data: { product_name: any.product_name, external_id: nsid },
          select: { product_id: true, external_id: true },
        });
        idToPid.set(created.external_id, created.product_id);
        existingName.set(created.external_id, any.product_name);
      }
    );

    // 如有必要，更新产品名（同样分批）
    await runBatches(uniqNsIds, 10, async (nsid) => {
      const pid = idToPid.get(nsid);
      const nameNow = existingName.get(nsid);
      const any = nsRecords.find((r) => r.external_id === nsid);
      if (pid && any?.product_name && nameNow !== any.product_name) {
        await prisma.product.update({
          where: { product_id: pid },
          data: { product_name: any.product_name },
        });
        existingName.set(nsid, any.product_name);
      }
    });

    // 写入/更新 DailyFact：**不使用 transaction**，分批并发 upsert，避免 P2028
    await runBatches(nsRecords, 20, async (r) => {
      const product_id = idToPid.get(r.external_id);
      // Prisma 接受 JS Date；确保是有效日期
      if (!(r.date instanceof Date) || isNaN(r.date)) {
        throw new Error(`Invalid date for product ${r.product_name}`);
      }
      await prisma.dailyFact.upsert({
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
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Upload parse/write error:', err);
    return NextResponse.json({ message: 'Parsing or insertion failed' }, { status: 500 });
  }
}
