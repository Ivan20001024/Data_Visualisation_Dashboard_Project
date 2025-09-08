import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '../../../lib/prisma';

export async function POST(req) {
  try {
    const body = await req.json().catch(() => null);
    const username = (body?.username ?? '').trim();
    const password = (body?.password ?? '').trim();

    if (!username || !password) {
      return NextResponse.json(
        { message: 'Username or password cannot be empty' },
        { status: 400 }
      );
    }

    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) {
      return NextResponse.json(
        { message: 'Username already taken' },
        { status: 409 }
      );
    }

    const hash = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: { username, password_hash: hash },
      select: { username_id: true },
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error('Signup error:', err);
    return NextResponse.json(
      { message: 'Server error, please try again later' },
      { status: 500 }
    );
  }
}
