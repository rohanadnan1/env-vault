import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyEmailVerificationCode } from '@/lib/auth/email-verification';
import { db } from '@/lib/db';

const Schema = z.object({
  userId: z.string().min(1),
  code: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, code } = Schema.parse(body);

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, emailVerified: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    if (user.emailVerified) {
      return NextResponse.json({ success: true, alreadyVerified: true });
    }

    const result = await verifyEmailVerificationCode(userId, code);

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.reason === 'expired'
            ? 'Verification code expired. Request a new code.'
            : 'Invalid verification code',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    console.error('email-verification/verify error', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
