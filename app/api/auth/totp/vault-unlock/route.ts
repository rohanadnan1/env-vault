import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { verifyTotp } from '@/lib/totp';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { totpCode } = await req.json();
    if (!totpCode) {
      return NextResponse.json({ error: 'TOTP code is required' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        totpSecret: true,
        twoFAUnlockToken: true,
        twoFAEncryptedMaster: true,
        twoFAMasterIv: true,
      },
    });

    if (!user?.totpSecret) {
      return NextResponse.json({ error: '2FA is not enabled' }, { status: 400 });
    }

    if (!user.twoFAEncryptedMaster || !user.twoFAUnlockToken || !user.twoFAMasterIv) {
      return NextResponse.json({ error: '2FA vault unlock is not set up' }, { status: 400 });
    }

    if (!verifyTotp(totpCode, user.totpSecret)) {
      return NextResponse.json({ error: 'Invalid 2FA code' }, { status: 400 });
    }

    return NextResponse.json({
      unlockToken: user.twoFAUnlockToken,
      encryptedMaster: user.twoFAEncryptedMaster,
      masterIv: user.twoFAMasterIv,
    });
  } catch (error) {
    console.error('2FA vault unlock error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
