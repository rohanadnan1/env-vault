import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { CreateVaultFileSchema } from '@/lib/validations/schemas';
import { isVariablesFolderName } from '@/lib/variables-folder';
import { z } from 'zod';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const envId = searchParams.get('envId');
  const folderId = searchParams.get('folderId');

  if (!envId) {
    return NextResponse.json({ error: 'Environment ID is required' }, { status: 400 });
  }

  // Verify ownership of the environment
  const env = await db.environment.findUnique({
    where: { id: envId },
    include: { project: { select: { userId: true } } }
  });

  if (!env || env.project.userId !== session.user.id) {
    return NextResponse.json({ error: 'Unauthorized environment' }, { status: 403 });
  }

  const files = await db.vaultFile.findMany({
    where: { 
      environmentId: envId,
      folderId: folderId || null
    },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      mimeType: true,
      createdAt: true,
      updatedAt: true,
    }
  });

  return NextResponse.json(files);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const data = CreateVaultFileSchema.parse(body);

    // Verify ownership of environment
    const env = await db.environment.findUnique({
      where: { id: data.environmentId },
      include: { project: { select: { userId: true } } }
    });

    if (!env || env.project.userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized environment' }, { status: 403 });
    }

    // If folderId provided, verify it belongs to this environment
    if (data.folderId) {
      const folder = await db.folder.findUnique({
        where: { id: data.folderId, environmentId: data.environmentId }
      });
      if (!folder) return NextResponse.json({ error: 'Invalid folder' }, { status: 400 });
      if (isVariablesFolderName(folder.name)) {
        return NextResponse.json(
          { error: 'Files cannot be created inside an env folder' },
          { status: 400 }
        );
      }
    }

    const file = await db.$transaction(async (tx) => {
      // Auto-rename if a file with the same name already exists in this scope
      let resolvedName = data.name;
      const conflict = await tx.vaultFile.findFirst({
        where: {
          environmentId: data.environmentId,
          folderId: data.folderId || null,
          name: data.name,
        },
      });
      if (conflict) {
        // Split into base + extension (handles dotfiles like .env → base='.env', ext='')
        const lastDot = data.name.lastIndexOf('.');
        const hasExt = lastDot > 0; // lastDot > 0 excludes leading-dot files like ".env"
        const base = hasExt ? data.name.slice(0, lastDot) : data.name;
        const ext  = hasExt ? data.name.slice(lastDot)   : '';
        let counter = 1;
        while (true) {
          const candidate = `${base}${counter}${ext}`;
          const taken = await tx.vaultFile.findFirst({
            where: {
              environmentId: data.environmentId,
              folderId: data.folderId || null,
              name: candidate,
            },
          });
          if (!taken) { resolvedName = candidate; break; }
          counter++;
        }
      }

      const created = await tx.vaultFile.create({
        data: {
          name: resolvedName,
          contentEncrypted: data.contentEncrypted,
          iv: data.iv,
          mimeType: data.mimeType || 'text/plain',
          environmentId: data.environmentId,
          folderId: data.folderId || null,
        },
      });

      await tx.fileHistory.create({
        data: {
          fileId: created.id,
          name: created.name,
          contentEncrypted: created.contentEncrypted,
          iv: created.iv,
          revisionNumber: 1,
          previousHistoryId: null,
        },
      });

      return created;
    });

    return NextResponse.json(file, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: (e as z.ZodError).issues[0].message }, { status: 400 });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
