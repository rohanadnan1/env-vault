import { Prisma } from '@prisma/client';
import { normalizeSpacePath } from '@/lib/private-space';

export function buildSpaceFolderPath(parentPath: string, name: string) {
  const normalizedParent = normalizeSpacePath(parentPath);
  const trimmedName = name.trim().replaceAll('/', '').trim();
  if (!trimmedName) {
    throw new Error('Folder name is required');
  }
  return normalizedParent === '/' ? `/${trimmedName}` : `${normalizedParent}/${trimmedName}`;
}

export async function ensureSpaceFolderPath(
  tx: Prisma.TransactionClient,
  input: {
    spaceId: string;
    memberId?: string | null;
    visibility: 'PERSONAL' | 'KING';
    domain: 'FILE' | 'SECRET';
    folderPath?: string | null;
  }
) {
  const normalizedPath = normalizeSpacePath(input.folderPath);
  if (normalizedPath === '/') return;

  const segments = normalizedPath.split('/').filter(Boolean);
  let currentPath = '';

  for (const segment of segments) {
    const parentPath = currentPath || '/';
    currentPath = `${currentPath}/${segment}`;
    const parent = currentPath === `/${segment}`
      ? null
      : await tx.spaceFolder.findFirst({
          where: {
            spaceId: input.spaceId,
            memberId: input.memberId ?? null,
            visibility: input.visibility,
            domain: input.domain,
            path: parentPath,
          },
          select: { id: true },
        });

    const existing = await tx.spaceFolder.findFirst({
      where: {
        spaceId: input.spaceId,
        memberId: input.memberId ?? null,
        visibility: input.visibility,
        domain: input.domain,
        path: currentPath,
      },
      select: { id: true },
    });

    if (existing) {
      continue;
    }

    try {
      await tx.spaceFolder.create({
        data: {
          spaceId: input.spaceId,
          memberId: input.memberId ?? null,
          visibility: input.visibility,
          domain: input.domain,
          name: segment,
          path: currentPath,
          parentId: parent?.id ?? null,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const concurrentFolder = await tx.spaceFolder.findFirst({
          where: {
            spaceId: input.spaceId,
            memberId: input.memberId ?? null,
            visibility: input.visibility,
            domain: input.domain,
            path: currentPath,
          },
          select: { id: true },
        });

        if (concurrentFolder) {
          continue;
        }
      }

      throw error;
    }
  }
}

export async function rejectKingFolderIfThresholdReached(
  tx: Prisma.TransactionClient,
  folderId: string,
  spaceId: string
) {
  const [memberCount, votes, folder] = await Promise.all([
    tx.spaceMember.count({ where: { spaceId } }),
    tx.spaceFolderVote.count({ where: { folderId } }),
    tx.spaceFolder.findUnique({ where: { id: folderId } }),
  ]);

  if (!folder || folder.visibility !== 'KING') {
    return { rejected: false };
  }

  const threshold = Math.ceil(memberCount / 2);
  if (votes < threshold) {
    return { rejected: false, threshold, votes };
  }

  const folderPrefix = `${folder.path}/`;
  const parentPath = folder.path.split('/').slice(0, -1).join('/') || '/';

  const [kingFiles, kingSecrets, userFiles, userSecrets, childFolders] = await Promise.all([
    tx.kingFile.findMany({
      where: {
        spaceId,
        OR: [{ folderPath: folder.path }, { folderPath: { startsWith: folderPrefix } }],
      },
      select: { id: true, folderPath: true },
    }),
    tx.kingSecret.findMany({
      where: {
        spaceId,
        OR: [{ folderPath: folder.path }, { folderPath: { startsWith: folderPrefix } }],
      },
      select: { id: true, folderPath: true },
    }),
    tx.userFile.findMany({
      where: {
        member: { spaceId },
        kingFileId: { not: null },
        OR: [{ folderPath: folder.path }, { folderPath: { startsWith: folderPrefix } }],
      },
      select: { id: true, folderPath: true },
    }),
    tx.userSecret.findMany({
      where: {
        member: { spaceId },
        kingSecretId: { not: null },
        OR: [{ folderPath: folder.path }, { folderPath: { startsWith: folderPrefix } }],
      },
      select: { id: true, folderPath: true },
    }),
    tx.spaceFolder.findMany({
      where: {
        spaceId,
        visibility: 'KING',
        OR: [{ path: folder.path }, { path: { startsWith: folderPrefix } }],
      },
      select: { id: true, path: true },
    }),
  ]);

  const remapPath = (value: string) => normalizeSpacePath(value.replace(folder.path, parentPath === '/' ? '' : parentPath) || '/');

  await Promise.all([
    ...kingFiles.map((item) =>
      tx.kingFile.update({ where: { id: item.id }, data: { folderPath: remapPath(item.folderPath) } })
    ),
    ...kingSecrets.map((item) =>
      tx.kingSecret.update({ where: { id: item.id }, data: { folderPath: remapPath(item.folderPath) } })
    ),
    ...userFiles.map((item) =>
      tx.userFile.update({ where: { id: item.id }, data: { folderPath: remapPath(item.folderPath) } })
    ),
    ...userSecrets.map((item) =>
      tx.userSecret.update({ where: { id: item.id }, data: { folderPath: remapPath(item.folderPath) } })
    ),
  ]);

  if (childFolders.length > 0) {
    await tx.spaceFolder.deleteMany({
      where: { id: { in: childFolders.map((item) => item.id) } },
    });
  }

  return { rejected: true, threshold, votes };
}
