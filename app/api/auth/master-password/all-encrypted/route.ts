import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

// Returns every encrypted blob the user owns along with the metadata needed
// to reconstruct the AAD used during the original encryption.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;

  try {
    const projects = await db.project.findMany({ where: { userId }, select: { id: true } });
    const projectIds = projects.map((p) => p.id);
    const environments = await db.environment.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    });
    const envIds = environments.map((e) => e.id);

    const folders = await db.folder.findMany({
      where: { environmentId: { in: envIds } },
      select: { id: true },
    });

    const [secrets, secretHistories, files, fileHistories, fileComments] = await Promise.all([
      db.secret.findMany({
        where: { environmentId: { in: envIds } },
        select: { id: true, valueEncrypted: true, iv: true, keyName: true, environmentId: true },
      }),
      db.secretHistory.findMany({
        where: { secret: { environmentId: { in: envIds } } },
        select: {
          id: true, valueEncrypted: true, iv: true,
          secret: { select: { keyName: true, environmentId: true } },
        },
      }),
      db.vaultFile.findMany({
        where: { environmentId: { in: envIds } },
        select: { id: true, contentEncrypted: true, iv: true, name: true, environmentId: true, folderId: true },
      }),
      db.fileHistory.findMany({
        where: { file: { environmentId: { in: envIds } } },
        select: {
          id: true, contentEncrypted: true, iv: true, name: true,
          file: { select: { environmentId: true, folderId: true } },
        },
      }),
      db.fileComment.findMany({
        where: { file: { environmentId: { in: envIds } }, isEncrypted: true },
        select: { id: true, content: true, iv: true, fileId: true },
      }),
    ]);

    return NextResponse.json({
      secrets,
      secretHistories: secretHistories.map((h) => ({
        id: h.id,
        valueEncrypted: h.valueEncrypted,
        iv: h.iv,
        keyName: h.secret.keyName,
        environmentId: h.secret.environmentId,
      })),
      files,
      fileHistories: fileHistories.map((h) => ({
        id: h.id,
        contentEncrypted: h.contentEncrypted,
        iv: h.iv,
        name: h.name,
        environmentId: h.file.environmentId,
        folderId: h.file.folderId,
      })),
      fileComments,
      // All folder IDs across all environments — used by the client to brute-force
      // the original AAD when a file was encrypted with a now-stale folderId.
      folderIds: folders.map((f) => f.id),
    });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
