import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email')?.trim().toLowerCase();

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  const user = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      vaultPublicKey: true,
      vaultPublicKeyAlgorithm: true,
    },
  });

  if (!user) {
    return NextResponse.json({ hasAccount: false, hasVaultKey: false });
  }

  if (!user.vaultPublicKey) {
    return NextResponse.json({
      hasAccount: true,
      hasVaultKey: false,
      userId: user.id,
      email: user.email,
      name: user.name,
    });
  }

  return NextResponse.json({
    hasAccount: true,
    hasVaultKey: true,
    userId: user.id,
    email: user.email,
    name: user.name,
    vaultPublicKey: user.vaultPublicKey,
    vaultPublicKeyAlgorithm: user.vaultPublicKeyAlgorithm ?? 'RSA-OAEP-256',
  });
}
