import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // 1. Disable 2FA by clearing the secret
    await db.user.update({
      where: { id: session.user.id },
      data: {
        totpSecret: null
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('TOTP Disable Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
