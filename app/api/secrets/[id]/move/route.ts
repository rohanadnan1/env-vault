import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { resolveSecretTargetFolder } from '@/lib/variables-folder';
import { z } from 'zod';

const MoveSchema = z.object({
  // null means move to environment root (no folder)
  folderId: z.string().nullable(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  // Verify secret ownership
  const secret = await db.secret.findUnique({
    where: { id },
    include: {
      environment: { include: { project: { select: { userId: true } } } },
    },
  });

  if (!secret || secret.environment.project.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found or unauthorized' }, { status: 404 });
  }

  try {
    const body = await req.json();
    const { folderId } = MoveSchema.parse(body);

    if (!folderId) {
      return NextResponse.json(
        { error: 'Secrets must stay inside an env folder and cannot be moved to root.' },
        { status: 400 }
      );
    }

    const placement = await resolveSecretTargetFolder(db, secret.environmentId, folderId);

    // Check for key name collision in target scope
    const conflict = await db.secret.findFirst({
      where: {
        environmentId: secret.environmentId,
        folderId: placement.targetFolderId,
        keyName: secret.keyName,
        NOT: { id },
      },
    });

    if (conflict) {
      return NextResponse.json(
        { error: `Key "${secret.keyName}" already exists in the target folder` },
        { status: 409 }
      );
    }

    const updated = await db.secret.update({
      where: { id },
      data: { folderId: placement.targetFolderId },
    });

    return NextResponse.json({
      ...updated,
      migratedToVariablesFolder: placement.migratedToVariablesFolder,
      autoCreatedVariablesFolder: placement.autoCreatedVariablesFolder,
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'Invalid folder') {
      return NextResponse.json({ error: 'Invalid target folder' }, { status: 400 });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: (e as z.ZodError).issues[0].message }, { status: 400 });
    }
    console.error('[SECRET_MOVE]', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
