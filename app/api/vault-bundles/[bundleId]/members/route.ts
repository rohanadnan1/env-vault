import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

const AddMemberSchema = z.object({ fileId: z.string() });

async function checkBundleOwnership(bundleId: string, userId: string) {
  return db.fileBundle.findFirst({
    where: { id: bundleId, environment: { project: { userId } } },
  });
}

/** POST — add a file to a bundle */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ bundleId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { bundleId } = await params;

  const bundle = await checkBundleOwnership(bundleId, session.user.id);
  if (!bundle) return NextResponse.json({ error: 'Not found or unauthorized' }, { status: 404 });

  try {
    const { fileId } = AddMemberSchema.parse(await req.json());

    // Remove from any existing bundle first (one file → one bundle)
    await db.fileBundleMember.deleteMany({ where: { fileId } });

    const member = await db.fileBundleMember.create({
      data: { fileId, bundleId },
      select: { fileId: true, bundleId: true, addedAt: true },
    });

    return NextResponse.json(member, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/** DELETE — remove a file from a bundle */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ bundleId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { bundleId } = await params;

  const bundle = await checkBundleOwnership(bundleId, session.user.id);
  if (!bundle) return NextResponse.json({ error: 'Not found or unauthorized' }, { status: 404 });

  const { fileId } = AddMemberSchema.parse(await req.json());

  await db.fileBundleMember.deleteMany({ where: { fileId, bundleId } });
  return NextResponse.json({ success: true });
}
