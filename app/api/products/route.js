import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/authOptions';

function prefixes(userId) {
  return {
    byId: `u${userId}::`,
    byName: `u${userId}__NAME__`,
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const userId = Number(session.user.id);
  const { byId, byName } = prefixes(userId);

  const products = await prisma.product.findMany({
    where: {
      OR: [
        { external_id: { startsWith: byId } },
        { external_id: { startsWith: byName } },
      ]
    },
    select: { product_id: true, product_name: true },
    orderBy: { product_id: 'asc' }
  });

  return NextResponse.json(products);
}

export async function DELETE(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const userId = Number(session.user.id);
    const { byId, byName } = prefixes(userId);

    let ids = [];
    try {
      const body = await req.json();
      if (Array.isArray(body?.ids)) ids = body.ids.map(Number).filter(Boolean);
    } catch {}

    if (ids.length > 0) {
      const own = await prisma.product.findMany({
        where: {
          product_id: { in: ids },
          OR: [
            { external_id: { startsWith: byId } },
            { external_id: { startsWith: byName } },
          ]
        },
        select: { product_id: true }
      });
      const allowedIds = own.map(x => x.product_id);
      if (allowedIds.length > 0) {
        await prisma.$transaction([
          prisma.dailyFact.deleteMany({ where: { product_id: { in: allowedIds } } }),
          prisma.product.deleteMany({ where: { product_id: { in: allowedIds } } }),
        ]);
      }
    } else {
      const ownIds = (await prisma.product.findMany({
        where: {
          OR: [
            { external_id: { startsWith: byId } },
            { external_id: { startsWith: byName } },
          ]
        },
        select: { product_id: true }
      })).map(x => x.product_id);

      if (ownIds.length > 0) {
        await prisma.$transaction([
          prisma.dailyFact.deleteMany({ where: { product_id: { in: ownIds } } }),
          prisma.product.deleteMany({ where: { product_id: { in: ownIds } } }),
        ]);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Products DELETE error:', err);
    return NextResponse.json({ message: 'Clean Error' }, { status: 500 });
  }
}
