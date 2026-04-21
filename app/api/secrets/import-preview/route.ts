import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { findVariablesFolder, isVariablesFolderName } from '@/lib/variables-folder';
import { z } from 'zod';

const ImportPreviewSchema = z.object({
  environmentId: z.string().cuid(),
  folderId: z.string().cuid().nullable().optional(),
  keys: z.array(z.string().min(1)).max(1000),
});

async function resolveTargetFolderForPreview(environmentId: string, requestedFolderId: string | null) {
  if (!requestedFolderId) {
    const rootSystemFolder = await findVariablesFolder(db, environmentId, null);
    return rootSystemFolder?.id ?? null;
  }

  const requestedFolder = await db.folder.findUnique({
    where: { id: requestedFolderId },
    select: { id: true, name: true, environmentId: true },
  });

  if (!requestedFolder || requestedFolder.environmentId !== environmentId) {
    throw new Error('Invalid folder');
  }

  if (isVariablesFolderName(requestedFolder.name)) {
    return requestedFolder.id;
  }

  const nestedSystemFolder = await findVariablesFolder(db, environmentId, requestedFolder.id);
  return nestedSystemFolder?.id ?? null;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const data = ImportPreviewSchema.parse(body);

    const env = await db.environment.findUnique({
      where: { id: data.environmentId },
      include: { project: { select: { userId: true } } },
    });

    if (!env || env.project.userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const targetFolderId = await resolveTargetFolderForPreview(data.environmentId, data.folderId ?? null);

    if (!targetFolderId) {
      return NextResponse.json({
        targetFolderId: null,
        existing: [],
      });
    }

    const existing = await db.secret.findMany({
      where: {
        environmentId: data.environmentId,
        folderId: targetFolderId,
        keyName: { in: data.keys },
      },
      select: {
        id: true,
        keyName: true,
        valueEncrypted: true,
        iv: true,
      },
    });

    return NextResponse.json({
      targetFolderId,
      existing,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Invalid folder') {
      return NextResponse.json({ error: 'Invalid folder' }, { status: 400 });
    }
    if (typeof error === 'object' && error !== null && 'issues' in error) {
      const issues = (error as { issues?: Array<{ message?: string }> }).issues;
      return NextResponse.json({ error: issues?.[0]?.message || 'Invalid request' }, { status: 400 });
    }
    console.error('[SECRETS_IMPORT_PREVIEW]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
