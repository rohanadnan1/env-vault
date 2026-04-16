import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db, getFolderTree } from '@/lib/db';
import { CreateFolderSchema } from '@/lib/validations/schemas';
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
    const tree = await getFolderTree(environmentId, session.user.id);
    return NextResponse.json(tree);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 404 });
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
        select: { environmentId: true }
      });
      if (!parent || parent.environmentId !== data.environmentId) {
        return NextResponse.json({ error: 'Invalid parent folder' }, { status: 400 });
      }
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
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
