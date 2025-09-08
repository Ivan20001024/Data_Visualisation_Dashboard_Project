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

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const userId = Number(session.user.id);
  const { byId, byName } = prefixes(userId);

  const requested = req.nextUrl.searchParams.getAll('productId').map(Number).filter(Boolean);
  if (requested.length === 0) {
    return NextResponse.json({ message: 'missing productId' }, { status: 400 });
  }

  const own = await prisma.product.findMany({
    where: {
      product_id: { in: requested },
      OR: [
        { external_id: { startsWith: byId } },
        { external_id: { startsWith: byName } },
      ]
    },
    select: { product_id: true }
  });
  const allowed = new Set(own.map(x => x.product_id));

  const rows = await prisma.dailyFact.findMany({
    where: { product_id: { in: Array.from(allowed) } },
    orderBy: { date: 'asc' }
  });

  const byIdMap = {};
  for (const r of rows) {
    (byIdMap[r.product_id] ||= []).push(r);
  }
  for (const id of requested) if (!byIdMap[id]) byIdMap[id] = [];

  return NextResponse.json(byIdMap);
}
