import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { requireSpaceMembership } from '@/lib/private-space';
import { privateSpaceWorkspaceTag } from '@/lib/private-space-cache';

const UpdateSpaceBundleSchema = z.object({
  name: z.string().min(1).max(120).optional(),
});

async function getOwnedBundle(bundleId: string, memberId: string) {
  return db.spaceBundle.findFirst({
    where: {
      id: bundleId,
      memberId,
    },
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; bundleId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: spaceId, bundleId } = await params;
  const membership = await requireSpaceMembership(spaceId, session.user.id);
  if (!membership) {
    return NextResponse.json({ error: 'Private space not found' }, { status: 404 });
  }

  const bundle = await getOwnedBundle(bundleId, membership.id);
  if (!bundle) {
    return NextResponse.json({ error: 'Bundle not found' }, { status: 404 });
  }

  try {
    const body = await req.json();
    const data = UpdateSpaceBundleSchema.parse(body);
    const updated = await db.spaceBundle.update({
      where: { id: bundleId },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      },
    });

    revalidateTag(privateSpaceWorkspaceTag(spaceId, session.user.id), 'max');
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }

    console.error('[PRIVATE_SPACE_BUNDLE_UPDATE]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; bundleId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: spaceId, bundleId } = await params;
  const membership = await requireSpaceMembership(spaceId, session.user.id);
  if (!membership) {
    return NextResponse.json({ error: 'Private space not found' }, { status: 404 });
  }

  const bundle = await getOwnedBundle(bundleId, membership.id);
  if (!bundle) {
    return NextResponse.json({ error: 'Bundle not found' }, { status: 404 });
  }

  await db.spaceBundle.delete({ where: { id: bundleId } });
  revalidateTag(privateSpaceWorkspaceTag(spaceId, session.user.id), 'max');
  return NextResponse.json({ success: true });
}
