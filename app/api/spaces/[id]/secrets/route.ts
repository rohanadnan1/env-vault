import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { CreatePrivateSpaceSecretSchema } from '@/lib/validations/schemas';
import { revalidatePrivateSpaceForMembers } from '@/lib/private-space-cache';
import { assertPrivateSpaceWriteAllowed, PrivateSpaceLockdownError } from '@/lib/private-space-governance';
import { requireSpaceMembership } from '@/lib/private-space';
import { z } from 'zod';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: spaceId } = await params;
  const membership = await requireSpaceMembership(spaceId, session.user.id);
  if (!membership) {
    return NextResponse.json({ error: 'Private space not found' }, { status: 404 });
  }

  try {
    const body = await req.json();
    const data = CreatePrivateSpaceSecretSchema.parse(body);

    const result = await db.$transaction(async (tx) => {
      await assertPrivateSpaceWriteAllowed(tx, spaceId);
      const kingSecret = await tx.kingSecret.create({
        data: {
          spaceId,
          keyName: data.keyName,
          valueEncrypted: data.valueEncrypted,
          iv: data.iv,
        },
      });

      await tx.kingSecretHistory.create({
        data: {
          kingSecretId: kingSecret.id,
          valueEncrypted: kingSecret.valueEncrypted,
          iv: kingSecret.iv,
          revisionNumber: 1,
          previousHistoryId: null,
        },
      });

      return kingSecret;
    });

    await revalidatePrivateSpaceForMembers(spaceId);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof PrivateSpaceLockdownError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }

    console.error('[PRIVATE_SPACE_CREATE_SECRET]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
