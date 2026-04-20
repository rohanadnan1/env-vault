import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { isVariablesFolderName } from '@/lib/variables-folder';
import { z } from 'zod';

const MoveSchema = z.object({
  // null means move to environment root (no parent)
  parentId: z.string().nullable(),
  environmentId: z.string(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  // Verify folder ownership
  const folder = await db.folder.findUnique({
    where: { id },
    include: {
      environment: { include: { project: { select: { userId: true } } } },
    },
  });

  if (!folder || folder.environment.project.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found or unauthorized' }, { status: 404 });
  }

  if (isVariablesFolderName(folder.name)) {
    return NextResponse.json({ error: 'Env folders cannot be moved' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { parentId, environmentId } = MoveSchema.parse(body);

    // Prevent moving a folder into itself
    if (parentId === id) {
      return NextResponse.json({ error: 'Cannot move a folder into itself' }, { status: 400 });
    }

    // Verify target parent belongs to the same environment (if provided)
    if (parentId) {
      const parent = await db.folder.findUnique({
        where: { id: parentId },
        select: { environmentId: true, name: true },
      });
      if (!parent || parent.environmentId !== (environmentId || folder.environmentId)) {
        return NextResponse.json({ error: 'Invalid target folder' }, { status: 400 });
      }
      if (isVariablesFolderName(parent.name)) {
        return NextResponse.json({ error: 'Cannot move folders into an env folder' }, { status: 400 });
      }
    }

    const updated = await db.folder.update({
      where: { id },
      data: { parentId },
    });

    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: (e as z.ZodError).issues[0].message }, { status: 400 });
    }
    console.error('[FOLDER_MOVE]', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
