import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { revalidateTag } from 'next/cache';
import { db } from '@/lib/db';
import { getCachedPrivateSpacesForUser, privateSpacesHubTag } from '@/lib/private-space-cache';
import { CreatePrivateSpaceSchema } from '@/lib/validations/schemas';
import { z } from 'zod';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const spaces = await getCachedPrivateSpacesForUser(session.user.id);

  return NextResponse.json(
    spaces.map(({ space, ...membership }) => ({
      ...space,
      membership,
    }))
  );
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const body = await req.json();
    const data = CreatePrivateSpaceSchema.parse(body);

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        vaultPublicKey: true,
        vaultPublicKeyAlgorithm: true,
      },
    });

    const nextVaultPublicKey = data.vaultPublicKey ?? user?.vaultPublicKey ?? null;
    const nextVaultPublicKeyAlgorithm =
      data.vaultPublicKeyAlgorithm ?? user?.vaultPublicKeyAlgorithm ?? 'RSA-OAEP-256';

    if (!nextVaultPublicKey) {
      return NextResponse.json(
        { error: 'Set up a vault public key before creating a private space.' },
        { status: 400 }
      );
    }

    const result = await db.$transaction(async (tx) => {
      if (data.vaultPublicKey) {
        await tx.user.update({
          where: { id: userId },
          data: {
            vaultPublicKey: nextVaultPublicKey,
            vaultPublicKeyAlgorithm: nextVaultPublicKeyAlgorithm,
          },
        });
      }

      const space = await tx.privateSpace.create({
        data: {
          name: data.name,
          members: {
            create: {
              userId,
              encryptedSpaceKey: data.encryptedSpaceKey,
            },
          },
        },
        include: {
          members: {
            include: {
              user: {
                select: { id: true, email: true, name: true },
              },
            },
          },
        },
      });

      return space;
    });

    revalidateTag(privateSpacesHubTag(userId), 'max');

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }

    console.error('[CREATE_PRIVATE_SPACE]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
