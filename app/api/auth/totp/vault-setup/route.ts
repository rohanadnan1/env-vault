import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { verifyTotp } from '@/lib/totp';

function isDatabaseUnavailable(error: unknown) {
  if (typeof error === 'object' && error && 'code' in error) {
    const code = (error as { code?: string }).code;
    if (code === 'P1001') return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Can't reach database server") || message.includes('Timed out fetching a new connection');
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
    if (isDatabaseUnavailable(error)) {
      return NextResponse.json(
        { error: 'Database is temporarily unavailable. Please retry shortly.' },
        { status: 503 }
      );
    }

    console.error('2FA vault setup error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await db.user.update({
      where: { id: session.user.id },
      data: { twoFAUnlockToken: null, twoFAEncryptedMaster: null, twoFAMasterIv: null },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return NextResponse.json(
        { error: 'Database is temporarily unavailable. Please retry shortly.' },
        { status: 503 }
      );
    }

    console.error('2FA vault setup disable error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        totpSecret: true,
        twoFAUnlockToken: true,
        twoFAEncryptedMaster: true,
        twoFAMasterIv: true,
      },
    });

    const enabled = !!(
      user?.totpSecret &&
      user.twoFAUnlockToken &&
      user.twoFAEncryptedMaster &&
      user.twoFAMasterIv
    );

    return NextResponse.json({ enabled });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return NextResponse.json(
        { error: 'Database is temporarily unavailable. Please retry shortly.' },
        { status: 503 }
      );
    }

    console.error('2FA vault status error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
