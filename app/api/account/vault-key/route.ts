import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { UpsertVaultPublicKeySchema } from '@/lib/validations/schemas';
import { z } from 'zod';

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const data = UpsertVaultPublicKeySchema.parse(body);

    await db.user.update({
      where: { id: session.user.id },
      data: {
        vaultPublicKey: data.vaultPublicKey,
        vaultPublicKeyAlgorithm: data.vaultPublicKeyAlgorithm,
      },
    });

    const pendingInvites = await db.spaceInvitation.findMany({
      where: {
        recipientId: session.user.id,
        status: 'PENDING',
        encryptedSpaceKey: null,
      },
      select: { id: true, space: { select: { id: true, name: true } } },
    });

    return NextResponse.json({
      success: true,
      pendingSpaceInvitesNeedingRepair: pendingInvites.map(inv => ({
        id: inv.id,
        spaceId: inv.space.id,
        spaceName: inv.space.name,
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }

    console.error('[ACCOUNT_VAULT_KEY]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
