import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { parseXlsxToFacts } from '../../../lib/excel';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/authOptions';

function nsExternalId(rawId, userId, productName) {
  if (rawId && String(rawId).trim()) {
    return `u${userId}::${String(rawId).trim()}`;
  }
  return `u${userId}__NAME__${String(productName || '').trim()}`;
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
    const records = parseXlsxToFacts(bytes);

    const nsRecords = records.map(r => ({
      ...r,
      external_id: nsExternalId(r.external_id, userId, r.product_name),
    }));

    const uniqNsIds = [...new Set(nsRecords.map(r => r.external_id))];

    const existing = await prisma.product.findMany({
      where: { external_id: { in: uniqNsIds } },
      select: { product_id: true, external_id: true, product_name: true }
    });
    const idToPid = new Map(existing.map(p => [p.external_id, p.product_id]));

    for (const nsid of uniqNsIds) {
      if (!idToPid.has(nsid)) {
        const any = nsRecords.find(r => r.external_id === nsid);
        const created = await prisma.product.create({
          data: { product_name: any.product_name, external_id: nsid },
          select: { product_id: true, external_id: true }
        });
        idToPid.set(created.external_id, created.product_id);
      } else {
        const pid = idToPid.get(nsid);
        const any = nsRecords.find(r => r.external_id === nsid);
        const current = existing.find(p => p.external_id === nsid);
        if (any?.product_name && current && current.product_name !== any.product_name) {
          await prisma.product.update({
            where: { product_id: pid },
            data: { product_name: any.product_name }
          });
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const r of nsRecords) {
        const product_id = idToPid.get(r.external_id);
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
          }
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Upload parse/write error:', err);
    return NextResponse.json({ message: 'Parsing or insertion failed' }, { status: 500 });
  }
}
