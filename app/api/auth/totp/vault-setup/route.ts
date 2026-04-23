import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { verifyTotp } from '@/lib/totp';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { totpCode, unlockToken, encryptedMaster, masterIv } = await req.json();

    if (!totpCode || !unlockToken || !encryptedMaster || !masterIv) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { totpSecret: true },
    });

    if (!user?.totpSecret) {
      return NextResponse.json({ error: '2FA is not enabled on this account' }, { status: 400 });
    }

    if (!verifyTotp(totpCode, user.totpSecret)) {
      return NextResponse.json({ error: 'Invalid 2FA code' }, { status: 400 });
    }

    await db.user.update({
      where: { id: session.user.id },
      data: { twoFAUnlockToken: unlockToken, twoFAEncryptedMaster: encryptedMaster, twoFAMasterIv: masterIv },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('2FA vault setup error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await db.user.update({
      where: { id: session.user.id },
      data: { twoFAUnlockToken: null, twoFAEncryptedMaster: null, twoFAMasterIv: null },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('2FA vault setup disable error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { twoFAEncryptedMaster: true },
    });
    return NextResponse.json({ enabled: !!user?.twoFAEncryptedMaster });
  } catch (error) {
    console.error('2FA vault status error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
