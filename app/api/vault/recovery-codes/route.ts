import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

const SaveCodesSchema = z.object({
  codes: z.array(z.object({
    codeOrder: z.number(),
    codeEncrypted: z.string().min(1),
    iv: z.string().min(1),
  })),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const codes = await db.vaultStoredRecoveryCode.findMany({
    where: { userId: session.user.id },
    orderBy: { codeOrder: 'asc' },
    select: {
      id: true,
      codeOrder: true,
      isUsed: true,
      usedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    codes: codes.map(c => ({
      ...c,
      usedAt: c.usedAt?.toISOString() || null,
      createdAt: c.createdAt.toISOString(),
    })),
    total: codes.length,
    unused: codes.filter(c => !c.isUsed).length,
    used: codes.filter(c => c.isUsed).length,
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = SaveCodesSchema.parse(await req.json());

    await db.vaultStoredRecoveryCode.deleteMany({
      where: { userId: session.user.id },
    });

    const created = await db.$transaction(
      body.codes.map(c =>
        db.vaultStoredRecoveryCode.create({
          data: {
            userId: session.user.id,
            codeOrder: c.codeOrder,
            codeEncrypted: c.codeEncrypted,
            iv: c.iv,
          },
        })
      )
    );

    return NextResponse.json({ saved: created.length }, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (id) {
    await db.vaultStoredRecoveryCode.delete({ where: { id, userId: session.user.id } });
  } else {
    await db.vaultStoredRecoveryCode.deleteMany({ where: { userId: session.user.id } });
  }

  return NextResponse.json({ success: true });
}
