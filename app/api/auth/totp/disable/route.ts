import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Disable login 2FA and clear vault-unlock artifacts that depend on it.
    await db.user.update({
      where: { id: session.user.id },
      data: {
        totpSecret: null,
        twoFAUnlockToken: null,
        twoFAEncryptedMaster: null,
        twoFAMasterIv: null,
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('TOTP Disable Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
