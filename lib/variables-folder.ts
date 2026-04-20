import { Prisma, PrismaClient } from '@prisma/client';
import {
  ENV_FOLDER_NAME,
  LEGACY_VARIABLES_FOLDER_NAME,
  isCanonicalEnvFolderName,
  isSystemFolderName,
} from '@/lib/system-folder';

export const VARIABLES_FOLDER_NAME = ENV_FOLDER_NAME;

export function isVariablesFolderName(name: string) {
  return isSystemFolderName(name);
}

type DbLike = PrismaClient | Prisma.TransactionClient;

export async function findVariablesFolder(db: DbLike, environmentId: string, parentId: string | null) {
  const folders = await db.folder.findMany({
    where: {
      environmentId,
      parentId,
      OR: [
        {
          name: {
            equals: VARIABLES_FOLDER_NAME,
            mode: 'insensitive',
          },
        },
        {
          name: {
            equals: LEGACY_VARIABLES_FOLDER_NAME,
            mode: 'insensitive',
          },
        },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });

  return folders.find((folder) => isCanonicalEnvFolderName(folder.name)) ?? folders[0] ?? null;
}

export async function ensureVariablesFolder(db: DbLike, environmentId: string, parentId: string | null) {
  const existing = await findVariablesFolder(db, environmentId, parentId);
  if (existing) {
    return { folder: existing, created: false } as const;
  }

  const created = await db.folder.create({
    data: {
      name: VARIABLES_FOLDER_NAME,
      environmentId,
      parentId,
    },
  });

  return { folder: created, created: true } as const;
}

export async function resolveSecretTargetFolder(db: DbLike, environmentId: string, requestedFolderId: string | null) {
  if (!requestedFolderId) {
    const { folder: rootVariablesFolder, created } = await ensureVariablesFolder(db, environmentId, null);
    return {
      targetFolderId: rootVariablesFolder.id,
      requestedFolder: null,
      autoCreatedVariablesFolder: created,
      migratedToVariablesFolder: true,
    } as const;
  }

  const requestedFolder = await db.folder.findUnique({
    where: { id: requestedFolderId },
    select: { id: true, name: true, environmentId: true, parentId: true },
  });

  if (!requestedFolder || requestedFolder.environmentId !== environmentId) {
    throw new Error('Invalid folder');
  }

  if (isVariablesFolderName(requestedFolder.name)) {
    return {
      targetFolderId: requestedFolder.id,
      requestedFolder,
      autoCreatedVariablesFolder: false,
      migratedToVariablesFolder: false,
    } as const;
  }

  const { folder: variablesFolder, created } = await ensureVariablesFolder(
    db,
    environmentId,
    requestedFolder.id
  );

  return {
    targetFolderId: variablesFolder.id,
    requestedFolder,
    autoCreatedVariablesFolder: created,
    migratedToVariablesFolder: true,
  } as const;
}
