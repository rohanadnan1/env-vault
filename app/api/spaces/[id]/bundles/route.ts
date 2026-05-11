import { NextResponse } from 'next/server';
import { BundleType } from '@prisma/client';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { requireSpaceMembership } from '@/lib/private-space';
import { privateSpaceWorkspaceTag } from '@/lib/private-space-cache';

const CreateSpaceBundleSchema = z.object({
  name: z.string().min(1).max(120),
  bundleType: z.nativeEnum(BundleType).default(BundleType.CUSTOM),
  matchRule: z.string().nullable().optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: spaceId } = await params;
  const membership = await requireSpaceMembership(spaceId, session.user.id);
  if (!membership) {
    return NextResponse.json({ error: 'Private space not found' }, { status: 404 });
  }

  const bundles = await db.spaceBundle.findMany({
    where: { memberId: membership.id },
    include: {
      members: {
        select: {
          userFileId: true,
          addedAt: true,
        },
        orderBy: { addedAt: 'asc' },
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  return NextResponse.json(bundles);
}

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
    const data = CreateSpaceBundleSchema.parse(body);

    const sortOrder = await db.spaceBundle.count({ where: { memberId: membership.id } });
    const bundle = await db.spaceBundle.create({
      data: {
        memberId: membership.id,
        name: data.name.trim(),
        bundleType: data.bundleType,
        matchRule: data.matchRule ?? null,
        sortOrder,
      },
      include: {
        members: {
          select: {
            userFileId: true,
            addedAt: true,
          },
        },
      },
    });

    revalidateTag(privateSpaceWorkspaceTag(spaceId, session.user.id), 'max');
    return NextResponse.json(bundle, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }

    console.error('[PRIVATE_SPACE_BUNDLE_CREATE]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
