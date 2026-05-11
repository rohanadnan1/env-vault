import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { requireSpaceMembership } from '@/lib/private-space';
import { privateSpaceWorkspaceTag } from '@/lib/private-space-cache';

const SpaceBundleMemberSchema = z.object({
  userFileId: z.string().min(1),
});

async function getBundleAndFile(bundleId: string, memberId: string, userFileId: string) {
  const [bundle, userFile] = await Promise.all([
    db.spaceBundle.findFirst({
      where: {
        id: bundleId,
        memberId,
      },
    }),
    db.userFile.findFirst({
      where: {
        id: userFileId,
        memberId,
      },
    }),
  ]);

  return { bundle, userFile };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string; bundleId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: spaceId, bundleId } = await params;
  const membership = await requireSpaceMembership(spaceId, session.user.id);
  if (!membership) {
    return NextResponse.json({ error: 'Private space not found' }, { status: 404 });
  }

  try {
    const { userFileId } = SpaceBundleMemberSchema.parse(await req.json());
    const { bundle, userFile } = await getBundleAndFile(bundleId, membership.id, userFileId);

    if (!bundle || !userFile) {
      return NextResponse.json({ error: 'Bundle or file not found' }, { status: 404 });
    }

    await db.$transaction(async (tx) => {
      await tx.spaceBundleMember.deleteMany({ where: { userFileId } });
      await tx.spaceBundleMember.create({
        data: {
          userFileId,
          bundleId,
        },
      });
    });

    revalidateTag(privateSpaceWorkspaceTag(spaceId, session.user.id), 'max');
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }

    console.error('[PRIVATE_SPACE_BUNDLE_MEMBER_ADD]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; bundleId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: spaceId, bundleId } = await params;
  const membership = await requireSpaceMembership(spaceId, session.user.id);
  if (!membership) {
    return NextResponse.json({ error: 'Private space not found' }, { status: 404 });
  }

  try {
    const { userFileId } = SpaceBundleMemberSchema.parse(await req.json());
    const { bundle, userFile } = await getBundleAndFile(bundleId, membership.id, userFileId);

    if (!bundle || !userFile) {
      return NextResponse.json({ error: 'Bundle or file not found' }, { status: 404 });
    }

    await db.spaceBundleMember.deleteMany({
      where: {
        bundleId,
        userFileId,
      },
    });

    revalidateTag(privateSpaceWorkspaceTag(spaceId, session.user.id), 'max');
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }

    console.error('[PRIVATE_SPACE_BUNDLE_MEMBER_REMOVE]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
