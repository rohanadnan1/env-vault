import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';
import { BundleType } from '@prisma/client';

const CreateBundleSchema = z.object({
  name: z.string().min(1).max(120),
  bundleType: z.nativeEnum(BundleType),
  matchRule: z.string().optional().nullable(),
  environmentId: z.string(),
  folderId: z.string().nullable().optional(),
  fileIds: z.array(z.string()).optional().default([]),
});

/** Verify the caller owns the environment */
async function checkEnvOwnership(environmentId: string, userId: string) {
  const env = await db.environment.findFirst({
    where: { id: environmentId, project: { userId } },
    select: { id: true },
  });
  return !!env;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const environmentId = searchParams.get('environmentId');
  const folderId = searchParams.get('folderId'); // null string = root

  if (!environmentId) return NextResponse.json({ error: 'environmentId required' }, { status: 400 });

  const owned = await checkEnvOwnership(environmentId, session.user.id);
  if (!owned) return NextResponse.json({ error: 'Not found or unauthorized' }, { status: 404 });

  const bundles = await db.fileBundle.findMany({
    where: {
      environmentId,
      folderId: folderId === 'null' || folderId === null ? null : folderId,
    },
    orderBy: { sortOrder: 'asc' },
    include: {
      members: { select: { fileId: true, addedAt: true } },
    },
  });

  return NextResponse.json(bundles);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const data = CreateBundleSchema.parse(body);

    const owned = await checkEnvOwnership(data.environmentId, session.user.id);
    if (!owned) return NextResponse.json({ error: 'Not found or unauthorized' }, { status: 404 });

    const bundle = await db.$transaction(async (tx) => {
      const newBundle = await tx.fileBundle.create({
        data: {
          name: data.name,
          bundleType: data.bundleType,
          matchRule: data.matchRule ?? null,
          environmentId: data.environmentId,
          folderId: data.folderId ?? null,
        },
      });

      if (data.fileIds.length > 0) {
        await tx.fileBundleMember.createMany({
          data: data.fileIds.map((fileId) => ({ fileId, bundleId: newBundle.id })),
          skipDuplicates: true,
        });
      }

      return tx.fileBundle.findUnique({
        where: { id: newBundle.id },
        include: { members: { select: { fileId: true, addedAt: true } } },
      });
    });

    return NextResponse.json(bundle, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
