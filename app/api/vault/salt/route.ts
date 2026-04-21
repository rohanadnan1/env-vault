import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import crypto from 'crypto';

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
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
