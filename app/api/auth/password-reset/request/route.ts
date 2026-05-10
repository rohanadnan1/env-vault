import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { issuePasswordResetLink } from '@/lib/auth/password-reset';
import { passwordResetLimiter } from '@/lib/ratelimit';

const Schema = z.object({
  email: z.string().email(),
});

function getIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = Schema.parse(body);
    const ip = getIp(req);
    const normalizedEmail = email.trim().toLowerCase();

    const { success: rateOk } = await passwordResetLimiter.limit(`${ip}:${normalizedEmail}`);
    if (!rateOk) {
      return NextResponse.json(
        { error: 'Too many reset requests. Please try again later.' },
        { status: 429 }
      );
    }

    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
      },
    });

    if (user?.password) {
      await issuePasswordResetLink(user.id, user.email, user.name);
    }

    return NextResponse.json({
      success: true,
      message: 'If an account exists for that email, a reset link has been sent.',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }
    console.error('password-reset/request error', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
