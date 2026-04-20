import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db, buildFolderTree } from '@/lib/db';
import { CreateFolderSchema } from '@/lib/validations/schemas';
import { isVariablesFolderName } from '@/lib/variables-folder';
import { z } from 'zod';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const environmentId = searchParams.get('envId');

  if (!environmentId) {
    return NextResponse.json({ error: 'Environment ID is required' }, { status: 400 });
  }

  try {
    const env = await db.environment.findUnique({
      where: { id: environmentId },
      include: { project: { select: { userId: true } } }
    });

    if (!env || env.project.userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const allFolders = await db.folder.findMany({
      where: { environmentId },
      orderBy: { createdAt: 'asc' }
    });

    const tree = buildFolderTree(allFolders);
    return NextResponse.json(tree);
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to get folder tree' }, { status: 404 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const data = CreateFolderSchema.parse(body);

    // Verify environment ownership
    const env = await db.environment.findUnique({
      where: { id: data.environmentId },
      include: { project: { select: { userId: true } } }
    });

    if (!env || env.project.userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // If parentId is provided, verify it belongs to the same environment
    if (data.parentId) {
      const parent = await db.folder.findUnique({
        where: { id: data.parentId },
        select: { environmentId: true, name: true }
      });
      if (!parent || parent.environmentId !== data.environmentId) {
        return NextResponse.json({ error: 'Invalid parent folder' }, { status: 400 });
      }

      if (isVariablesFolderName(parent.name)) {
        return NextResponse.json({ error: 'Cannot create subfolders inside an env folder' }, { status: 400 });
      }
    } else if (isVariablesFolderName(data.name)) {
      return NextResponse.json({ error: 'The root folder name "env" is reserved' }, { status: 400 });
    }

    const folder = await db.folder.create({
      data: {
        name: data.name,
        environmentId: data.environmentId,
        parentId: data.parentId,
      },
    });

    return NextResponse.json(folder, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: (e as z.ZodError).issues[0].message }, { status: 400 });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
