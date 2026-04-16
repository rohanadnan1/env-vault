import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { verify } from 'otplib';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { secret, token } = await req.json();

    if (!secret || !token) {
      return NextResponse.json({ error: 'Secret and token are required' }, { status: 400 });
    }

    // 1. Verify the token against the secret
    const isValid = verify({
      token,
      secret
    });

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 });
    }

    // 2. Save secret to DB and enable 2FA
    await db.user.update({
      where: { id: session.user.id },
      data: {
        totpSecret: secret
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('TOTP Verify Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
