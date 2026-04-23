import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';
import { BundleType } from '@prisma/client';

const UpdateBundleSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  bundleType: z.nativeEnum(BundleType).optional(),
  matchRule: z.string().nullable().optional(),
});

async function checkBundleOwnership(bundleId: string, userId: string) {
  const bundle = await db.fileBundle.findFirst({
    where: { id: bundleId, environment: { project: { userId } } },
    include: { members: { select: { fileId: true, addedAt: true } } },
  });
  return bundle;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ bundleId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { bundleId } = await params;

  const bundle = await checkBundleOwnership(bundleId, session.user.id);
  if (!bundle) return NextResponse.json({ error: 'Not found or unauthorized' }, { status: 404 });

  try {
    const body = await req.json();
    const data = UpdateBundleSchema.parse(body);

    const updated = await db.fileBundle.update({
      where: { id: bundleId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.bundleType !== undefined && { bundleType: data.bundleType }),
        ...(data.matchRule !== undefined && { matchRule: data.matchRule }),
      },
      include: { members: { select: { fileId: true, addedAt: true } } },
    });

    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ bundleId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { bundleId } = await params;

  const bundle = await checkBundleOwnership(bundleId, session.user.id);
  if (!bundle) return NextResponse.json({ error: 'Not found or unauthorized' }, { status: 404 });

  // Delete cascade removes FileBundleMember rows automatically (onDelete: Cascade)
  await db.fileBundle.delete({ where: { id: bundleId } });
  return NextResponse.json({ success: true });
}
