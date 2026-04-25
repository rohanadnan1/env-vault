import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import crypto from 'crypto';

function isDatabaseUnavailable(error: unknown) {
  if (typeof error === 'object' && error && 'code' in error) {
    const code = (error as { code?: string }).code;
    if (code === 'P1001') return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Can't reach database server") || message.includes('Timed out fetching a new connection');
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { vaultSalt: true }
    });

    if (!user) {
      console.error('[VAULT_SALT] User not found in DB. Session userId:', userId);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const verificationSample = await db.secret.findFirst({
      where: {
        environment: {
          project: {
            userId,
          },
        },
      },
      select: {
        keyName: true,
        valueEncrypted: true,
        iv: true,
        environmentId: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (user.vaultSalt) {
      return NextResponse.json({
        salt: user.vaultSalt,
        verificationSample,
        isNewSetup: false,
      });
    }

    const newSalt = crypto.randomBytes(32).toString('base64');
    await db.user.update({
      where: { id: userId },
      data: { vaultSalt: newSalt }
    });

    return NextResponse.json({
      salt: newSalt,
      verificationSample,
      isNewSetup: true,
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return NextResponse.json(
        { error: 'Database is temporarily unavailable. Please retry shortly.' },
        { status: 503 }
      );
    }

    console.error('[VAULT_SALT] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
