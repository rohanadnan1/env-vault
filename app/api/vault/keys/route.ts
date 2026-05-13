import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

const SaveKeySchema = z.object({
  spaceId: z.string().optional(),
  spaceName: z.string().optional(),
  keyType: z.string().optional(),
  publicKey: z.string().min(1),
  privateKey: z.string().optional(),
  algorithm: z.string().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const keys = await db.vaultStoredKey.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(keys.map(k => ({
    ...k,
    createdAt: k.createdAt.toISOString(),
    updatedAt: k.updatedAt.toISOString(),
  })));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = SaveKeySchema.parse(await req.json());

    const existing = body.spaceId ? await db.vaultStoredKey.findFirst({
      where: { userId: session.user.id, spaceId: body.spaceId },
    }) : null;

    if (existing) {
      const updated = await db.vaultStoredKey.update({
        where: { id: existing.id },
        data: {
          publicKey: body.publicKey,
          privateKey: body.privateKey ?? existing.privateKey,
          algorithm: body.algorithm ?? existing.algorithm,
          spaceName: body.spaceName ?? existing.spaceName,
        },
      });
      return NextResponse.json({ ...updated, updatedAt: updated.updatedAt.toISOString() });
    }

    const key = await db.vaultStoredKey.create({
      data: {
        userId: session.user.id,
        spaceId: body.spaceId,
        spaceName: body.spaceName || '',
        keyType: body.keyType || 'PRIVATE_SPACE',
        publicKey: body.publicKey,
        privateKey: body.privateKey,
        algorithm: body.algorithm || 'RSA-OAEP-256',
      },
    });

    return NextResponse.json({ ...key, createdAt: key.createdAt.toISOString() }, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
