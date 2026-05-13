import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { ensureSpaceFolderPath } from '@/lib/private-space-folders';
import { normalizeSpacePath, requireSpaceMembership } from '@/lib/private-space';
import { revalidatePrivateSpaceForMembers } from '@/lib/private-space-cache';
import { assertForkWriteAllowed, PrivateSpaceLockdownError } from '@/lib/private-space-governance';
import { ImportProjectIntoPrivateSpaceSchema } from '@/lib/validations/schemas';
import { z } from 'zod';

function fileKey(input: { folderPath: string; name: string }) {
  return `${normalizeSpacePath(input.folderPath)}::${input.name}`;
}

function secretKey(input: { folderPath: string; keyName: string }) {
  return `${normalizeSpacePath(input.folderPath)}::${input.keyName}`;
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
    const data = ImportProjectIntoPrivateSpaceSchema.parse(body);

    const files = data.files.map((file) => ({
      ...file,
      folderPath: normalizeSpacePath(file.folderPath),
    }));
    const secrets = data.secrets.map((secret) => ({
      ...secret,
      folderPath: normalizeSpacePath(secret.folderPath),
    }));
    const fileFolderPaths = Array.from(new Set([
      ...data.fileFolders.map((folderPath) => normalizeSpacePath(folderPath)),
      ...files.map((file) => file.folderPath),
    ]));
    const secretFolderPaths = Array.from(new Set([
      ...data.secretFolders.map((folderPath) => normalizeSpacePath(folderPath)),
      ...secrets.map((secret) => secret.folderPath),
    ]));

    const [existingFiles, existingSecrets] = await Promise.all([
      fileFolderPaths.length === 0
        ? []
        : db.userFile.findMany({
            where: {
              memberId: membership.id,
              folderPath: { in: fileFolderPaths },
              name: { in: Array.from(new Set(files.map((file) => file.name))) },
            },
            select: {
              id: true,
              name: true,
              folderPath: true,
              kingFileId: true,
            },
          }),
      secretFolderPaths.length === 0
        ? []
        : db.userSecret.findMany({
            where: {
              memberId: membership.id,
              folderPath: { in: secretFolderPaths },
              keyName: { in: Array.from(new Set(secrets.map((secret) => secret.keyName))) },
            },
            select: {
              id: true,
              keyName: true,
              folderPath: true,
              kingSecretId: true,
            },
          }),
    ]);

    const existingFilesByKey = new Map(existingFiles.map((file) => [fileKey(file), file]));
    const existingSecretsByKey = new Map(existingSecrets.map((secret) => [secretKey(secret), secret]));

    const fileConflicts = files
      .filter((file) => existingFilesByKey.get(fileKey(file))?.kingFileId)
      .map((file) => `${file.folderPath}/${file.name}`.replace('//', '/'));
    const secretConflicts = secrets
      .filter((secret) => existingSecretsByKey.get(secretKey(secret))?.kingSecretId)
      .map((secret) => `${secret.folderPath}/${secret.keyName}`.replace('//', '/'));

    if (fileConflicts.length > 0 || secretConflicts.length > 0) {
      return NextResponse.json(
        {
          error: 'Some imported items would overwrite existing king-linked forks.',
          fileConflicts,
          secretConflicts,
        },
        { status: 409 }
      );
    }

    const imported = await db.$transaction(async (tx) => {
      await assertForkWriteAllowed(tx, spaceId);

      for (const folderPath of fileFolderPaths) {
        await ensureSpaceFolderPath(tx, {
          spaceId,
          memberId: membership.id,
          visibility: 'PERSONAL',
          domain: 'FILE',
          folderPath,
        });
      }

      for (const folderPath of secretFolderPaths) {
        await ensureSpaceFolderPath(tx, {
          spaceId,
          memberId: membership.id,
          visibility: 'PERSONAL',
          domain: 'SECRET',
          folderPath,
        });
      }

      const savedFiles = [] as Array<{
        id: string;
        kingFileId: string | null;
        workspaceMode: 'DRAFT' | 'FORK' | 'SYNC';
        name: string;
        contentEncrypted: string;
        iv: string;
        folderPath: string;
        createdAt: Date;
        updatedAt: Date;
      }>;
      for (const file of files) {
        const existing = existingFilesByKey.get(fileKey(file));
        if (existing) {
          savedFiles.push(
            await tx.userFile.update({
              where: { id: existing.id },
              data: {
                workspaceMode: 'DRAFT',
                kingFileId: null,
                name: file.name,
                contentEncrypted: file.contentEncrypted,
                iv: file.iv,
                folderPath: file.folderPath,
              },
            })
          );
          continue;
        }

        savedFiles.push(
          await tx.userFile.create({
            data: {
              memberId: membership.id,
              workspaceMode: 'DRAFT',
              kingFileId: null,
              name: file.name,
              contentEncrypted: file.contentEncrypted,
              iv: file.iv,
              folderPath: file.folderPath,
            },
          })
        );
      }

      const savedSecrets = [] as Array<{
        id: string;
        kingSecretId: string | null;
        workspaceMode: 'DRAFT' | 'FORK' | 'SYNC';
        keyName: string | null;
        valueEncrypted: string;
        iv: string;
        folderPath: string;
        createdAt: Date;
        updatedAt: Date;
      }>;
      for (const secret of secrets) {
        const existing = existingSecretsByKey.get(secretKey(secret));
        if (existing) {
          savedSecrets.push(
            await tx.userSecret.update({
              where: { id: existing.id },
              data: {
                workspaceMode: 'DRAFT',
                kingSecretId: null,
                keyName: secret.keyName,
                valueEncrypted: secret.valueEncrypted,
                iv: secret.iv,
                folderPath: secret.folderPath,
              },
            })
          );
          continue;
        }

        savedSecrets.push(
          await tx.userSecret.create({
            data: {
              memberId: membership.id,
              workspaceMode: 'DRAFT',
              kingSecretId: null,
              keyName: secret.keyName,
              valueEncrypted: secret.valueEncrypted,
              iv: secret.iv,
              folderPath: secret.folderPath,
            },
          })
        );
      }

      const folderPaths = {
        file: new Set(fileFolderPaths),
        secret: new Set(secretFolderPaths),
      };

      const folderFilters = [
        folderPaths.file.size > 0
          ? {
              domain: 'FILE' as const,
              path: { in: Array.from(folderPaths.file) },
            }
          : null,
        folderPaths.secret.size > 0
          ? {
              domain: 'SECRET' as const,
              path: { in: Array.from(folderPaths.secret) },
            }
          : null,
      ].filter((value): value is { domain: 'FILE' | 'SECRET'; path: { in: string[] } } => value !== null);

      const importedFolders = folderFilters.length > 0
        ? await tx.spaceFolder.findMany({
            where: {
              spaceId,
              memberId: membership.id,
              visibility: 'PERSONAL',
              OR: folderFilters,
            },
            orderBy: [{ domain: 'asc' }, { path: 'asc' }],
          })
        : [];

      return {
        files: savedFiles,
        secrets: savedSecrets,
        folders: importedFolders,
      };
    });

    await revalidatePrivateSpaceForMembers(spaceId);

    return NextResponse.json({
      rootFolderPath: normalizeSpacePath(data.rootFolderPath),
      projectId: data.projectId,
      projectName: data.projectName,
      summary: {
        filesImported: imported.files.length,
        secretsImported: imported.secrets.length,
        foldersSynced: imported.folders.length,
      },
      files: imported.files.map((file) => ({
        id: file.id,
        kingFileId: file.kingFileId,
        workspaceMode: file.workspaceMode,
        name: file.name,
        contentEncrypted: file.contentEncrypted,
        iv: file.iv,
        folderPath: file.folderPath,
        createdAt: file.createdAt.toISOString(),
        updatedAt: file.updatedAt.toISOString(),
        kingFile: null,
        peers: [],
      })),
      secrets: imported.secrets.map((secret) => ({
        id: secret.id,
        kingSecretId: secret.kingSecretId,
        workspaceMode: secret.workspaceMode,
        keyName: secret.keyName ?? 'Imported secret',
        valueEncrypted: secret.valueEncrypted,
        iv: secret.iv,
        folderPath: secret.folderPath,
        createdAt: secret.createdAt.toISOString(),
        updatedAt: secret.updatedAt.toISOString(),
        kingSecret: null,
      })),
      folders: imported.folders.map((folder) => ({
        id: folder.id,
        visibility: folder.visibility,
        domain: folder.domain,
        name: folder.name,
        path: folder.path,
        parentId: folder.parentId,
        memberId: folder.memberId,
        createdAt: folder.createdAt.toISOString(),
        updatedAt: folder.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof PrivateSpaceLockdownError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }

    console.error('[PRIVATE_SPACE_IMPORT_PROJECT]', error);
    return NextResponse.json({ error: 'Could not import project into private space' }, { status: 500 });
  }
}
